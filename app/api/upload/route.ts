export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseCSV } from '@/lib/csv-parser'
import { categoriseTransactions } from '@/lib/categorise'
import { Bank } from '@/lib/types'

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
  if (transactions.length === 0) return NextResponse.json({ error: 'No transactions found' }, { status: 400 })

  // AI categorisation
  const categories = await categoriseTransactions(transactions)

  // Fetch all categories from DB for lookup
  const { data: dbCategories } = await supabase.from('categories').select('*')
  const catMap = new Map(
    (dbCategories || []).map(c => [`${c.name}|${c.subcategory}`, c.id])
  )

  // Build transaction rows
  const rows = transactions.map((t, i) => {
    const cat = categories.find(c => c.transactionIndex === i)
    const categoryId = cat ? catMap.get(`${cat.category}|${cat.subcategory}`) : null
    return {
      account_id: accountId,
      user_id: user.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      category_id: categoryId || null,
      merchant: cat?.merchant || null,
      raw_description: t.description,
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

  // Check budgets and send alerts after import
  await checkAndSendAlerts(supabase, user.id)

  return NextResponse.json({
    imported: rows.length,
    message: `Successfully imported ${rows.length} transactions`
  })
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
