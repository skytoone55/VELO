import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { transfererClientVersData } from '@/lib/clients/transferer-vers-data'

/**
 * POST /api/admin/clients/[id]/to-data
 * Renvoyer un client vers data_clients (deplacement, pas copie).
 * Body: { comment: string (obligatoire), statut_data?: 'HS' | 'retour_client' | 'en_attente' }
 * Si statut_data est fourni, il prime ; sinon fallback sur le mapping derive du statut_commercial.
 * Le transfert reel (insertion + detachement FK + suppression) est fait par
 * transfererClientVersData() — source unique partagee avec passerClientHS().
 */
const ALLOWED_STATUT_DATA = ['HS', 'retour_client', 'en_attente'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const { id } = await params
    const { comment, statut_data: statutDataInput } = await request.json()

    if (!comment?.trim()) {
      return NextResponse.json({ error: 'Commentaire obligatoire pour renvoyer vers Data' }, { status: 400 })
    }

    if (statutDataInput !== undefined && !ALLOWED_STATUT_DATA.includes(statutDataInput)) {
      return NextResponse.json(
        { error: `statut_data invalide (valeurs autorisees : ${ALLOWED_STATUT_DATA.join(', ')})` },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Recuperer le client (404 + derivation du statut par defaut)
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('raison_sociale, statut_commercial')
      .eq('id', id)
      .single()

    if (fetchError || !client) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    // statut_data explicite prime ; sinon : un client HS reste HS, les autres -> retour_client.
    const effectiveStatut = statutDataInput ?? (client.statut_commercial === 'client_hs' ? 'HS' : 'retour_client')

    const result = await transfererClientVersData(adminClient, id, {
      statutData: effectiveStatut,
      comment,
      actorName: authResult.email || 'Admin',
      retourPar: authResult.id,
    })

    return NextResponse.json({
      success: true,
      livraisonsAnnulees: result.livraisonsAnnulees,
      fnuciLiberes: result.fnuciLiberes,
      message: `${client.raison_sociale} renvoye vers Data Client`,
    })
  } catch (error: any) {
    console.error('Erreur POST /api/admin/clients/[id]/to-data:', error)
    const status = error.message === 'Client non trouve' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
}
