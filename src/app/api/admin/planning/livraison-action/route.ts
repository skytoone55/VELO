import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { passerClientHS } from '@/lib/clients/passer-hs'

// Actions livreur depuis le planning, sur une livraison.
// Ouvert a tous les roles internes (les livreurs sont l'echelon le plus bas).
const ACTIONS = ['a_relivrer', 'probleme_livraison', 'retractation'] as const
type LivraisonAction = (typeof ACTIONS)[number]

const ACTION_LABEL: Record<LivraisonAction, string> = {
  a_relivrer: 'À relivrer',
  probleme_livraison: 'Problème de livraison',
  retractation: 'Rétractation',
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
  if (isAuthError(auth)) return auth

  const { livraisonId, action, commentaire } = (await request.json()) as {
    livraisonId?: string
    action?: LivraisonAction
    commentaire?: string
  }

  if (!livraisonId) {
    return NextResponse.json({ error: 'livraisonId requis' }, { status: 400 })
  }
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
  }
  if (!commentaire?.trim()) {
    return NextResponse.json({ error: 'Commentaire obligatoire' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()
  const actorName = auth.email || 'Utilisateur'
  const commentaireClean = commentaire.trim()
  const logEntry = `[${ACTION_LABEL[action]} ${new Date().toLocaleDateString('fr-FR')} par ${actorName}] ${commentaireClean}`

  // Recuperer la livraison + client (avec les notes pour append)
  const { data: livraison, error: fetchError } = await adminClient
    .from('livraisons')
    .select('id, client_id, statut, notes_admin, client:clients(id, statut_commercial, raison_sociale, notes_internes)')
    .eq('id', livraisonId)
    .single()

  if (fetchError || !livraison || !livraison.client_id) {
    return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
  }

  const clientId = livraison.client_id as string
  const client = Array.isArray(livraison.client) ? livraison.client[0] : livraison.client
  const statutAvant = client?.statut_commercial ?? null
  const raisonSociale = client?.raison_sociale ?? ''

  // Commentaire trace sur la livraison : champs dedies + append dans notes_admin (visible carte planning)
  const notesAdmin = (livraison.notes_admin ? livraison.notes_admin + '\n' : '') + logEntry
  const livraisonCommentaire = {
    commentaire_action: commentaireClean,
    commentaire_action_type: action,
    commentaire_action_at: now,
    notes_admin: notesAdmin,
    updated_at: now,
  }

  try {
    if (action === 'retractation') {
      // Trace le commentaire sur la livraison, puis bascule le client en Client HS
      // (passerClientHS annule la/les livraison(s) + log le motif dans notes_internes).
      await adminClient.from('livraisons').update(livraisonCommentaire).eq('id', livraisonId)
      const result = await passerClientHS(adminClient, clientId, commentaireClean, actorName, 'RÉTRACTATION')

      await adminClient.from('workflow_transitions').insert({
        entity_type: 'client',
        entity_id: clientId,
        statut_avant: statutAvant,
        statut_apres: 'client_hs',
        effectue_par: auth.id,
        raison: `Rétractation (planning) — ${raisonSociale} : ${commentaireClean}`,
      })

      return NextResponse.json({
        success: true,
        action,
        newStatut: 'client_hs',
        livraisons_annulees: result.livraisons_annulees,
        fnuci_liberes: result.fnuci_liberes,
      })
    }

    // a_relivrer / probleme_livraison : MEME statut cote client ET cote livraison.
    await adminClient
      .from('livraisons')
      .update({ ...livraisonCommentaire, statut: action })
      .eq('id', livraisonId)

    const notesInternes = (client?.notes_internes ? client.notes_internes + '\n' : '') + logEntry
    await adminClient
      .from('clients')
      .update({
        statut_commercial: action,
        date_statut: now,
        notes_internes: notesInternes,
        updated_at: now,
      })
      .eq('id', clientId)

    await adminClient.from('workflow_transitions').insert({
      entity_type: 'client',
      entity_id: clientId,
      statut_avant: statutAvant,
      statut_apres: action,
      effectue_par: auth.id,
      raison: `${ACTION_LABEL[action]} (planning) — ${raisonSociale} : ${commentaireClean}`,
    })

    return NextResponse.json({ success: true, action, newStatut: action })
  } catch (err: any) {
    console.error('Erreur livraison-action:', err)
    const status = err.message === 'Client non trouve' ? 404 : 500
    return NextResponse.json({ error: err.message }, { status })
  }
}
