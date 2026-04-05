export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('categories').select('*').order('name').order('subcategory')
  return NextResponse.json(data || [])
}
