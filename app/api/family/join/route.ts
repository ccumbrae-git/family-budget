export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  // Look up invite
  const { data: invite } = await supabase
    .from('family_invitations')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .single()

  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 })

  // Check user not already in this family
  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .single()

  if (profile?.family_id === invite.family_id) {
    return NextResponse.json({ error: 'Already in this family' }, { status: 400 })
  }

  // Join family
  await supabase.from('profiles').update({ family_id: invite.family_id }).eq('id', user.id)

  // Mark invite as accepted
  await supabase
    .from('family_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ success: true, family_id: invite.family_id })
}
