import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/controle/[livraisonId]/lock
 * Prendre ou relâcher un dossier de contrôle qualité.
 * Body: { action: 'lock' | 'unlock' }
 * - lock : verrouille le dossier pour l'utilisateur courant
 * - unlock : déverrouille (seulement si c'est le même user ou super_admin)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ livraisonId: string }> }
) {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  const { livraisonId } = await params
  const body = await request.json()
  const { action } = body as { action: 'lock' | 'unlock' }

  if (!['lock', 'unlock'].includes(action)) {
    return NextResponse.json({ error: 'Action invalide (lock ou unlock)' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Fetch current state
  const { data: livraison, error: fetchError } = await adminClient
    .from('livraisons')
    .select('id, statut, cq_valide, cq_pris_par')
    .eq('id', livraisonId)
    .single()

  if (fetchError || !livraison) {
    return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
  }

  if (livraison.statut !== 'livree' || livraison.cq_valide) {
    return NextResponse.json({ error: 'Ce dossier ne peut pas être verrouillé' }, { status: 400 })
  }

  if (action === 'lock') {
    // Déjà pris par quelqu'un d'autre ?
    if (livraison.cq_pris_par && livraison.cq_pris_par !== auth.id) {
      return NextResponse.json(
        { error: 'Ce dossier est déjà pris par un autre agent' },
        { status: 409 }
      )
    }

    const { error } = await adminClient
      .from('livraisons')
      .update({
        cq_pris_par: auth.id,
        cq_pris_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', livraisonId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, locked_by: auth.id })
  }

  // action === 'unlock'
  if (livraison.cq_pris_par !== auth.id && auth.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Seul l\'agent qui a pris le dossier ou un super admin peut le déverrouiller' },
      { status: 403 }
    )
  }

  const { error } = await adminClient
    .from('livraisons')
    .update({
      cq_pris_par: null,
      cq_pris_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', livraisonId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, locked_by: null })
}
