export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseCSV } from '@/lib/csv-parser'
import { categoriseTransactions } from '@/lib/categorise'
import { Bank } from '@/lib/types'

function isTransferDescription(desc: string): boolean {
  const d = desc.toLowerCase()
  return d.startsWith('transfer to') || d.startsWith('transfer from') ||
    d.startsWith('payment to') || d.startsWith('payment from') ||
    d.startsWith('direct credit') || d.includes('osko') ||
    d.includes('pay anyone') || d.includes('credit card payment') ||
    d.includes('loan repayment') || d.includes('home loan') ||
    d.includes('savings transfer')
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()

  // Verify auth
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const bank = formData.get('bank') as Bank
  const accountId = formData.get('accountId') as string

  if (!file || !bank || !accountId) {
    return NextResponse.json({ error: 'Missing file, bank, or accountId' }, { status: 400 })
  }

  const csvText = await file.text()
  const { transactions, error } = parseCSV(csvText, bank)

  if (error) return NextResponse.json({ error }, { status: 400 })

  // Fetch all categories from DB for lookup
  const { data: dbCategories } = await supabase.from('categories').select('*')
  const cats = dbCategories || []
  const catMap = new Map(cats.map(c => [`${c.name.toLowerCase()}|${c.subcategory.toLowerCase()}`, c.id]))

  // AI categorisation (non-fatal — falls back to uncategorised if it fails)
  let categories: Awaited<ReturnType<typeof categoriseTransactions>> = []
  try {
    categories = await categoriseTransactions(transactions, cats)
  } catch (err) {
    console.error('Categorisation failed, importing uncategorised:', err)
  }

  // Build transaction rows
  const rows = transactions.map((t, i) => {
    const cat = categories.find(c => c.transactionIndex === i)
    const key = cat ? `${cat.category.toLowerCase()}|${cat.subcategory.toLowerCase()}` : null
    const categoryId = key ? catMap.get(key) : null
    return {
      account_id: accountId,
      user_id: user.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      category_id: categoryId || null,
      merchant: cat?.merchant || null,
      raw_description: t.description,
      is_transfer: cat?.isTransfer || isTransferDescription(t.description),
    }
  })

  // Insert (skip duplicates by date+description+amount)
  const { data: inserted, error: insertError } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'account_id,date,description,amount', ignoreDuplicates: true })
    .select('id')

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Auto-set budgets on first upload
  const budgetsApplied = await autoSetBudgetsIfNone(supabase, user.id)

  // Check budgets and send alerts after import
  await checkAndSendAlerts(supabase, user.id)

  return NextResponse.json({
    imported: rows.length,
    budgetsApplied,
    message: budgetsApplied > 0
      ? `Imported ${rows.length} transactions and set ${budgetsApplied} budgets from your history`
      : `Successfully imported ${rows.length} transactions`
  })
}

async function autoSetBudgetsIfNone(supabase: ReturnType<typeof createServiceClient>, userId: string): Promise<number> {
  // Only run if user has no budgets yet
  const { data: existing } = await supabase.from('budgets').select('id').eq('user_id', userId).limit(1)
  if (existing && existing.length > 0) return 0

  // Get user's family_id
  const { data: profile } = await supabase.from('profiles').select('family_id').eq('id', userId).single()
  const familyId = profile?.family_id ?? null

  // Get all distinct months with transactions for this user
  const { data: txMonths } = await supabase
    .from('transactions')
    .select('date')
    .eq('user_id', userId)
    .lt('amount', 0)
    .order('date', { ascending: true })

  if (!txMonths?.length) return 0

  const monthSet = new Set(txMonths.map(t => t.date.slice(0, 7)))
  const months = Array.from(monthSet)

  // Aggregate spend per category across all months
  const spendByCategory = new Map<string, { name: string; subcategory: string; total: number; months: number }>()

  for (const month of months) {
    const { data } = await supabase.rpc('get_monthly_spend', { p_user_id: userId, p_month: month })
    for (const row of (data || [])) {
      const existing = spendByCategory.get(row.category_id)
      if (existing) {
        existing.total += row.total
        existing.months++
      } else {
        spendByCategory.set(row.category_id, { name: row.category_name, subcategory: row.subcategory, total: row.total, months: 1 })
      }
    }
  }

  if (spendByCategory.size === 0) return 0

  // Build budgets: avg monthly spend + 10% buffer, rounded to nearest $10
  const upserts = Array.from(spendByCategory.entries()).map(([categoryId, v]) => ({
    user_id: userId,
    family_id: familyId,
    category_id: categoryId,
    monthly_limit: Math.ceil((v.total / v.months) * 1.1 / 10) * 10,
    alert_at_percent: 80
  }))

  const { error } = await supabase.from('budgets').upsert(upserts, { onConflict: 'user_id,category_id' })
  if (error) return 0

  return upserts.length
}

async function checkAndSendAlerts(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*, categories(*)')
    .eq('user_id', userId)

  if (!budgets?.length) return

  const { data: spendData } = await supabase.rpc('get_monthly_spend', {
    p_user_id: userId,
    p_month: month
  })

  const spendMap = new Map<string, number>((spendData || []).map((s: { category_id: string; total: number }) => [s.category_id, s.total]))

  for (const budget of budgets) {
    const catId = String(budget.category_id)
    const spent: number = spendMap.get(catId) ?? 0
    const limit: number = Number(budget.monthly_limit)
    const alertPercent: number = Number(budget.alert_at_percent ?? 80)
    const percent: number = limit > 0 ? (spent / limit) * 100 : 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const budgetRecord = budget as Record<string, any>
    if (percent >= 100) {
      await sendBudgetAlert(supabase, userId, budgetRecord, month, 'over_budget', spent)
    } else if (percent >= alertPercent) {
      await sendBudgetAlert(supabase, userId, budgetRecord, month, '80_percent', spent)
    }
  }
}

async function sendBudgetAlert(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  budget: Record<string, unknown>,
  month: string,
  alertType: string,
  spent: number
) {
  // Check if already sent
  const { data: existing } = await supabase
    .from('budget_alerts')
    .select('id')
    .eq('budget_id', budget.id)
    .eq('month', month)
    .eq('alert_type', alertType)
    .single()

  if (existing) return

  // Get push subscriptions
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)

  if (!subs?.length) return

  const cat = budget.categories as { name: string; subcategory: string } | null
  const catName = cat ? `${cat.name} - ${cat.subcategory}` : 'Budget'
  const title = alertType === 'over_budget' ? '🚨 Budget exceeded!' : '⚠️ Budget warning'
  const limit = Number(budget.monthly_limit)
  const body = alertType === 'over_budget'
    ? `You've exceeded your ${catName} budget ($${spent.toFixed(0)} / $${limit.toFixed(0)})`
    : `You've used ${Math.round((spent / limit) * 100)}% of your ${catName} budget this month`

  // Send push notifications
  try {
    const webpush = await import('web-push')
    webpush.default.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    await Promise.allSettled(
      subs.map(sub =>
        webpush.default.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, icon: '/icon-192.png' })
        )
      )
    )
  } catch {}

  // Record alert sent
  await supabase.from('budget_alerts').insert({
    user_id: userId,
    budget_id: budget.id,
    month,
    alert_type: alertType
  })
}
