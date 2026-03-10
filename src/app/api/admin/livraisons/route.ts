import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * GET /api/admin/livraisons
 * Liste les livraisons. Filtre par client_id si fourni.
 * Query params: client_id, statut, limit
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    const statut = searchParams.get('statut')
    const limit = parseInt(searchParams.get('limit') || '50')

    const supabase = createAdminClient()

    let query = supabase
      .from('livraisons')
      .select('*, clients!inner(id, raison_sociale, contact_nom, contact_prenom, velo_valide, velo_devis, email_beneficiaire, telephone, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville, statut_commercial, departement)')
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 200))

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    if (statut) {
      query = query.eq('statut', statut)
    }

    const { data, error } = await query

    if (error) {
      console.error('Erreur livraisons:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transformer les données pour inclure le client en tant qu'objet imbriqué
    const livraisons = (data || []).map((row: Record<string, unknown>) => {
      const { clients, ...livraison } = row
      return {
        ...livraison,
        client: clients,
      }
    })

    return NextResponse.json({ livraisons })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur GET /api/admin/livraisons:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
