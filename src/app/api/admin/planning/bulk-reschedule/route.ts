import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/planning/bulk-reschedule
 * Remet en masse toutes les livraisons non livrées d'une journée à 'a_livrer'.
 * Body: { date: 'YYYY-MM-DD', depot_id?: string }
 * - Reset livraisons (tournee_id, tournee_position, date_programmation,
 *   creneau_date, creneau_heure_debut, creneau_heure_fin, livreur_id, statut='a_livrer')
 * - Reset clients liés -> statut_commercial='a_livrer'
 * - Ne supprime pas les tournees (trace historique conservée)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const { date, depot_id: depotId } = body as { date?: string; depot_id?: string }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date requise au format YYYY-MM-DD' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // 1. Cibler les livraisons concernées (filtrage RBAC + date + non livrées)
    let selectQuery = adminClient
      .from('livraisons')
      .select('id, client_id, depot_id')
      .eq('creneau_date', date)
      .neq('statut', 'livree')
      .neq('statut', 'annulee')

    if (depotId) selectQuery = selectQuery.eq('depot_id', depotId)

    if (auth.role === 'agent_secteur') {
      const allowed = auth.depot_ids || []
      if (allowed.length === 0) {
        return NextResponse.json({ count_basculés: 0, client_ids: [] })
      }
      selectQuery = selectQuery.in('depot_id', allowed)
    }

    const { data: targets, error: fetchErr } = await selectQuery
    if (fetchErr) {
      console.error('Erreur fetch livraisons bulk-reschedule:', fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    const livraisonIds = (targets || []).map(r => r.id)
    const clientIds = [...new Set((targets || []).map(r => r.client_id).filter((id): id is string => !!id))]

    if (livraisonIds.length === 0) {
      return NextResponse.json({ count_basculés: 0, client_ids: [] })
    }

    const now = new Date().toISOString()

    // 2. Batch update livraisons
    const { error: updateLivErr } = await adminClient
      .from('livraisons')
      .update({
        tournee_id: null,
        tournee_position: null,
        date_programmation: null,
        creneau_date: null,
        creneau_heure_debut: null,
        creneau_heure_fin: null,
        livreur_id: null,
        statut: 'a_livrer',
        updated_at: now,
      })
      .in('id', livraisonIds)

    if (updateLivErr) {
      console.error('Erreur update livraisons bulk-reschedule:', updateLivErr)
      return NextResponse.json({ error: updateLivErr.message }, { status: 500 })
    }

    // 3. Batch update clients
    if (clientIds.length > 0) {
      const { error: updateClientErr } = await adminClient
        .from('clients')
        .update({
          statut_commercial: 'a_livrer',
          date_statut: now,
          updated_at: now,
        })
        .in('id', clientIds)

      if (updateClientErr) {
        console.error('Erreur update clients bulk-reschedule:', updateClientErr)
        return NextResponse.json({ error: updateClientErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({ count_basculés: livraisonIds.length, client_ids: clientIds })
  } catch (error) {
    console.error('Erreur API bulk-reschedule:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
