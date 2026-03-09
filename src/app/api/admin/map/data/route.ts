import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * API pour récupérer les données de la carte (dépôts et clients)
 * Utilise le client admin pour bypasser RLS
 *
 * GET /api/admin/map/data
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const adminClient = createAdminClient()

    // Récupérer les dépôts (filtrés pour agent_secteur)
    let depotsQuery = adminClient
      .from('depots')
      .select('*')
      .eq('actif', true)
      .order('nom')

    if (authResult.role === 'agent_secteur' && authResult.depot_ids?.length) {
      depotsQuery = depotsQuery.in('id', authResult.depot_ids)
    }

    const { data: depots, error: depotsError } = await depotsQuery

    if (depotsError) {
      console.error('Erreur chargement dépôts:', depotsError)
      return NextResponse.json({ error: 'Erreur lors du chargement des dépôts' }, { status: 500 })
    }

    // Récupérer TOUS les clients par batches (Supabase limite à 1000 par défaut)
    const BATCH_SIZE = 1000
    const clientFields = 'id, raison_sociale, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, latitude, longitude, agence, departement, depot_retrait_id, depot_logistique_id, velo_devis, velo_valide, statut_commercial, validation_naf, monday_board_id'
    let allClients: any[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      let clientQuery = adminClient
        .from('clients')
        .select(clientFields)
        .range(offset, offset + BATCH_SIZE - 1)

      // Agent secteur ne voit que les clients de son territoire/département
      if (authResult.role === 'agent_secteur') {
        const dept = authResult.departement || authResult.territoire
        if (dept) clientQuery = clientQuery.eq('departement', dept)
      }

      const { data: batch, error: clientsError } = await clientQuery

      if (clientsError) {
        console.error('Erreur chargement clients:', clientsError)
        return NextResponse.json({ error: 'Erreur lors du chargement des clients' }, { status: 500 })
      }

      allClients = allClients.concat(batch || [])
      hasMore = (batch?.length || 0) === BATCH_SIZE
      offset += BATCH_SIZE
    }

    const clients = allClients

    // Calculer le nombre de clients et vélos par dépôt
    const depotsWithCounts = (depots || []).map(depot => {
      const depotClients = (clients || []).filter(
        c => c.depot_retrait_id === depot.id || c.depot_logistique_id === depot.id
      )
      return {
        ...depot,
        clients_count: depotClients.length,
        velos_count: depotClients.reduce((sum: number, c: any) => sum + (c.velo_valide || 0), 0),
      }
    })

    return NextResponse.json({
      success: true,
      depots: depotsWithCounts,
      clients: clients || [],
    })

  } catch (error: any) {
    console.error('Erreur API map/data:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
