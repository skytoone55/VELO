import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const adminClient = createAdminClient()

    const { data: depots, error } = await adminClient
      .from('depots')
      .select('id, nom, type, actif')
      .eq('actif', true)
      .order('nom')

    if (error) throw error

    return NextResponse.json(depots || [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
