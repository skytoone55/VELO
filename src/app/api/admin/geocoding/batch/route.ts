import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildClientAddress } from '@/lib/geo/utils'

/**
 * API de géocodage batch des clients
 *
 * GET  /api/admin/geocoding/batch — Stats (combien de clients sans coordonnées)
 * POST /api/admin/geocoding/batch — Lancer le géocodage batch via api-adresse.data.gouv.fr/search/csv/
 *
 * L'endpoint CSV de l'API gouvernementale est conçu pour le batch (gratuit, pas d'API key).
 * On envoie des batchs de 500 lignes max avec 200ms de délai entre chaque.
 */

const BATCH_SIZE = 500
const BATCH_DELAY_MS = 200
const MIN_SCORE_THRESHOLD = 0.4

// ─── GET : Stats de géocodage ───────────────────────────────────────────

export async function GET() {
  try {
    const adminClient = createAdminClient()

    // Total clients
    const { count: totalClients } = await adminClient
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .not('monday_sync_status', 'eq', 'deleted')

    // Clients avec coordonnées
    const { count: clientsWithCoords } = await adminClient
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .not('monday_sync_status', 'eq', 'deleted')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    // Clients sans coordonnées
    const withoutCoords = (totalClients || 0) - (clientsWithCoords || 0)

    // Clients sans adresse utilisable (échantillon pour estimation)
    // On charge les clients sans coords pour compter ceux sans adresse
    const { data: clientsSansCoords } = await adminClient
      .from('clients')
      .select('id, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville')
      .not('monday_sync_status', 'eq', 'deleted')
      .or('latitude.is.null,longitude.is.null')
      .limit(3000)

    let noAddressCount = 0
    if (clientsSansCoords) {
      for (const c of clientsSansCoords) {
        if (!buildClientAddress(c)) {
          noAddressCount++
        }
      }
    }

    return NextResponse.json({
      totalClients: totalClients || 0,
      clientsWithCoords: clientsWithCoords || 0,
      clientsWithoutCoords: withoutCoords,
      clientsNoAddress: noAddressCount,
      clientsGeocodable: withoutCoords - noAddressCount,
    })
  } catch (error: any) {
    console.error('Erreur stats géocodage:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// ─── POST : Lancer le géocodage batch ───────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { dryRun = false } = body

    const adminClient = createAdminClient()

    // Récupérer tous les clients sans coordonnées
    let allClients: any[] = []
    let page = 0
    const pageSize = 1000

    while (true) {
      const { data: clients, error } = await adminClient
        .from('clients')
        .select('id, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville')
        .not('monday_sync_status', 'eq', 'deleted')
        .or('latitude.is.null,longitude.is.null')
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) throw error
      if (!clients || clients.length === 0) break

      allClients = allClients.concat(clients)
      if (clients.length < pageSize) break
      page++
    }

    // Préparer les clients avec adresses
    const clientsToGeocode: { id: string; adresse: string; cp: string; ville: string; source: string }[] = []
    let noAddressCount = 0

    for (const client of allClients) {
      const addr = buildClientAddress(client)
      if (addr) {
        clientsToGeocode.push({
          id: client.id,
          adresse: addr.adresse,
          cp: addr.codePostal,
          ville: addr.ville,
          source: addr.source,
        })
      } else {
        noAddressCount++
      }
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalWithoutCoords: allClients.length,
        geocodable: clientsToGeocode.length,
        noAddress: noAddressCount,
        batchesRequired: Math.ceil(clientsToGeocode.length / BATCH_SIZE),
      })
    }

    // Découper en batchs et géocoder via l'API CSV
    let geocodedCount = 0
    let failedCount = 0
    let lowConfidenceCount = 0
    const batchCount = Math.ceil(clientsToGeocode.length / BATCH_SIZE)

    for (let i = 0; i < batchCount; i++) {
      const batch = clientsToGeocode.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)

      try {
        const result = await geocodeBatchCSV(batch)

        // Mettre à jour les clients géocodés
        for (const item of result) {
          if (item.lat && item.lng && item.score >= MIN_SCORE_THRESHOLD) {
            const { error: updateError } = await adminClient
              .from('clients')
              .update({
                latitude: item.lat,
                longitude: item.lng,
                geocoding_score: item.score,
                geocoding_source: 'batch',
                address_used_for_geocoding: item.source,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id)

            if (!updateError) {
              geocodedCount++
            } else {
              failedCount++
            }
          } else if (item.lat && item.lng && item.score < MIN_SCORE_THRESHOLD) {
            lowConfidenceCount++
          } else {
            failedCount++
          }
        }
      } catch (batchError) {
        console.error(`Erreur batch ${i + 1}/${batchCount}:`, batchError)
        failedCount += batch.length
      }

      // Délai entre les batchs
      if (i < batchCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
      }
    }

    return NextResponse.json({
      success: true,
      totalWithoutCoords: allClients.length,
      geocoded: geocodedCount,
      failed: failedCount,
      lowConfidence: lowConfidenceCount,
      noAddress: noAddressCount,
      batchesProcessed: batchCount,
    })
  } catch (error: any) {
    console.error('Erreur géocodage batch:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// ─── Fonction de géocodage batch via CSV ────────────────────────────────

interface BatchItem {
  id: string
  adresse: string
  cp: string
  ville: string
  source: string
}

interface GeocodedItem {
  id: string
  lat: number | null
  lng: number | null
  score: number
  source: string
}

/**
 * Utilise l'endpoint CSV de api-adresse.data.gouv.fr pour géocoder un batch
 * https://adresse.data.gouv.fr/api-doc/adresse#csv-search
 *
 * Format CSV envoyé : id, adresse, postcode, city
 * Format CSV retourné : colonnes originales + result_label, result_score, latitude, longitude, etc.
 */
async function geocodeBatchCSV(items: BatchItem[]): Promise<GeocodedItem[]> {
  // Construire le CSV
  const csvLines = ['id,adresse,postcode,city']
  for (const item of items) {
    // Échapper les champs CSV (guillemets pour les valeurs contenant des virgules)
    const adresse = escapeCsvField(item.adresse)
    const cp = escapeCsvField(item.cp)
    const ville = escapeCsvField(item.ville)
    csvLines.push(`${item.id},${adresse},${cp},${ville}`)
  }
  const csvContent = csvLines.join('\n')

  // Envoyer au service de géocodage CSV
  const formData = new FormData()
  formData.append('data', new Blob([csvContent], { type: 'text/csv' }), 'batch.csv')
  formData.append('columns', 'adresse')
  formData.append('postcode', 'postcode')
  formData.append('city', 'city')

  const response = await fetch('https://api-adresse.data.gouv.fr/search/csv/', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API géocodage CSV erreur ${response.status}: ${text}`)
  }

  const resultCsv = await response.text()

  // Parser le CSV de résultat
  return parseGeocodeCsvResult(resultCsv, items)
}

/**
 * Parse le CSV de résultat de l'API de géocodage
 */
function parseGeocodeCsvResult(csvText: string, originalItems: BatchItem[]): GeocodedItem[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  // Trouver les index des colonnes de résultat
  const headers = parseCSVLine(lines[0])
  const idIdx = headers.indexOf('id')
  const latIdx = headers.indexOf('latitude')
  const lngIdx = headers.indexOf('longitude')
  const scoreIdx = headers.indexOf('result_score')

  if (idIdx === -1 || latIdx === -1 || lngIdx === -1) {
    console.error('Colonnes manquantes dans le résultat CSV:', headers)
    return []
  }

  // Créer un map des items originaux pour récupérer le source
  const sourceMap = new Map(originalItems.map((item) => [item.id, item.source]))

  const results: GeocodedItem[] = []

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i])
    if (fields.length <= Math.max(idIdx, latIdx, lngIdx)) continue

    const id = fields[idIdx]
    const lat = parseFloat(fields[latIdx])
    const lng = parseFloat(fields[lngIdx])
    const score = scoreIdx !== -1 ? parseFloat(fields[scoreIdx]) : 0

    results.push({
      id,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      score: isNaN(score) ? 0 : score,
      source: sourceMap.get(id) || 'societe',
    })
  }

  return results
}

/**
 * Parse une ligne CSV en tenant compte des guillemets
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++ // Skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())

  return result
}

/**
 * Échappe un champ pour inclusion dans un CSV
 */
function escapeCsvField(value: string): string {
  if (!value) return ''
  // Si le champ contient une virgule, des guillemets, ou un retour à la ligne
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
