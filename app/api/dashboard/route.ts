export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month = searchParams.get('month') || defaultMonth

  // Get user's family_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .single()

  const familyId = profile?.family_id

  // Monthly spend by category (family-aware)
  let spend: { category_id: string; category_name: string; subcategory: string; total: number }[] = []
  if (familyId) {
    const { data } = await supabase.rpc('get_family_monthly_spend', {
      p_family_id: familyId,
      p_month: month
    })
    spend = data || []
  } else {
    const { data } = await supabase.rpc('get_monthly_spend', {
      p_user_id: user.id,
      p_month: month
    })
    spend = data || []
  }

  // Budgets (family-aware)
  const budgetQuery = supabase.from('budgets').select('*, categories(*)')
  const { data: budgets } = familyId
    ? await budgetQuery.eq('family_id', familyId)
    : await budgetQuery.eq('user_id', user.id)

  const totalSpend = spend.reduce((sum, s) => sum + s.total, 0)

  // Recent transactions (family-aware)
  const start = `${month}-01`
  const end = `${month}-31`
  let recentQuery = supabase
    .from('transactions')
    .select('*, categories(*)')
    .gte('date', start)
    .lte('date', end)
    .lt('amount', 0)
    .order('date', { ascending: false })
    .limit(5)

  if (familyId) {
    // Get all user_ids in the family
    const { data: members } = await supabase
      .from('profiles')
      .select('id')
      .eq('family_id', familyId)
    const memberIds = (members || []).map(m => m.id)
    recentQuery = recentQuery.in('user_id', memberIds)
  } else {
    recentQuery = recentQuery.eq('user_id', user.id)
  }

  const { data: recent } = await recentQuery

  // Top vendors by spend this month
  let vendorQuery = supabase
    .from('transactions')
    .select('merchant, description, amount')
    .gte('date', start)
    .lte('date', end)
    .lt('amount', 0)
    .not('merchant', 'is', null)

  if (familyId) {
    const { data: members } = await supabase.from('profiles').select('id').eq('family_id', familyId)
    const memberIds = (members || []).map((m: { id: string }) => m.id)
    vendorQuery = vendorQuery.in('user_id', memberIds)
  } else {
    vendorQuery = vendorQuery.eq('user_id', user.id)
  }

  const { data: vendorTx } = await vendorQuery
  const vendorMap = new Map<string, number>()
  for (const tx of vendorTx || []) {
    const key = tx.merchant || tx.description
    vendorMap.set(key, (vendorMap.get(key) || 0) + Math.abs(tx.amount))
  }
  const topVendors = Array.from(vendorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, total]) => ({ name, total }))

  // Previous month spend (for comparisons)
  const [prevYear, prevMonthNum] = month.split('-').map(Number)
  const prevDate = new Date(prevYear, prevMonthNum - 2, 1)
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
  let prevSpend: { category_id: string; category_name: string; subcategory: string; total: number }[] = []
  if (familyId) {
    const { data } = await supabase.rpc('get_family_monthly_spend', { p_family_id: familyId, p_month: prevMonth })
    prevSpend = data || []
  } else {
    const { data } = await supabase.rpc('get_monthly_spend', { p_user_id: user.id, p_month: prevMonth })
    prevSpend = data || []
  }

  // Monthly spend trend (last 6 months)
  const trend = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let ms: { total: number }[] = []
    if (familyId) {
      const { data } = await supabase.rpc('get_family_monthly_spend', {
        p_family_id: familyId,
        p_month: m
      })
      ms = data || []
    } else {
      const { data } = await supabase.rpc('get_monthly_spend', {
        p_user_id: user.id,
        p_month: m
      })
      ms = data || []
    }
    trend.push({
      month: m,
      label: d.toLocaleString('en-AU', { month: 'short' }),
      total: ms.reduce((sum, s) => sum + s.total, 0)
    })
  }

  return NextResponse.json({
    month,
    totalSpend,
    spend,
    prevSpend,
    budgets: budgets || [],
    topVendors,
    trend,
    isFamily: !!familyId
  })
}
