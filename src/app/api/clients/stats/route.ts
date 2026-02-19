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
    // IMPORTANT: Supabase limite à 1000 par défaut, on doit paginer
    let allClients: any[] = []
    let page = 0
    const pageSize = 1000

    while (true) {
      const { data: clients, error } = await adminClient
        .from('clients')
        .select('statut_commercial, velo_valide, velo_devis')
        .not('monday_sync_status', 'eq', 'deleted')
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) throw error
      if (!clients || clients.length === 0) break

      allClients = allClients.concat(clients)
      if (clients.length < pageSize) break
      page++
    }

    const clients = allClients

    // Normalisation des statuts : fusion des variantes orthographiques
    // (certains boards Monday ont "CONTROL VALIDER" au lieu de "CONTROL VALIDÉ", etc.)
    const statutNormalizationMap: Record<string, string> = {
      'CONTROL VALIDER': 'CONTROL VALIDÉ',
      'CONTROLE VALIDER': 'CONTROL VALIDÉ',
      'CONTROLE VALIDÉ': 'CONTROL VALIDÉ',
      'DEVIS SIGNE': 'DEVIS SIGNÉ',
      'DEVIS ENVOYE': 'DEVIS ENVOYÉ',
      'DEVIS CREER': 'DEVIS CRÉÉ',
      'DEVIS CREE': 'DEVIS CRÉÉ',
    }

    // Statuts à exclure du compteur "Vélos validés" global
    // (ces statuts sont en attente, pas encore réellement validés)
    const statutsExclusVelosValides = new Set([
      'ATTENTE DOCUMENT',
      'RELANCE DEVIS',
      'DEVIS ENVOYÉ',
      'DEVIS CRÉÉ',
      'NEW',
      'HS',
      'RETRACTATION',
      // ECO-VOLT statuts (snake_case)
      'client_hs',
      'doublon',
      'client_injoignable',
    ])

    // Calculer les stats
    const statsByStatut: Record<string, { clients: number; velos: number }> = {}
    let velosValides = 0
    let velosDevis = 0
    let velosLivres = 0

    for (const client of clients || []) {
      const statutRaw = client.statut_commercial || 'Inconnu'
      // Normaliser le statut (fusion des variantes)
      const statut = statutNormalizationMap[statutRaw] || statutRaw

      // Utiliser velo_valide pour les validés, velo_devis séparément
      const velosV = client.velo_valide || 0
      const velosD = client.velo_devis || 0

      // Initialiser si premier client avec ce statut
      if (!statsByStatut[statut]) {
        statsByStatut[statut] = { clients: 0, velos: 0 }
      }

      // Incrémenter - utiliser velo_valide pour les stats par statut
      statsByStatut[statut].clients++
      statsByStatut[statut].velos += velosV || velosD // fallback sur devis si pas de validé

      // Stats globales - exclure certains statuts du compteur vélos validés
      if (!statutsExclusVelosValides.has(statut)) {
        velosValides += velosV
      }
      velosDevis += velosD

      // Vélos livrés
      const statutUpper = statut.toUpperCase()
      if (statutUpper === 'LIVRÉ' || statutUpper === 'LIVRE' || statut === 'livre') {
        velosLivres += velosV || velosD
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
      velosDevis,
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
