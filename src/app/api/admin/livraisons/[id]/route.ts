import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * GET /api/admin/livraisons/[id]
 * Récupère une livraison avec les données client
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const { id } = await params
    const supabase = createAdminClient()

    const { data: livraison, error } = await supabase
      .from('livraisons')
      .select(`
        *,
        client:clients!client_id(
          id, raison_sociale, contact_nom, contact_prenom,
          telephone, email_beneficiaire, velo_devis, velo_valide,
          adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville,
          siret, reference_retina
        )
      `)
      .eq('id', id)
      .single()

    if (error || !livraison) {
      return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
    }

    return NextResponse.json({ livraison })
  } catch (error: unknown) {
    console.error('Erreur GET /api/admin/livraisons/[id]:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/livraisons/[id]
 * Met à jour des champs de la livraison
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(auth)) return auth

    const { id } = await params
    const body = await request.json()

    const allowedFields = [
      'complement_adresse', 'notes_admin', 'statut',
      'creneau_date', 'creneau_heure_debut', 'creneau_heure_fin',
      'heure_precise', 'mode_livraison',
    ]

    const updateData: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in body) updateData[key] = body[key]
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Aucun champ valide' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('livraisons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ livraison: data })
  } catch (error: unknown) {
    console.error('Erreur PATCH /api/admin/livraisons/[id]:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
