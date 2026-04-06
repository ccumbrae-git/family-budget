export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { categoriseTransactions } from '@/lib/categorise'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: txs } = await supabase
    .from('transactions')
    .select('id, description, amount, merchant')
    .eq('user_id', user.id)
    .is('category_id', null)
    .limit(50)

  if (!txs?.length) return NextResponse.json({ updated: 0 })

  const { data: dbCategories } = await supabase.from('categories').select('*')
  const cats = dbCategories || []

  // Case-insensitive lookup map
  const catMap = new Map(cats.map(c => [`${c.name.toLowerCase()}|${c.subcategory.toLowerCase()}`, c.id]))

  const parsed = txs.map(t => ({ date: '', description: t.description, amount: t.amount }))
  const results = await categoriseTransactions(parsed, cats)

  let updated = 0
  for (const cat of results) {
    const tx = txs[cat.transactionIndex]
    if (!tx) continue
    const key = `${cat.category.toLowerCase()}|${cat.subcategory.toLowerCase()}`
    const categoryId = catMap.get(key)
    if (!categoryId) continue
    await supabase
      .from('transactions')
      .update({ category_id: categoryId, merchant: cat.merchant || tx.merchant })
      .eq('id', tx.id)
    updated++
  }

  return NextResponse.json({ updated })
}
