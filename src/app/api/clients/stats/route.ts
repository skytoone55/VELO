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

    // Mapping snake_case -> Affichage pour les clés de statut
    const statutDisplayMap: Record<string, string> = {
      'dossier_complet': 'DOSSIER COMPLET',
      'devis_signe': 'DEVIS SIGNÉ',
      'devis_cree': 'DEVIS CREE',
      'controle_valide': 'CONTROLE VALIDÉ',
      'controle_a_regulariser': 'CONTROLE A REGULARISER',
      'controle_a_jour': 'CONTROLE A JOUR',
      'client_contacte': 'CLIENT CONTACTÉ',
      'client_injoignable': 'CLIENT INJOIGNABLE',
      'client_hs': 'CLIENT HS',
      'ah_signee': 'AH SIGNÉE',
      'livre': 'LIVRÉ',
      'paye': 'PAYÈ',
      'doublon': 'DOUBLON',
    }

    // Calculer les stats
    const statsByStatut: Record<string, { clients: number; velos: number }> = {}
    let velosValides = 0
    let velosDevis = 0
    let velosLivres = 0

    for (const client of clients || []) {
      const statutRaw = client.statut_commercial || 'Inconnu'
      // Convertir en clé d'affichage si mapping existe
      const statut = statutDisplayMap[statutRaw] || statutRaw

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

      // Stats globales
      velosValides += velosV
      velosDevis += velosD
      if (statut === 'LIVRÉ') {
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
