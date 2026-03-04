import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * API pour récupérer les données de la carte (dépôts et clients)
 * Utilise le client admin pour bypasser RLS
 *
 * GET /api/admin/map/data
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier les permissions (admin uniquement)
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin_general', 'admin_regional'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Récupérer tous les dépôts actifs
    const { data: depots, error: depotsError } = await adminClient
      .from('depots')
      .select('*')
      .eq('actif', true)
      .order('nom')

    if (depotsError) {
      console.error('Erreur chargement dépôts:', depotsError)
      return NextResponse.json({ error: 'Erreur lors du chargement des dépôts' }, { status: 500 })
    }

    // Récupérer TOUS les clients par batches (Supabase limite à 1000 par défaut)
    const BATCH_SIZE = 1000
    const clientFields = 'id, raison_sociale, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, latitude, longitude, agence, departement, depot_retrait_id, depot_logistique_id, velo_devis, velo_valide, statut_commercial, code_enemat_valide, monday_board_id'
    let allClients: any[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: batch, error: clientsError } = await adminClient
        .from('clients')
        .select(clientFields)
        .range(offset, offset + BATCH_SIZE - 1)

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
        velos_count: depotClients.reduce((sum, c) => sum + (c.velo_valide || 0), 0),
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
