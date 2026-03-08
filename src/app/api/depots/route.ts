import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/depots
 * Retourne la liste des dépôts actifs (id, nom)
 * Utilisé par les filtres dropdown (livraisons, planning, etc.)
 */
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
