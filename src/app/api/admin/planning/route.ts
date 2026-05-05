import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

export async function GET(request: Request) {
  try {
    // Auth: require admin, super_admin or agent_secteur
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const { searchParams } = new URL(request.url)
    const depotId = searchParams.get('depot_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!depotId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Paramètres manquants : depot_id, start_date, end_date requis' },
        { status: 400 }
      )
    }

    // Agent : vérifier que le dépôt demandé est dans ses dépôts assignés
    if (authResult.role === 'agent_secteur') {
      const allowed = authResult.depot_ids || []
      if (!allowed.includes(depotId)) {
        return NextResponse.json({ error: 'Accès refusé à ce dépôt' }, { status: 403 })
      }
    }

    const adminClient = createAdminClient()

    // 1. Fetch depot info
    const { data: depot, error: depotError } = await adminClient
      .from('depots')
      .select('*')
      .eq('id', depotId)
      .single()

    if (depotError || !depot) {
      return NextResponse.json(
        { error: 'Dépôt non trouvé' },
        { status: 404 }
      )
    }

    // 2. Fetch livraisons for this depot in the date range
    //    Join with client data for display
    const { data: livraisons, error: livraisonsError } = await adminClient
      .from('livraisons')
      .select(`
        id,
        client_id,
        mode_livraison,
        statut,
        creneau_date,
        creneau_heure_debut,
        creneau_heure_fin,
        date_livraison,
        date_programmation,
        depot_id,
        adresse_livraison_ligne1,
        adresse_livraison_cp,
        adresse_livraison_ville,
        notes_admin,
        complement_adresse,
        heure_precise,
        livreur_id,
        tournee_position,
        created_at
      `)
      .eq('depot_id', depotId)
      .gte('creneau_date', startDate)
      .lte('creneau_date', endDate)
      .order('creneau_date', { ascending: true })
      .order('tournee_position', { ascending: true, nullsFirst: false })
      .order('creneau_heure_debut', { ascending: true })

    if (livraisonsError) {
      console.error('Erreur livraisons:', livraisonsError)
      return NextResponse.json(
        { error: livraisonsError.message },
        { status: 500 }
      )
    }

    // 3. Fetch client details for each livraison
    const clientIds = [...new Set(
      (livraisons || [])
        .map((l) => l.client_id)
        .filter((id): id is string => id !== null)
    )]

    let clientsMap: Record<string, {
      id: string
      raison_sociale: string
      velo_devis: number
      velo_valide: number | null
      telephone: string | null
      email: string | null
      statut_commercial: string | null
      adresse_livraison_ligne1: string | null
      adresse_livraison_cp: string | null
      adresse_livraison_ville: string | null
    }> = {}

    if (clientIds.length > 0) {
      const { data: clients } = await adminClient
        .from('clients')
        .select('id, raison_sociale, velo_devis, velo_valide, telephone, email, statut_commercial, preferences_livraison, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville')
        .in('id', clientIds)

      if (clients) {
        for (const c of clients) {
          clientsMap[c.id] = c
        }
      }
    }

    // Enrich livraisons with client data
    const enrichedLivraisons = (livraisons || []).map((l) => ({
      ...l,
      client: l.client_id ? clientsMap[l.client_id] || null : null,
    }))

    // 4. Fetch clients "a_livrer" for this depot (either depot_logistique_id or depot_retrait_id)
    const { data: clientsALivrer, error: clientsError } = await adminClient
      .from('clients')
      .select('id, raison_sociale, velo_devis, velo_valide, telephone, email, preferences_livraison, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville, statut_commercial')
      .eq('statut_commercial', 'a_livrer')
      .or(`depot_logistique_id.eq.${depotId},depot_retrait_id.eq.${depotId}`)
      .order('raison_sociale', { ascending: true })

    if (clientsError) {
      console.error('Erreur clients à livrer:', clientsError)
    }

    return NextResponse.json({
      depot,
      livraisons: enrichedLivraisons,
      clients_a_livrer: clientsALivrer || [],
    })
  } catch (error: unknown) {
    console.error('Erreur API planning:', error)
    const message = error instanceof Error ? error.message : 'Erreur interne'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
