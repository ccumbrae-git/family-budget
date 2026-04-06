export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('family_id').eq('id', user.id).single()
  const familyId = profile?.family_id ?? null

  const { suggestions } = await req.json()

  const upserts = suggestions.map((s: { category_id: string; suggested_limit: number }) => ({
    user_id: user.id,
    family_id: familyId,
    category_id: s.category_id,
    monthly_limit: s.suggested_limit,
    alert_at_percent: 80
  }))

  const { error } = await supabase
    .from('budgets')
    .upsert(upserts, { onConflict: 'user_id,category_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ applied: upserts.length })
}
