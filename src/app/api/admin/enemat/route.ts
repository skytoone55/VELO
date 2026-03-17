import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError, type AuthenticatedUser } from '@/lib/auth/require-role'

/**
 * GET /api/admin/enemat
 * Liste les clients in_enemat = true avec filtres, pagination, jointures livraisons + depots.
 * Acces : super_admin uniquement.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const statutEnemat = searchParams.get('statut_enemat')
    const search = searchParams.get('search')
    const depotId = searchParams.get('depot_id')
    const commercial = searchParams.get('commercial')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = (page - 1) * limit

    const supabase = createAdminClient()

    const fnuciFilter = searchParams.get('fnuci')

    let query = supabase
      .from('clients')
      .select(
        `id, raison_sociale, reference_retina, telephone, email, commercial_assigne,
         depot_logistique_id, velo_valide,
         statut_enemat, date_depot_enemat, date_apf_enemat, date_paye_enemat, date_entree_enemat, in_enemat,
         fnuci_ids, fnuci_declared, fnuci_declared_at,
         livraisons(mode_livraison, creneau_date, date_livraison_effective, cq_valide_at)`,
        { count: 'exact' }
      )
      .eq('in_enemat', true)
      .order('date_entree_enemat', { ascending: false })
      .range(offset, offset + limit - 1)

    if (statutEnemat) {
      query = query.eq('statut_enemat', statutEnemat)
    }

    if (search) {
      query = query.or(
        `raison_sociale.ilike.%${search}%,siret.ilike.%${search}%,reference_retina.ilike.%${search}%,telephone.ilike.%${search}%,email.ilike.%${search}%`
      )
    }

    if (depotId) {
      query = query.eq('depot_logistique_id', depotId)
    }

    if (commercial) {
      query = query.eq('commercial_assigne', commercial)
    }

    if (fnuciFilter === 'oui') {
      query = query.eq('fnuci_declared', true)
    } else if (fnuciFilter === 'non') {
      query = query.or('fnuci_declared.eq.false,fnuci_declared.is.null')
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Erreur GET /api/admin/enemat:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Récupérer les noms de dépôts
    const depotIds = [...new Set((data || []).map((r: any) => r.depot_logistique_id).filter(Boolean))]
    let depotsMap: Record<string, string> = {}
    if (depotIds.length > 0) {
      const { data: depots } = await supabase
        .from('depots')
        .select('id, nom')
        .in('id', depotIds)
      if (depots) {
        depotsMap = Object.fromEntries(depots.map((d: any) => [d.id, d.nom]))
      }
    }

    // Transformer pour aplatir la derniere livraison
    const clients = (data || []).map((row: Record<string, unknown>) => {
      const { livraisons, ...client } = row
      const livraisonsArr = Array.isArray(livraisons) ? livraisons : []
      const derniereLivraison = livraisonsArr[0] || null
      return {
        ...client,
        mode_livraison: derniereLivraison?.mode_livraison ?? null,
        date_livraison: derniereLivraison?.creneau_date ?? null,
        date_livraison_effective: derniereLivraison?.date_livraison_effective ?? null,
        date_controle: derniereLivraison?.cq_valide_at ?? null,
        depot_nom: depotsMap[(client as any).depot_logistique_id] ?? null,
      }
    })

    return NextResponse.json({ clients, total: count ?? 0, page, limit })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur GET /api/admin/enemat:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/admin/enemat
 * Bascule des clients vers ENEMAT (action de masse depuis Livraisons).
 * Body : { client_ids: string[] }
 * Acces : super_admin uniquement.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth
    const currentUser = auth as AuthenticatedUser

    const body = await request.json()
    const { client_ids } = body as { client_ids: string[] }

    if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
      return NextResponse.json({ error: 'client_ids requis (tableau non vide)' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()

    // Vérifier que chaque client a une livraison avec CQ validé
    const { data: livraisons } = await supabase
      .from('livraisons')
      .select('client_id, cq_valide')
      .in('client_id', client_ids)
      .eq('statut', 'livree')
      .eq('cq_valide', true)

    const clientsAvecCQ = new Set((livraisons || []).map((l: { client_id: string }) => l.client_id))
    const eligible = client_ids.filter(id => clientsAvecCQ.has(id))
    const rejected = client_ids.filter(id => !clientsAvecCQ.has(id))

    if (eligible.length === 0) {
      return NextResponse.json({
        error: 'Aucun client éligible. Seuls les clients avec un contrôle qualité validé peuvent être transférés vers ENEMAT.',
        rejected_count: rejected.length,
      }, { status: 400 })
    }

    // Mettre à jour uniquement les clients éligibles
    const { data: updated, error: updateError } = await supabase
      .from('clients')
      .update({
        in_enemat: true,
        statut_enemat: 'a_deposer_enemat',
        date_entree_enemat: now,
        updated_at: now,
      })
      .in('id', eligible)
      .select('id')

    if (updateError) {
      console.error('Erreur POST /api/admin/enemat (update):', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const updatedIds = (updated || []).map((r: { id: string }) => r.id)

    // Creer les entrees enemat_history
    if (updatedIds.length > 0) {
      const historyRows = updatedIds.map((clientId: string) => ({
        client_id: clientId,
        statut_avant: null,
        statut_apres: 'a_deposer_enemat',
        changed_by: currentUser.id,
        changed_at: now,
      }))

      const { error: histError } = await supabase
        .from('enemat_history')
        .insert(historyRows)

      if (histError) {
        console.error('Erreur POST /api/admin/enemat (history):', histError)
        // Non bloquant — les clients sont deja bascules
      }
    }

    return NextResponse.json({
      success: true,
      count: updatedIds.length,
      client_ids: updatedIds,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/enemat:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
