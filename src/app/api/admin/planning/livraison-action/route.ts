import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { passerClientHS } from '@/lib/clients/passer-hs'

// Actions livreur depuis le planning, sur une livraison.
// Ouvert a tous les roles internes (les livreurs sont l'echelon le plus bas).
const ACTIONS = ['a_relivrer', 'probleme_livraison', 'retractation'] as const
type LivraisonAction = (typeof ACTIONS)[number]

const ACTION_LABEL: Record<LivraisonAction, string> = {
  a_relivrer: 'A relivrer',
  probleme_livraison: 'Probleme de livraison',
  retractation: 'Retractation',
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

  // Recuperer la livraison + client
  const { data: livraison, error: fetchError } = await adminClient
    .from('livraisons')
    .select('id, client_id, statut, client:clients(id, statut_commercial, raison_sociale)')
    .eq('id', livraisonId)
    .single()

  if (fetchError || !livraison || !livraison.client_id) {
    return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
  }

  const clientId = livraison.client_id as string
  const client = Array.isArray(livraison.client) ? livraison.client[0] : livraison.client
  const statutAvant = client?.statut_commercial ?? null
  const raisonSociale = client?.raison_sociale ?? ''
  const commentaireClean = commentaire.trim()

  // Trace du commentaire sur la livraison (commun aux 3 actions)
  const commentaireUpdate = {
    commentaire_action: commentaireClean,
    commentaire_action_type: action,
    commentaire_action_at: now,
    updated_at: now,
  }

  try {
    if (action === 'retractation') {
      // Bascule le client en Client HS (annule livraisons, libere FNUCI, log notes_internes)
      await adminClient.from('livraisons').update(commentaireUpdate).eq('id', livraisonId)
      const result = await passerClientHS(adminClient, clientId, commentaireClean, actorName, 'RETRACTATION')

      await adminClient.from('workflow_transitions').insert({
        entity_type: 'client',
        entity_id: clientId,
        statut_avant: statutAvant,
        statut_apres: 'client_hs',
        effectue_par: auth.id,
        raison: `Retractation (planning) — ${raisonSociale} : ${commentaireClean}`,
      })

      return NextResponse.json({
        success: true,
        action,
        newStatut: 'client_hs',
        livraisons_annulees: result.livraisons_annulees,
        fnuci_liberes: result.fnuci_liberes,
      })
    }

    // a_relivrer / probleme_livraison : pose le statut client + commentaire
    const nouveauStatutClient = action // 'a_relivrer' | 'probleme_livraison'

    // "A relivrer" : la livraison repart en file de planification (aligne sur le flux refus tournee).
    // "Probleme de livraison" : la livraison reste en place, on signale juste le probleme.
    const livraisonUpdate =
      action === 'a_relivrer'
        ? { ...commentaireUpdate, statut: 'a_livrer' }
        : commentaireUpdate

    await adminClient.from('livraisons').update(livraisonUpdate).eq('id', livraisonId)

    await adminClient
      .from('clients')
      .update({ statut_commercial: nouveauStatutClient, date_statut: now, updated_at: now })
      .eq('id', clientId)

    await adminClient.from('workflow_transitions').insert({
      entity_type: 'client',
      entity_id: clientId,
      statut_avant: statutAvant,
      statut_apres: nouveauStatutClient,
      effectue_par: auth.id,
      raison: `${ACTION_LABEL[action]} (planning) — ${raisonSociale} : ${commentaireClean}`,
    })

    return NextResponse.json({ success: true, action, newStatut: nouveauStatutClient })
  } catch (err: any) {
    console.error('Erreur livraison-action:', err)
    const status = err.message === 'Client non trouve' ? 404 : 500
    return NextResponse.json({ error: err.message }, { status })
  }
}
