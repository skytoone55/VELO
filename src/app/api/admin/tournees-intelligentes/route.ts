import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import {
  findOptimalClients,
  countClusters,
  calculateTourStats,
  calculateInterClientDistances,
  getDepartementCentroid,
  getClientsCentroid,
  type TourneeClient,
} from '@/lib/tournees/optimizer'

const CLIENT_SELECT = `
  id, raison_sociale, latitude, longitude, departement,
  adresse_livraison_ville, adresse_livraison_ligne1, adresse_livraison_cp,
  velo_devis, velo_valide, statut_commercial, telephone, email,
  depot_logistique_id
`

/**
 * GET /api/admin/tournees-intelligentes
 *
 * Mode "calculate" (défaut) : calcule une proposition de tournée
 * Mode "departements" : liste les départements distincts des clients
 * Mode "cp" : liste les codes postaux matchant un préfixe
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(auth)) return auth

    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'calculate'

    const statuts = searchParams.get('statuts')?.split(',').filter(Boolean) ?? []

    // ─── Mode : lister départements existants (filtrés par statuts) ──
    if (mode === 'departements') {
      let q = supabase
        .from('clients')
        .select('departement')
        .not('departement', 'is', null)
        .not('departement', 'eq', '')

      if (statuts.length > 0) q = q.in('statut_commercial', statuts)

      const { data, error } = await q
      if (error) {
        return NextResponse.json({ error: `Erreur départements: ${error.message}` }, { status: 500 })
      }

      const unique = [...new Set((data ?? []).map(c => c.departement).filter(Boolean))].sort()
      return NextResponse.json({ departements: unique })
    }

    // ─── Mode : lister codes postaux par préfixe (filtrés par statuts) ──
    if (mode === 'cp') {
      const prefix = searchParams.get('prefix') || ''
      if (prefix.length < 2) {
        return NextResponse.json({ codes_postaux: [] })
      }

      let q = supabase
        .from('clients')
        .select('adresse_livraison_cp')
        .like('adresse_livraison_cp', `${prefix}%`)

      if (statuts.length > 0) q = q.in('statut_commercial', statuts)

      const { data, error } = await q
      if (error) {
        return NextResponse.json({ error: `Erreur CP: ${error.message}` }, { status: 500 })
      }

      const unique = [...new Set((data ?? []).map(c => c.adresse_livraison_cp).filter(Boolean))].sort()
      return NextResponse.json({ codes_postaux: unique })
    }

    // ─── Mode : lister les livreurs (filtré par depot_id si fourni) ─────
    if (mode === 'livreurs') {
      const depotFilter = searchParams.get('depot_id')
      let q = supabase
        .from('users_profile')
        .select('id, nom, prenom, depot_id, depot_ids')
        .in('role', ['livreur', 'admin', 'super_admin', 'agent_secteur'])
        .eq('actif', true)
        .order('nom')
      const { data, error } = await q
      if (error) {
        return NextResponse.json({ error: `Erreur livreurs: ${error.message}` }, { status: 500 })
      }
      let result = data ?? []
      // Filtrer côté serveur : livreurs dont depot_id ou depot_ids contient le dépôt
      if (depotFilter) {
        result = result.filter(u =>
          u.depot_id === depotFilter ||
          (Array.isArray(u.depot_ids) && u.depot_ids.includes(depotFilter))
        )
      }
      return NextResponse.json({ livreurs: result.map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom })) })
    }

    // ─── Mode : rechercher des clients (filtrés par statuts) ──────────
    if (mode === 'clients') {
      const search = searchParams.get('search') || ''
      if (search.length < 2) {
        return NextResponse.json({ clients: [] })
      }

      let q = supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .or(`raison_sociale.ilike.%${search}%,siret.ilike.%${search}%,email.ilike.%${search}%`)
        .not('latitude', 'is', null)

      if (statuts.length > 0) q = q.in('statut_commercial', statuts)

      const { data, error } = await q.limit(10)
      if (error) {
        return NextResponse.json({ error: `Erreur recherche: ${error.message}` }, { status: 500 })
      }

      return NextResponse.json({ clients: data ?? [] })
    }

    // ─── Mode : calculer une tournée ──────────────────────────────
    const method = searchParams.get('method') as 'departement' | 'cp' | 'client' | 'creneau'
    const value = searchParams.get('value')
    const includeIds = searchParams.get('include')?.split(',').filter(Boolean) ?? []
    const capacite = parseInt(searchParams.get('capacite') ?? '10', 10)
    const excludeIds = searchParams.get('exclude')?.split(',').filter(Boolean) ?? []
    const clusterIndex = parseInt(searchParams.get('cluster') ?? '0', 10)
    const customAnchorLat = searchParams.get('anchor_lat')
    const customAnchorLng = searchParams.get('anchor_lng')
    const budgetMinutesParam = searchParams.get('budget_minutes')
    const budgetMinutesOverride = budgetMinutesParam ? parseInt(budgetMinutesParam, 10) : undefined

    if (!method || (!value && method !== 'creneau')) {
      return NextResponse.json({ error: 'Paramètres method et value requis' }, { status: 400 })
    }

    if (statuts.length === 0) {
      return NextResponse.json({ error: 'Au moins un statut requis' }, { status: 400 })
    }

    const depotId = searchParams.get('depot_id')

    // Construire la requête clients
    let query = supabase
      .from('clients')
      .select(CLIENT_SELECT)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .in('statut_commercial', statuts)

    // Exclure les clients en retrait (sans dépôt logistique) — pas de livraison = pas de tournée
    query = query.not('depot_logistique_id', 'is', null)

    // Filtre dépôt spécifique si sélectionné
    if (depotId) {
      query = query.eq('depot_logistique_id', depotId)
    }

    let anchor: { lat: number; lng: number }
    let refClientToInclude: TourneeClient | null = null
    let forcedClients: TourneeClient[] = []

    if (method === 'creneau') {
      // Mode créneau : les clients du créneau sont le point d'ancrage
      if (includeIds.length === 0) {
        return NextResponse.json({ error: 'Aucun client dans le créneau' }, { status: 400 })
      }
      // Fetch les clients du créneau (sans filtre de statut)
      const { data: creneauClients, error: creneauError } = await supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .in('id', includeIds)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      if (creneauError || !creneauClients?.length) {
        return NextResponse.json({ error: 'Clients du créneau introuvables' }, { status: 400 })
      }

      forcedClients = creneauClients as TourneeClient[]
      anchor = getClientsCentroid(forcedClients)

      // Chercher les voisins dans les départements des clients du créneau
      const depts = [...new Set(forcedClients.map(c => c.departement).filter(Boolean))]
      if (depts.length > 0) {
        query = query.in('departement', depts)
      }

    } else if (method === 'departement') {
      query = query.eq('departement', value!)
      const centroid = getDepartementCentroid(value!)
      if (!centroid) {
        return NextResponse.json({ error: `Département ${value} inconnu` }, { status: 400 })
      }
      anchor = centroid

    } else if (method === 'cp') {
      // D'abord chercher les clients dans ce CP pour trouver le département
      const { data: cpClients } = await supabase
        .from('clients')
        .select('departement')
        .eq('adresse_livraison_cp', value!)
        .not('departement', 'is', null)
        .limit(1)
      const cpDept = cpClients?.[0]?.departement
      if (cpDept) {
        // Chercher dans tout le département (pas juste le CP) pour trouver les voisins
        query = query.eq('departement', cpDept)
      } else {
        // Fallback : juste le CP
        query = query.eq('adresse_livraison_cp', value!)
      }
      anchor = { lat: 0, lng: 0 } // sera recalculé après avec getClientsCentroid des clients du CP

    } else if (method === 'client') {
      // Chercher le client de référence (sans filtre de statut)
      const { data: refClient, error: refError } = await supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .eq('id', value!)
        .single()

      if (refError || !refClient || !refClient.latitude || !refClient.longitude) {
        return NextResponse.json({ error: 'Client introuvable ou sans coordonnées GPS' }, { status: 400 })
      }

      anchor = { lat: refClient.latitude, lng: refClient.longitude }
      // Chercher les voisins dans le même département ET les départements limitrophes
      // (le filtre de distance se fait côté algorithme via MAX_STEP_KM)
      query = query.eq('departement', refClient.departement)
      // Forcer ce client dans les résultats même si son statut ne matche pas
      refClientToInclude = refClient as TourneeClient

    } else {
      return NextResponse.json({ error: 'Méthode invalide' }, { status: 400 })
    }

    // Fetch clients éligibles (avec GPS)
    const { data: allClients, error: clientsError } = await query.limit(500)

    if (clientsError) {
      return NextResponse.json({ error: `Erreur requête clients: ${clientsError.message}` }, { status: 500 })
    }

    let eligible = (allClients ?? []) as TourneeClient[]

    // Fallback GPS par code postal : récupérer les clients sans coordonnées
    // et leur attribuer le centroïde des clients géolocalisés du même CP
    let sansGPSCount = 0
    try {
      let sansGPSQuery = supabase
        .from('clients')
        .select(CLIENT_SELECT)
        .or('latitude.is.null,longitude.is.null')
        .not('adresse_livraison_cp', 'is', null)
        .in('statut_commercial', statuts)

      if (method === 'departement') sansGPSQuery = sansGPSQuery.eq('departement', value)
      if (depotId) sansGPSQuery = sansGPSQuery.eq('depot_logistique_id', depotId)

      const { data: sansGPS } = await sansGPSQuery.limit(200)
      sansGPSCount = sansGPS?.length ?? 0

      if (sansGPS && sansGPS.length > 0) {
        // Construire un index CP → centroïde à partir des clients géolocalisés
        const cpCentroids = new Map<string, { lat: number; lng: number; n: number }>()
        for (const c of eligible) {
          if (c.adresse_livraison_cp && c.latitude && c.longitude) {
            const existing = cpCentroids.get(c.adresse_livraison_cp)
            if (existing) {
              existing.lat += c.latitude
              existing.lng += c.longitude
              existing.n += 1
            } else {
              cpCentroids.set(c.adresse_livraison_cp, { lat: c.latitude, lng: c.longitude, n: 1 })
            }
          }
        }

        const existingIds = new Set(eligible.map(c => c.id))
        for (const c of sansGPS as TourneeClient[]) {
          if (existingIds.has(c.id)) continue
          const centroid = c.adresse_livraison_cp ? cpCentroids.get(c.adresse_livraison_cp) : null
          if (centroid) {
            eligible.push({
              ...c,
              latitude: centroid.lat / centroid.n,
              longitude: centroid.lng / centroid.n,
            })
          }
        }
      }
    } catch {
      // Pas critique, on continue
    }

    // Mode client : forcer l'inclusion du client de référence
    if (method === 'client' && refClientToInclude) {
      if (!eligible.some(c => c.id === refClientToInclude.id)) {
        eligible = [refClientToInclude, ...eligible]
      }
    }

    // Mode créneau : forcer l'inclusion des clients du créneau
    if (method === 'creneau' && forcedClients.length > 0) {
      const existingIds = new Set(eligible.map(c => c.id))
      for (const fc of forcedClients) {
        if (!existingIds.has(fc.id)) {
          eligible.push(fc)
        }
      }
    }

    if (method === 'cp') {
      // L'anchor = centroïde des clients du CP demandé (pas de tout le département)
      const cpClients = eligible.filter(c => c.adresse_livraison_cp === value)
      anchor = cpClients.length > 0 ? getClientsCentroid(cpClients) : getClientsCentroid(eligible)
    }

    // Surcharger l'anchor si une adresse de départ custom est fournie
    if (customAnchorLat && customAnchorLng) {
      const lat = parseFloat(customAnchorLat)
      const lng = parseFloat(customAnchorLng)
      if (!isNaN(lat) && !isNaN(lng)) {
        anchor = { lat, lng }
      }
    }

    // En mode "client", forcer le client de référence dans toutes les simulations
    // En mode "créneau", forcer tous les clients du créneau
    const forcedId = method === 'client' && value ? value : undefined
    const forcedIds = method === 'creneau' ? includeIds : undefined
    const totalClusters = countClusters(eligible, anchor, capacite, excludeIds, forcedId, forcedIds, budgetMinutesOverride)
    const proposed = findOptimalClients(eligible, anchor, capacite, excludeIds, clusterIndex, forcedId, forcedIds, budgetMinutesOverride)
    const stats = calculateTourStats(proposed, anchor)
    const distances = calculateInterClientDistances(proposed, anchor)

    return NextResponse.json({
      clients: proposed,
      stats,
      distances,
      clientsSansGPS: sansGPSCount,
      totalEligibles: eligible.length,
      totalClusters,
      clusterIndex: clusterIndex % Math.max(totalClusters, 1),
      anchor,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Erreur tournée intelligente GET:', msg)
    return NextResponse.json({ error: `Erreur: ${msg}` }, { status: 500 })
  }
}

/**
 * POST /api/admin/tournees-intelligentes
 * Crée une tournée + livraisons à partir d'une proposition validée
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin'])
    if (isAuthError(auth)) return auth

    const supabase = createAdminClient()
    const body = await request.json()
    const { client_ids, date, livreur_id, depot_id, notes, creneau_heure_debut, creneau_heure_fin } = body

    if (!client_ids?.length || !date || !depot_id) {
      return NextResponse.json({ error: 'client_ids, date et depot_id requis' }, { status: 400 })
    }

    // Créer la tournée
    const { data: tournee, error: tourneeError } = await supabase
      .from('tournees')
      .insert({
        date,
        livreur_id: livreur_id || null,
        depot_id,
        notes: notes || `Tournée intelligente - ${client_ids.length} clients`,
        created_by: auth.id,
      })
      .select('id')
      .single()

    if (tourneeError || !tournee) {
      return NextResponse.json({ error: `Erreur création tournée: ${tourneeError?.message}` }, { status: 500 })
    }

    // Récupérer les infos clients pour les livraisons
    const { data: clients, error: clientsQueryError } = await supabase
      .from('clients')
      .select('id, velo_devis, velo_valide, statut_commercial, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville')
      .in('id', client_ids)

    if (clientsQueryError) {
      console.error('Erreur query clients:', clientsQueryError.message, 'client_ids:', client_ids)
      return NextResponse.json({ error: `Erreur récupération clients: ${clientsQueryError.message}` }, { status: 500 })
    }

    if (!clients || clients.length === 0) {
      console.error('Aucun client trouvé pour les IDs:', client_ids)
      return NextResponse.json({ error: `Aucun client trouvé (${client_ids.length} IDs envoyés). Vérifiez que les clients existent.` }, { status: 400 })
    }

    // Bypass automatique : les clients en "controle_valide" passent à "en_livraison"
    const clientsToBypass = (clients ?? []).filter(
      c => c.statut_commercial && c.statut_commercial !== 'en_livraison' && c.statut_commercial !== 'livre'
    )
    if (clientsToBypass.length > 0) {
      await supabase
        .from('clients')
        .update({
          statut_commercial: 'en_livraison',
          date_statut: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', clientsToBypass.map(c => c.id))
    }

    // Vérifier les livraisons déjà existantes pour éviter les doublons
    const { data: existingLivraisons } = await supabase
      .from('livraisons')
      .select('client_id')
      .in('client_id', clients.map(c => c.id))
      .eq('creneau_date', date)
      .not('statut', 'in', '("annulee","retractation")')

    const existingClientIds = new Set((existingLivraisons ?? []).map(l => l.client_id))
    const newClients = clients.filter(c => !existingClientIds.has(c.id))

    // Créer les livraisons (avec créneau si fourni) — seulement pour les nouveaux clients
    const livraisons = newClients.map(c => ({
      client_id: c.id,
      tournee_id: tournee.id,
      creneau_date: date,
      statut: 'en_livraison',
      mode_livraison: 'domicile',
      livreur_id: livreur_id || null,
      depot_id,
      adresse_livraison_ligne1: c.adresse_livraison_ligne1,
      adresse_livraison_cp: c.adresse_livraison_cp,
      adresse_livraison_ville: c.adresse_livraison_ville,
      date_programmation: new Date().toISOString(),
      ...(creneau_heure_debut ? { creneau_heure_debut } : {}),
      ...(creneau_heure_fin ? { creneau_heure_fin } : {}),
    }))

    const { error: livraisonsError } = await supabase
      .from('livraisons')
      .insert(livraisons)

    if (livraisonsError) {
      return NextResponse.json({ error: `Tournée créée mais erreur livraisons: ${livraisonsError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      tournee_id: tournee.id,
      nb_livraisons: livraisons.length,
      nb_deja_programmes: existingClientIds.size,
      date,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Erreur tournée intelligente POST:', msg)
    return NextResponse.json({ error: `Erreur: ${msg}` }, { status: 500 })
  }
}
