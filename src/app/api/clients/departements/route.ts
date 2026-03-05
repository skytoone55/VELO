import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/clients/departements
 * Retourne les valeurs distinctes de départements pour le filtre dropdown.
 * PPE : codes département français (75, 93, 44, etc.) — dynamique
 * Ecovolt : n'utilise pas cette route (options statiques côté client)
 */
export async function GET() {
  try {
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('clients')
      .select('departement')
      .not('departement', 'is', null)
      .not('monday_sync_status', 'eq', 'deleted')

    if (error) throw error

    const depts = [...new Set(data?.map(d => d.departement).filter(Boolean))].sort()

    return NextResponse.json(depts)
  } catch (error) {
    console.error('Erreur récupération départements:', error)
    return NextResponse.json([], { status: 500 })
  }
}
