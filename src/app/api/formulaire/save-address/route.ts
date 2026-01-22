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
      .select('id, nom, adresse, code_postal, ville, latitude, longitude, rayon_couverture_km, rayon_livraison_payant_km, prix_livraison_payante, type')
      .eq('agence', client.agence)
      .eq('actif', true)

    // Séparer les dépôts par type
    const depotsRetrait = allDepots?.filter(d => d.type === 'retrait') || []
    const depotsLogistique = allDepots?.filter(d => d.type === 'logistique') || []

    let depotAssigneInfo: any = null
    let modeLivraison: 'retrait' | 'domicile' = 'domicile'
    let zoneLivraison: 'gratuite' | 'payante' | 'hors_zone' = 'gratuite'
    let depotType: 'retrait' | 'logistique' = 'logistique'
    let horsZone = false

    // Logique de zone selon le type de dépôt:
    //
    // DEPOT DE RETRAIT:
    // - 0 à rayon_couverture_km = Zone gratuite (retrait gratuit uniquement)
    // - rayon_couverture_km à rayon_livraison_payant_km = Zone payante (retrait gratuit OU livraison payante)
    // - Au-delà = Hors zone
    //
    // DEPOT LOGISTIQUE:
    // - 0 à rayon_couverture_km = Zone gratuite (livraison gratuite)
    // - rayon_couverture_km à rayon_livraison_payant_km = Zone payante (livraison payante)
    // - Au-delà = Hors zone

    if (coords) {
      // 1. D'abord chercher le dépôt RETRAIT le plus proche
      let depotRetraitProche: any = null
      let distanceRetraitMin = Infinity

      for (const depot of depotsRetrait) {
        if (depot.latitude && depot.longitude) {
          const distance = calculateDistance(coords.lat, coords.lon, depot.latitude, depot.longitude)
          if (distance < distanceRetraitMin) {
            distanceRetraitMin = distance
            depotRetraitProche = {
              ...depot,
              distance: Math.round(distance * 10) / 10
            }
          }
        }
      }

      // 2. Chercher le dépôt LOGISTIQUE le plus proche
      let depotLogistiqueProche: any = null
      let distanceLogistiqueMin = Infinity

      for (const depot of depotsLogistique) {
        if (depot.latitude && depot.longitude) {
          const distance = calculateDistance(coords.lat, coords.lon, depot.latitude, depot.longitude)
          if (distance < distanceLogistiqueMin) {
            distanceLogistiqueMin = distance
            depotLogistiqueProche = {
              ...depot,
              distance: Math.round(distance * 10) / 10
            }
          }
        }
      }

      // 3. Déterminer quel dépôt et quelle zone selon la distance
      // Priorité au dépôt retrait si le client est dans sa couverture
      if (depotRetraitProche) {
        const rayonGratuit = depotRetraitProche.rayon_couverture_km || 30
        const rayonPayant = depotRetraitProche.rayon_livraison_payant_km || rayonGratuit

        if (distanceRetraitMin <= rayonGratuit) {
          // Client dans zone retrait gratuit
          depotAssigneInfo = depotRetraitProche
          depotType = 'retrait'
          modeLivraison = 'retrait'
          zoneLivraison = 'gratuite'
        } else if (distanceRetraitMin <= rayonPayant) {
          // Client dans zone retrait payante (choix retrait gratuit ou livraison payante)
          depotAssigneInfo = depotRetraitProche
          depotType = 'retrait'
          modeLivraison = 'retrait'
          zoneLivraison = 'payante'
        }
      }

      // Si pas dans la couverture d'un dépôt retrait, utiliser le dépôt logistique
      if (!depotAssigneInfo && depotLogistiqueProche) {
        const rayonGratuit = depotLogistiqueProche.rayon_couverture_km || 30
        const rayonPayant = depotLogistiqueProche.rayon_livraison_payant_km || rayonGratuit

        if (distanceLogistiqueMin <= rayonGratuit) {
          // Client dans zone livraison gratuite
          depotAssigneInfo = depotLogistiqueProche
          depotType = 'logistique'
          modeLivraison = 'domicile'
          zoneLivraison = 'gratuite'
        } else if (distanceLogistiqueMin <= rayonPayant) {
          // Client dans zone livraison payante
          depotAssigneInfo = depotLogistiqueProche
          depotType = 'logistique'
          modeLivraison = 'domicile'
          zoneLivraison = 'payante'
        } else {
          // Client hors zone
          depotAssigneInfo = depotLogistiqueProche // Garder pour info
          depotType = 'logistique'
          zoneLivraison = 'hors_zone'
          horsZone = true
        }
      }

      // Si aucun dépôt trouvé du tout
      if (!depotAssigneInfo) {
        horsZone = true
        zoneLivraison = 'hors_zone'
      }
    } else {
      // Pas de coordonnées - impossible de calculer
      horsZone = true
      zoneLivraison = 'hors_zone'
    }

    // Variables de compatibilité avec l'ancien code
    const depotRetraitAssigne = depotType === 'retrait' ? depotAssigneInfo : null
    const depotLogistiqueAssigne = depotType === 'logistique' ? depotAssigneInfo : null

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
      zoneLivraison,
      depotType,
      horsZone,
      depotRetrait: depotRetraitAssigne,
      depotLogistique: depotLogistiqueAssigne,
      prixLivraisonPayante: depotAssigneInfo?.prix_livraison_payante || 0,
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
