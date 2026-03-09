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
