import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ livraisonId: string }> }
) {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  const { livraisonId } = await params
  const adminClient = createAdminClient()

  // Fetch livraison with all 6 checks + lock
  const { data: livraison, error: fetchError } = await adminClient
    .from('livraisons')
    .select('id, statut, client_id, cq_piece_identite, cq_photo_enemat, cq_signature_installateur, cq_signature_client, cq_fnuci, cq_velo, cq_valide, cq_pris_par')
    .eq('id', livraisonId)
    .single()

  if (fetchError || !livraison) {
    return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
  }

  if (livraison.statut !== 'livree') {
    return NextResponse.json({ error: 'Seules les livraisons livrées peuvent être validées' }, { status: 400 })
  }

  if (livraison.cq_valide) {
    return NextResponse.json({ error: 'Contrôle déjà validé' }, { status: 400 })
  }

  // Vérifier le verrou
  if (livraison.cq_pris_par && livraison.cq_pris_par !== auth.id && auth.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Ce dossier est verrouillé par un autre agent' },
      { status: 403 }
    )
  }

  // Verify all 6 checks are true
  const allChecks = [
    livraison.cq_piece_identite,
    livraison.cq_photo_enemat,
    livraison.cq_signature_installateur,
    livraison.cq_signature_client,
    livraison.cq_fnuci,
    livraison.cq_velo,
  ]

  if (!allChecks.every(Boolean)) {
    const missing = 6 - allChecks.filter(Boolean).length
    return NextResponse.json(
      { error: `${missing} vérification(s) manquante(s)` },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  // Set cq_valide
  const { error: updateError } = await adminClient
    .from('livraisons')
    .update({
      cq_valide: true,
      cq_valide_par: auth.id,
      cq_valide_at: now,
      cq_en_cours: false,
      cq_commentaire: null,
      cq_pris_par: null,
      cq_pris_at: null,
      updated_at: now,
    })
    .eq('id', livraisonId)

  if (updateError) {
    console.error('Erreur validation CQ:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Workflow transition
  await adminClient.from('workflow_transitions').insert({
    entity_type: 'livraison',
    entity_id: livraisonId,
    statut_avant: 'livree',
    statut_apres: 'livree_cq_valide',
    effectue_par: auth.id,
    raison: 'Contrôle qualité validé (6/6 vérifications)',
  })

  return NextResponse.json({
    success: true,
    cq_valide_at: now,
    cq_valide_par: auth.id,
  })
}
