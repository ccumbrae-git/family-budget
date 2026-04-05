export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's profile to find their family_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id, full_name')
    .eq('id', user.id)
    .single()

  if (!profile?.family_id) return NextResponse.json(null)

  // Get family details
  const { data: family } = await supabase
    .from('families')
    .select('*')
    .eq('id', profile.family_id)
    .single()

  // Get all members
  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('family_id', profile.family_id)

  return NextResponse.json({ ...family, members: members || [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check not already in a family
  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .single()

  if (profile?.family_id) return NextResponse.json({ error: 'Already in a family' }, { status: 400 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Family name required' }, { status: 400 })

  // Create family
  const { data: family, error } = await supabase
    .from('families')
    .insert({ name: name.trim(), owner_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Link user's profile to family
  await supabase.from('profiles').update({ family_id: family.id }).eq('id', user.id)

  return NextResponse.json(family)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Remove family_id from profile (leaves family without deleting it)
  await supabase.from('profiles').update({ family_id: null }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
