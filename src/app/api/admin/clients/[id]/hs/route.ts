import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST - Passer un client en HS (admin/super_admin uniquement)
// Annule la livraison active, reset CQ, libere FNUCI
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { comment } = await request.json()

    if (!comment?.trim()) {
      return NextResponse.json({ error: 'Commentaire obligatoire' }, { status: 400 })
    }

    // Auth + role check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, nom, prenom')
      .eq('id', user.id)
      .single()

    if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Reserve aux administrateurs' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    const adminName = [profile.prenom, profile.nom].filter(Boolean).join(' ') || user.email || 'Admin'

    // 1. Recuperer le client
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('id, raison_sociale, statut_commercial, fnuci_ids, notes_internes')
      .eq('id', id)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client non trouve' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const logEntry = `[HS ${new Date().toLocaleDateString('fr-FR')} par ${adminName}] ${comment.trim()}`
    const existingNotes = client.notes_internes ? client.notes_internes + '\n' : ''

    // 2. Annuler les livraisons actives + reset CQ
    const { data: activeLivraisons } = await adminClient
      .from('livraisons')
      .select('id, statut')
      .eq('client_id', id)
      .not('statut', 'in', '("annulee","retractation")')

    if (activeLivraisons && activeLivraisons.length > 0) {
      const livraisonIds = activeLivraisons.map(l => l.id)
      await adminClient
        .from('livraisons')
        .update({
          statut: 'annulee',
          cq_valide: false,
          cq_en_cours: false,
          cq_piece_identite: false,
          cq_photo_enemat: false,
          cq_signature_installateur: false,
          cq_signature_client: false,
          cq_fnuci: false,
          cq_velo: false,
          cq_valide_par: null,
          cq_valide_at: null,
          cq_pris_par: null,
          cq_pris_at: null,
          cq_commentaire: null,
          updated_at: now,
        })
        .in('id', livraisonIds)
    }

    // 3. Liberer les FNUCI
    const hasFnuci = client.fnuci_ids && Array.isArray(client.fnuci_ids) && client.fnuci_ids.length > 0

    // 4. Mettre a jour le client
    await adminClient
      .from('clients')
      .update({
        statut_commercial: 'client_hs',
        date_statut: now,
        notes_internes: existingNotes + logEntry,
        ...(hasFnuci ? {
          fnuci_ids: [],
          fnuci_declared: false,
          fnuci_declared_at: null,
        } : {}),
        updated_at: now,
      })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      livraisons_annulees: activeLivraisons?.length || 0,
      fnuci_liberes: hasFnuci ? client.fnuci_ids.length : 0,
    })

  } catch (err: any) {
    console.error('Erreur passage HS:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
