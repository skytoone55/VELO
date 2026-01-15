import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Fonction pour géocoder une adresse via l'API gouvernementale
async function geocodeAddress(adresse: string, codePostal: string, ville: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const query = encodeURIComponent(`${adresse} ${codePostal} ${ville}`)
    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${query}&limit=1`)

    if (!response.ok) return null

    const data = await response.json()

    if (data.features && data.features.length > 0) {
      const [lon, lat] = data.features[0].geometry.coordinates
      return { lat, lon }
    }
    return null
  } catch (error) {
    console.error('Erreur géocodage:', error)
    return null
  }
}

// Calcul de distance avec formule Haversine
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId, address, useSocieteAddress } = body

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID requis' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Récupérer les infos du client
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('agence, adresse_societe_ligne1, adresse_societe_ligne2, adresse_societe_cp, adresse_societe_ville')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      console.error('Client error:', clientError)
      return NextResponse.json(
        { error: 'Client non trouvé' },
        { status: 404 }
      )
    }

    // Déterminer l'adresse de livraison
    const livraisonAddress = useSocieteAddress
      ? {
          ligne1: client.adresse_societe_ligne1,
          ligne2: client.adresse_societe_ligne2 || null,
          codePostal: client.adresse_societe_cp,
          ville: client.adresse_societe_ville,
        }
      : address

    // Vérifier que l'adresse est complète
    if (!livraisonAddress?.ligne1 || !livraisonAddress?.codePostal || !livraisonAddress?.ville) {
      return NextResponse.json(
        { error: 'Adresse de livraison incomplète' },
        { status: 400 }
      )
    }

    // Géocoder l'adresse de livraison
    const coords = await geocodeAddress(
      livraisonAddress.ligne1,
      livraisonAddress.codePostal,
      livraisonAddress.ville
    )

    // Récupérer TOUS les dépôts actifs de l'agence
    const { data: allDepots } = await adminClient
      .from('depots')
      .select('id, nom, adresse, code_postal, ville, latitude, longitude, rayon_couverture_km, type')
      .eq('agence', client.agence)
      .eq('actif', true)

    // Séparer les dépôts par type
    const depotsRetrait = allDepots?.filter(d => d.type === 'retrait') || []
    const depotsLogistique = allDepots?.filter(d => d.type === 'logistique') || []

    let depotRetraitAssigne = null
    let depotLogistiqueAssigne = null
    let modeLivraison: 'retrait' | 'domicile' = 'domicile'
    let horsZone = false

    if (coords) {
      // 1. Chercher si le client est dans le rayon d'un dépôt RETRAIT
      for (const depot of depotsRetrait) {
        if (depot.latitude && depot.longitude) {
          const distance = calculateDistance(coords.lat, coords.lon, depot.latitude, depot.longitude)

          if (distance <= depot.rayon_couverture_km) {
            // Client dans le rayon - DOIT récupérer ici
            depotRetraitAssigne = {
              ...depot,
              distance: Math.round(distance * 10) / 10
            }
            modeLivraison = 'retrait'
            break // Prendre le premier dépôt dans le rayon
          }
        }
      }

      // 2. Si pas dans un rayon de retrait, chercher le dépôt LOGISTIQUE le plus proche
      if (!depotRetraitAssigne) {
        let distanceMin = Infinity

        for (const depot of depotsLogistique) {
          if (depot.latitude && depot.longitude) {
            const distance = calculateDistance(coords.lat, coords.lon, depot.latitude, depot.longitude)

            if (distance < distanceMin) {
              distanceMin = distance
              depotLogistiqueAssigne = {
                ...depot,
                distance: Math.round(distance * 10) / 10
              }
            }
          }
        }

        modeLivraison = 'domicile'

        // Si aucun dépôt logistique trouvé, client hors zone
        if (!depotLogistiqueAssigne) {
          horsZone = true
        }
      }
    } else {
      // Pas de coordonnées - impossible de calculer
      horsZone = true
    }

    // Préparer les données de mise à jour du client
    const updateData: Record<string, any> = {
      adresse_livraison_ligne1: livraisonAddress.ligne1,
      adresse_livraison_ligne2: livraisonAddress.ligne2 || null,
      adresse_livraison_cp: livraisonAddress.codePostal,
      adresse_livraison_ville: livraisonAddress.ville,
      updated_at: new Date().toISOString(),
      // Réinitialiser les deux champs
      depot_retrait_id: null,
      depot_logistique_id: null,
    }

    // Ajouter les coordonnées si trouvées
    if (coords) {
      updateData.latitude = coords.lat
      updateData.longitude = coords.lon
    }

    // Assigner le dépôt selon le mode
    if (depotRetraitAssigne) {
      updateData.depot_retrait_id = depotRetraitAssigne.id
    } else if (depotLogistiqueAssigne) {
      updateData.depot_logistique_id = depotLogistiqueAssigne.id
    }

    const { error: updateError } = await adminClient
      .from('clients')
      .update(updateData)
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur update adresse:', updateError)
      return NextResponse.json(
        { error: 'Erreur lors de la sauvegarde' },
        { status: 500 }
      )
    }

    // Mettre en cache la distance
    const depotAssigne = depotRetraitAssigne || depotLogistiqueAssigne
    if (depotAssigne) {
      try {
        await adminClient.from('distances_cache').upsert({
          client_id: clientId,
          depot_id: depotAssigne.id,
          distance_km: depotAssigne.distance,
          calculated_at: new Date().toISOString(),
        }, { onConflict: 'client_id,depot_id' })
      } catch {
        // Ignorer les erreurs de cache, pas critique
      }
    }

    if (horsZone) {
      // Enregistrer dans clients_hors_zone
      await adminClient.from('clients_hors_zone').upsert({
        client_id: clientId,
        statut: 'en_attente',
        depot_plus_proche_id: null,
        distance_depot_plus_proche_km: null,
      }, { onConflict: 'client_id' })

      // Créer alerte admin
      await adminClient.from('email_alerts').insert({
        type: 'client_hors_zone',
        client_id: clientId,
        message: 'Client hors zone de couverture - aucun dépôt disponible',
        details: {
          adresse: livraisonAddress,
          agence: client.agence,
        },
      })
    }

    return NextResponse.json({
      success: true,
      modeLivraison,
      horsZone,
      depotRetrait: depotRetraitAssigne,
      depotLogistique: depotLogistiqueAssigne,
      coordonnees: coords,
    })

  } catch (error: any) {
    console.error('Erreur API save-address:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
