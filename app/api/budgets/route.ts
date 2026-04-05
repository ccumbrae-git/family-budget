export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

async function getFamilyId(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await supabase.from('profiles').select('family_id').eq('id', userId).single()
  return data?.family_id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const familyId = await getFamilyId(supabase, user.id)

  const query = supabase.from('budgets').select('*, categories(*)').order('created_at')
  const { data } = familyId
    ? await query.eq('family_id', familyId)
    : await query.eq('user_id', user.id)

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const familyId = await getFamilyId(supabase, user.id)
  const { category_id, monthly_limit, alert_at_percent = 80 } = await req.json()

  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      { user_id: user.id, family_id: familyId, category_id, monthly_limit, alert_at_percent },
      { onConflict: 'user_id,category_id' }
    )
    .select('*, categories(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await supabase.from('budgets').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
