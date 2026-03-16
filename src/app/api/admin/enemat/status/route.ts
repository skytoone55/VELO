import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'

const VALID_STATUTS = ['a_deposer_enemat', 'depose_enemat', 'apf_enemat', 'paye_enemat'] as const
type EnematStatut = typeof VALID_STATUTS[number]

// Workflow strict : chaque statut ne peut aller qu'au suivant
const WORKFLOW_ORDER: Record<string, string> = {
  'a_deposer_enemat': 'depose_enemat',
  'depose_enemat': 'apf_enemat',
  'apf_enemat': 'paye_enemat',
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth
    const currentUser = auth as AuthenticatedUser

    const body = await request.json()
    const { client_ids, statut } = body as { client_ids: string[]; statut: string }

    if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
      return NextResponse.json({ error: 'client_ids requis (tableau non vide)' }, { status: 400 })
    }

    if (!statut || !VALID_STATUTS.includes(statut as EnematStatut)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées : ${VALID_STATUTS.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // Récupérer les statuts actuels pour vérifier le workflow
    const { data: currentClients, error: fetchError } = await supabase
      .from('clients')
      .select('id, statut_enemat, raison_sociale')
      .in('id', client_ids)

    if (fetchError) {
      console.error('Erreur PATCH /api/admin/enemat/status (fetch):', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Vérifier que chaque client peut passer au statut demandé (workflow strict)
    const rejected: string[] = []
    const eligible: string[] = []
    for (const c of (currentClients || [])) {
      const nextAllowed = WORKFLOW_ORDER[c.statut_enemat || '']
      if (nextAllowed === statut) {
        eligible.push(c.id)
      } else {
        rejected.push(`${c.raison_sociale} (${c.statut_enemat} → ${statut} interdit)`)
      }
    }

    if (eligible.length === 0) {
      return NextResponse.json({
        error: `Aucun client éligible. Le workflow doit être respecté : A déposer → Déposé → APF → Payé`,
        rejected,
      }, { status: 400 })
    }

    // Construire l'update avec les dates conditionnelles
    const updatePayload: Record<string, unknown> = {
      statut_enemat: statut,
      updated_at: now,
    }

    if (statut === 'depose_enemat') {
      updatePayload.date_depot_enemat = now
    } else if (statut === 'apf_enemat') {
      updatePayload.date_apf_enemat = now
    } else if (statut === 'paye_enemat') {
      updatePayload.date_paye_enemat = now
    }

    // Mettre à jour uniquement les clients éligibles
    const { data: updated, error: updateError } = await supabase
      .from('clients')
      .update(updatePayload)
      .in('id', eligible)
      .select('id, raison_sociale, statut_enemat, date_depot_enemat, date_apf_enemat, date_paye_enemat')

    if (updateError) {
      console.error('Erreur PATCH /api/admin/enemat/status (update):', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Historique
    const clientMap = new Map((currentClients || []).map((c: { id: string; statut_enemat: string | null }) => [c.id, c.statut_enemat]))
    const updatedIds = (updated || []).map((r: { id: string }) => r.id)

    if (updatedIds.length > 0) {
      const historyRows = updatedIds.map((clientId: string) => ({
        client_id: clientId,
        statut_avant: clientMap.get(clientId) ?? null,
        statut_apres: statut,
        changed_by: currentUser.id,
        changed_at: now,
      }))

      await supabase.from('enemat_history').insert(historyRows)
    }

    return NextResponse.json({
      success: true,
      count: updatedIds.length,
      clients: updated || [],
      ...(rejected.length > 0 ? { rejected } : {}),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur PATCH /api/admin/enemat/status:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
