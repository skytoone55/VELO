import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { estimateRoadDistance, estimateTravelTime } from '@/lib/tournees/optimizer'

/**
 * GET /api/admin/tournees/[id]
 * Renvoie une tournée + ses livraisons ORDONNÉES par tournee_position,
 * chaque arrêt enrichi du client (nom, téléphone, adresse, lat/lng).
 * Pour chaque arrêt : distance_to_next_km / time_to_next_min vers l'arrêt suivant.
 * Le dépôt de départ (si défini) est renvoyé séparément (position 0).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Identifiant tournée manquant' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Tournée + livreur + dépôt
    const { data: tournee, error: tourneeError } = await supabase
      .from('tournees')
      .select(`
        *,
        livreur:users_profile!tournees_livreur_id_fkey(id, nom, prenom, email),
        depot:depots!tournees_depot_id_fkey(id, nom, adresse, latitude, longitude)
      `)
      .eq('id', id)
      .single()

    if (tourneeError || !tournee) {
      return NextResponse.json({ error: 'Tournée introuvable' }, { status: 404 })
    }

    // Livraisons de la tournée + client détaillé
    const { data: livraisons, error: livError } = await supabase
      .from('livraisons')
      .select(`
        id,
        tournee_position,
        creneau_heure_debut,
        creneau_heure_fin,
        rdv_confirme,
        adresse_livraison_ligne1,
        adresse_livraison_cp,
        adresse_livraison_ville,
        complement_adresse,
        client:clients(
          id, raison_sociale, contact_prenom, contact_nom, telephone,
          latitude, longitude,
          adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville,
          adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville
        )
      `)
      .eq('tournee_id', id)

    if (livError) {
      console.error('Erreur GET tournée livraisons:', livError)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // Tri par tournee_position (les NULL en fin, ordre stable par id)
    const sorted = [...(livraisons || [])].sort((a, b) => {
      const ap = a.tournee_position
      const bp = b.tournee_position
      if (ap != null && bp != null) return ap - bp
      if (ap != null) return -1
      if (bp != null) return 1
      return a.id.localeCompare(b.id)
    })

    // Construit les arrêts ; adresse de livraison prioritaire, fallback adresse société
    const stops = sorted.map((liv, idx) => {
      // PostgREST type l'embed to-one comme un tableau : on normalise.
      const c = (Array.isArray(liv.client) ? liv.client[0] : liv.client) as {
        id: string
        raison_sociale: string
        contact_prenom: string | null
        contact_nom: string | null
        telephone: string | null
        latitude: number | null
        longitude: number | null
        adresse_societe_ligne1: string | null
        adresse_societe_cp: string | null
        adresse_societe_ville: string | null
        adresse_livraison_ligne1: string | null
        adresse_livraison_cp: string | null
        adresse_livraison_ville: string | null
      } | null | undefined
      const ligne1 = liv.adresse_livraison_ligne1
        || c?.adresse_livraison_ligne1
        || c?.adresse_societe_ligne1
        || null
      const cp = liv.adresse_livraison_cp || c?.adresse_livraison_cp || c?.adresse_societe_cp || null
      const ville = liv.adresse_livraison_ville || c?.adresse_livraison_ville || c?.adresse_societe_ville || null
      const adresse = [ligne1, liv.complement_adresse, [cp, ville].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')

      return {
        livraison_id: liv.id,
        position: idx + 1,
        tournee_position: liv.tournee_position,
        rdv_confirme: liv.rdv_confirme ?? false,
        client_id: c?.id ?? null,
        nom: c
          ? ([c.contact_prenom, c.contact_nom].filter(Boolean).join(' ') || c.raison_sociale)
          : 'Client inconnu',
        raison_sociale: c?.raison_sociale ?? null,
        telephone: c?.telephone ?? null,
        adresse,
        latitude: c?.latitude ?? null,
        longitude: c?.longitude ?? null,
        creneau_heure_debut: liv.creneau_heure_debut,
        creneau_heure_fin: liv.creneau_heure_fin,
        distance_to_next_km: null as number | null,
        time_to_next_min: null as number | null,
      }
    })

    // Distance / temps vers l'arrêt suivant (Haversine ×1.3, ~30 km/h)
    for (let i = 0; i < stops.length - 1; i++) {
      const cur = stops[i]
      const nxt = stops[i + 1]
      if (cur.latitude != null && cur.longitude != null && nxt.latitude != null && nxt.longitude != null) {
        const km = estimateRoadDistance(cur.latitude, cur.longitude, nxt.latitude, nxt.longitude)
        cur.distance_to_next_km = Math.round(km * 10) / 10
        cur.time_to_next_min = Math.round(estimateTravelTime(km))
      }
    }

    const depot = tournee.depot && tournee.depot.latitude != null && tournee.depot.longitude != null
      ? {
          id: tournee.depot.id,
          nom: tournee.depot.nom,
          adresse: tournee.depot.adresse,
          latitude: tournee.depot.latitude,
          longitude: tournee.depot.longitude,
        }
      : null

    return NextResponse.json({
      tournee: {
        id: tournee.id,
        date: tournee.date,
        creneau_debut: tournee.creneau_debut,
        creneau_fin: tournee.creneau_fin,
        notes: tournee.notes,
        livreur: tournee.livreur,
        depot,
      },
      stops,
    })
  } catch (error: unknown) {
    console.error('Erreur GET /api/admin/tournees/[id]:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
