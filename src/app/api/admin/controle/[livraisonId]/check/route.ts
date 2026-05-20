import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { CQ_CHECK_KEYS, CQ_CATEGORIE_KEYS, type CqCheckKey, type CqCategorie } from '@/lib/constants'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ livraisonId: string }> }
) {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  const { livraisonId } = await params
  const body = await request.json()
  const { field, value, commentaire, categorie } = body as { field?: string; value?: boolean; commentaire?: string; categorie?: string | null }

  const adminClient = createAdminClient()

  // Vérifier le verrou : il faut d'abord "Prendre" le dossier pour le modifier
  const { data: lockCheck } = await adminClient
    .from('livraisons')
    .select('cq_pris_par')
    .eq('id', livraisonId)
    .single()

  if (auth.role !== 'super_admin') {
    if (!lockCheck?.cq_pris_par) {
      return NextResponse.json(
        { error: 'Vous devez d\'abord prendre le dossier avant de le modifier' },
        { status: 403 }
      )
    }
    if (lockCheck.cq_pris_par !== auth.id) {
      return NextResponse.json(
        { error: 'Ce dossier est verrouillé par un autre agent' },
        { status: 403 }
      )
    }
  }

  // Mode commentaire seul
  if (commentaire !== undefined && !field) {
    const { error } = await adminClient
      .from('livraisons')
      .update({ cq_commentaire: commentaire || null, updated_at: new Date().toISOString() })
      .eq('id', livraisonId)
      .eq('statut', 'livree')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, cq_commentaire: commentaire || null })
  }

  // Mode catégorie seule (tag CQ)
  if (categorie !== undefined && !field) {
    const cat = categorie || null
    if (cat !== null && !CQ_CATEGORIE_KEYS.includes(cat as CqCategorie)) {
      return NextResponse.json({ error: `Catégorie invalide: ${categorie}` }, { status: 400 })
    }
    const { error } = await adminClient
      .from('livraisons')
      .update({ cq_categorie: cat, updated_at: new Date().toISOString() })
      .eq('id', livraisonId)
      .eq('statut', 'livree')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, cq_categorie: cat })
  }

  // Mode check : validate field name
  if (!field || !CQ_CHECK_KEYS.includes(field as CqCheckKey)) {
    return NextResponse.json(
      { error: `Champ invalide: ${field}` },
      { status: 400 }
    )
  }

  if (typeof value !== 'boolean') {
    return NextResponse.json(
      { error: 'La valeur doit être un booléen' },
      { status: 400 }
    )
  }

  // Update the specific check field
  const { error: updateError } = await adminClient
    .from('livraisons')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', livraisonId)
    .eq('statut', 'livree')

  if (updateError) {
    console.error('Erreur update CQ check:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Recalculate cq_en_cours: fetch all 6 checks
  const { data: livraison, error: fetchError } = await adminClient
    .from('livraisons')
    .select('cq_piece_identite, cq_photo_enemat, cq_signature_installateur, cq_signature_client, cq_fnuci, cq_velo')
    .eq('id', livraisonId)
    .single()

  if (fetchError || !livraison) {
    return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
  }

  const checks = [
    livraison.cq_piece_identite,
    livraison.cq_photo_enemat,
    livraison.cq_signature_installateur,
    livraison.cq_signature_client,
    livraison.cq_fnuci,
    livraison.cq_velo,
  ]
  const trueCount = checks.filter(Boolean).length
  const cqEnCours = trueCount > 0 && trueCount < 6

  await adminClient
    .from('livraisons')
    .update({ cq_en_cours: cqEnCours })
    .eq('id', livraisonId)

  return NextResponse.json({
    checks: {
      cq_piece_identite: livraison.cq_piece_identite,
      cq_photo_enemat: livraison.cq_photo_enemat,
      cq_signature_installateur: livraison.cq_signature_installateur,
      cq_signature_client: livraison.cq_signature_client,
      cq_fnuci: livraison.cq_fnuci,
      cq_velo: livraison.cq_velo,
    },
    cq_en_cours: cqEnCours,
    checked: trueCount,
    total: 6,
  })
}
