import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/planning/search?q=xxx&depot=UUID
 * Recherche clients à livrer pour le planning (bypass RLS)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const depotId = searchParams.get('depot')

    if (query.length < 2) {
      return NextResponse.json({ clients: [] })
    }

    const adminClient = createAdminClient()

    let q = adminClient
      .from('clients')
      .select('id, raison_sociale, velo_devis, velo_valide, telephone, email, statut_commercial, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville')
      .eq('statut_commercial', 'a_livrer')
      .or(`raison_sociale.ilike.%${query}%,telephone.ilike.%${query}%,email.ilike.%${query}%`)

    if (depotId) {
      q = q.or(`depot_logistique_id.eq.${depotId},depot_retrait_id.eq.${depotId}`)
    }

    const { data, error } = await q.limit(10)

    if (error) {
      console.error('Erreur search planning:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ clients: data || [] })
  } catch (error) {
    console.error('Erreur API planning search:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
