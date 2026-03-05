import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/clients/commercials
 * Retourne les valeurs distinctes de commerciaux pour le filtre dropdown.
 * Ecovolt : emails commerciaux (champ email = EmailAgent_RETINA)
 * PPE : n'utilise pas cette route (options statiques côté client)
 */
export async function GET() {
  try {
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('clients')
      .select('email')
      .not('email', 'is', null)
      .not('monday_sync_status', 'eq', 'deleted')

    if (error) throw error

    const emails = [...new Set(data?.map(d => d.email).filter(Boolean))].sort()

    return NextResponse.json(emails)
  } catch (error) {
    console.error('Erreur récupération commerciaux:', error)
    return NextResponse.json([], { status: 500 })
  }
}
