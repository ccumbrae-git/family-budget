export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get last 3 months of spend data per category
  const now = new Date()
  const months = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i - 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const spendByCategory = new Map<string, { name: string; subcategory: string; total: number; months: number }>()

  for (const month of months) {
    const { data } = await supabase.rpc('get_monthly_spend', {
      p_user_id: user.id,
      p_month: month
    })
    for (const row of (data || [])) {
      const existing = spendByCategory.get(row.category_id)
      if (existing) {
        existing.total += row.total
        existing.months++
      } else {
        spendByCategory.set(row.category_id, {
          name: row.category_name,
          subcategory: row.subcategory,
          total: row.total,
          months: 1
        })
      }
    }
  }

  // Average monthly spend + 10% buffer
  const suggestions = Array.from(spendByCategory.entries())
    .filter(([categoryId, v]) => categoryId !== 'null' && categoryId && v.name && v.subcategory)
    .map(([categoryId, v]) => ({
      category_id: categoryId,
      category_name: v.name,
      subcategory: v.subcategory,
      suggested_limit: Math.ceil((v.total / v.months) * 1.1 / 10) * 10, // round up to nearest $10
      avg_monthly: Math.round(v.total / v.months)
    }))
    .sort((a, b) => b.avg_monthly - a.avg_monthly)

  return NextResponse.json(suggestions)
}
