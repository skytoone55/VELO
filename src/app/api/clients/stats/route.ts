import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * API pour obtenir les statistiques globales des clients depuis Supabase
 *
 * GET /api/clients/stats - Retourne les stats agrégées
 */

export async function GET() {
  try {
    const adminClient = createAdminClient()

    // Requête pour les stats par statut commercial
    const { data: clients, error } = await adminClient
      .from('clients')
      .select('statut_commercial, velo_valide, velo_devis')
      .not('monday_sync_status', 'eq', 'deleted')

    if (error) {
      throw error
    }

    // Calculer les stats
    const statsByStatut: Record<string, { clients: number; velos: number }> = {}
    let velosValides = 0
    let velosLivres = 0

    for (const client of clients || []) {
      const statut = client.statut_commercial || 'Inconnu'
      const velos = client.velo_valide || client.velo_devis || 0

      // Initialiser si premier client avec ce statut
      if (!statsByStatut[statut]) {
        statsByStatut[statut] = { clients: 0, velos: 0 }
      }

      // Incrémenter
      statsByStatut[statut].clients++
      statsByStatut[statut].velos += velos

      // Stats globales
      velosValides += velos
      if (statut === 'LIVRÉ') {
        velosLivres += velos
      }
    }

    // Dernière sync
    const { data: lastSync } = await adminClient
      .from('sync_monday_log')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      total: clients?.length || 0,
      velosValides,
      velosLivres,
      statsByStatut,
      lastSync: lastSync?.created_at || null,
      source: 'supabase',
    })

  } catch (error: any) {
    console.error('Erreur récupération stats Supabase:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Supabase' },
      { status: 500 }
    )
  }
}
