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

    // Agent : vérifier que le dépôt demandé est dans ses dépôts assignés
    if (auth.role === 'agent_secteur' && depotId) {
      const allowed = auth.depot_ids || []
      if (!allowed.includes(depotId)) {
        return NextResponse.json({ error: 'Accès refusé à ce dépôt' }, { status: 403 })
      }
    }

    if (query.length < 2) {
      return NextResponse.json({ clients: [] })
    }

    const adminClient = createAdminClient()

    const q = adminClient
      .from('clients')
      .select('id, raison_sociale, velo_devis, velo_valide, telephone, email, statut_commercial, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, depot_logistique_id, depot_retrait_id')
      .eq('statut_commercial', 'a_livrer')
      .or(`raison_sociale.ilike.%${query}%,telephone.ilike.%${query}%,email.ilike.%${query}%`)

    const { data, error } = await q.limit(50)

    if (error) {
      console.error('Erreur search planning:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filtrer par depot côté JS (évite les problèmes de double .or() PostgREST)
    let results = data || []
    if (depotId) {
      results = results.filter(c => c.depot_logistique_id === depotId || c.depot_retrait_id === depotId)
    }

    return NextResponse.json({ clients: results.slice(0, 10) })
  } catch (error) {
    console.error('Erreur API planning search:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
