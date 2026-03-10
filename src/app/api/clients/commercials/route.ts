import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * GET /api/clients/commercials
 * Retourne les valeurs distinctes de commerciaux pour le filtre dropdown.
 * Ecovolt : emails commerciaux (champ email = EmailAgent_RETINA)
 * PPE : n'utilise pas cette route (options statiques côté client)
 */
export async function GET() {
  const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
  if (isAuthError(auth)) return auth

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
