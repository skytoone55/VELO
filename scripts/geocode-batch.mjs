#!/usr/bin/env node
/**
 * Script standalone de géocodage batch des clients
 * Utilise l'API CSV de api-adresse.data.gouv.fr (gratuit, pas d'API key)
 *
 * Usage: node scripts/geocode-batch.mjs
 */

import { createClient } from '@supabase/supabase-js'

// ========== CONFIG ==========
const SUPABASE_URL = 'https://zfpzhhdovxllchlsihcr.supabase.co'
const SUPABASE_SERVICE_KEY = 'REDACTED'

const BATCH_SIZE = 500
const BATCH_DELAY_MS = 300
const MIN_SCORE_THRESHOLD = 0.4

// ========== SUPABASE CLIENT ==========
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ========== MAIN ==========
async function main() {
  console.log('=== Géocodage batch des clients PPE ===\n')

  // 1. Récupérer tous les clients sans coordonnées
  console.log('Chargement des clients sans coordonnées...')
  let allClients = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, raison_sociale, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_ligne1, adresse_societe_cp, adresse_societe_ville')
      .not('monday_sync_status', 'eq', 'deleted')
      .or('latitude.is.null,longitude.is.null')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.error('Erreur chargement clients:', error.message)
      process.exit(1)
    }
    if (!clients || clients.length === 0) break

    allClients = allClients.concat(clients)
    console.log(`  Page ${page + 1}: ${clients.length} clients chargés (total: ${allClients.length})`)
    if (clients.length < pageSize) break
    page++
  }

  console.log(`\nTotal clients sans coordonnées: ${allClients.length}`)

  // 2. Préparer les clients avec adresses
  const clientsToGeocode = []
  let noAddressCount = 0

  for (const client of allClients) {
    const addr = buildClientAddress(client)
    if (addr) {
      clientsToGeocode.push({
        id: client.id,
        nom: client.raison_sociale,
        adresse: addr.adresse,
        cp: addr.codePostal,
        ville: addr.ville,
        source: addr.source,
      })
    } else {
      noAddressCount++
    }
  }

  console.log(`Géocodables: ${clientsToGeocode.length}`)
  console.log(`Sans adresse: ${noAddressCount}`)

  if (clientsToGeocode.length === 0) {
    console.log('\nAucun client à géocoder.')
    return
  }

  // 3. Géocoder par batchs
  const batchCount = Math.ceil(clientsToGeocode.length / BATCH_SIZE)
  console.log(`\nLancement du géocodage en ${batchCount} batch(s) de ${BATCH_SIZE}...\n`)

  let geocodedCount = 0
  let failedCount = 0
  let lowConfidenceCount = 0
  let updateErrorCount = 0

  for (let i = 0; i < batchCount; i++) {
    const batch = clientsToGeocode.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    const batchLabel = `Batch ${i + 1}/${batchCount} (${batch.length} clients)`

    try {
      console.log(`${batchLabel} — envoi à l'API CSV...`)
      const results = await geocodeBatchCSV(batch)

      let batchGeocoded = 0
      let batchFailed = 0
      let batchLowConf = 0

      for (const item of results) {
        if (item.lat && item.lng && item.score >= MIN_SCORE_THRESHOLD) {
          const { error: updateError } = await supabase
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
            batchGeocoded++
          } else {
            updateErrorCount++
          }
        } else if (item.lat && item.lng && item.score < MIN_SCORE_THRESHOLD) {
          batchLowConf++
        } else {
          batchFailed++
        }
      }

      geocodedCount += batchGeocoded
      failedCount += batchFailed
      lowConfidenceCount += batchLowConf

      console.log(`  ✓ ${batchGeocoded} géocodés, ${batchLowConf} score faible, ${batchFailed} échecs`)
    } catch (batchError) {
      console.error(`  ✗ Erreur batch: ${batchError.message}`)
      failedCount += batch.length
    }

    // Délai entre les batchs
    if (i < batchCount - 1) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  // 4. Résumé
  console.log('\n=== RÉSULTAT FINAL ===')
  console.log(`Total clients traités: ${allClients.length}`)
  console.log(`Géocodés avec succès: ${geocodedCount}`)
  console.log(`Score trop faible (<${MIN_SCORE_THRESHOLD}): ${lowConfidenceCount}`)
  console.log(`Échecs géocodage: ${failedCount}`)
  console.log(`Erreurs mise à jour DB: ${updateErrorCount}`)
  console.log(`Sans adresse (ignorés): ${noAddressCount}`)

  // 5. Tenter le fallback CP+ville pour les échecs et scores faibles
  if (failedCount > 0 || lowConfidenceCount > 0) {
    console.log('\n=== PASSE 2 : Fallback CP+ville pour les clients non géocodés ===')
    await geocodeFallback()
  }
}

// ========== FALLBACK : Géocodage CP + ville ==========

async function geocodeFallback() {
  // Recharger les clients toujours sans coordonnées
  let remainingClients = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, raison_sociale, adresse_livraison_cp, adresse_livraison_ville, adresse_societe_cp, adresse_societe_ville')
      .not('monday_sync_status', 'eq', 'deleted')
      .or('latitude.is.null,longitude.is.null')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) break
    if (!clients || clients.length === 0) break
    remainingClients = remainingClients.concat(clients)
    if (clients.length < pageSize) break
    page++
  }

  console.log(`Clients restants sans coordonnées: ${remainingClients.length}`)

  // Préparer les adresses CP+ville uniquement
  const fallbackClients = []
  for (const client of remainingClients) {
    const cp = client.adresse_livraison_cp || client.adresse_societe_cp
    const ville = client.adresse_livraison_ville || client.adresse_societe_ville
    if (cp && ville) {
      fallbackClients.push({
        id: client.id,
        nom: client.raison_sociale,
        adresse: '', // pas d'adresse de rue
        cp,
        ville,
        source: 'fallback_cp_ville',
      })
    }
  }

  if (fallbackClients.length === 0) {
    console.log('Aucun client avec CP+ville pour le fallback.')
    return
  }

  console.log(`Clients avec CP+ville pour fallback: ${fallbackClients.length}`)

  const batchCount = Math.ceil(fallbackClients.length / BATCH_SIZE)
  let geocodedCount = 0

  for (let i = 0; i < batchCount; i++) {
    const batch = fallbackClients.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)

    try {
      // Pour le fallback, on utilise l'API individuelle car le CSV attend une colonne adresse
      for (const item of batch) {
        const result = await geocodeSingle(`${item.cp} ${item.ville}`)
        if (result && result.score >= 0.3) {
          // Score plafonné à 0.5 car c'est un géocodage au niveau commune
          const cappedScore = Math.min(result.score, 0.5)

          const { error } = await supabase
            .from('clients')
            .update({
              latitude: result.lat,
              longitude: result.lng,
              geocoding_score: cappedScore,
              geocoding_source: 'batch_fallback',
              address_used_for_geocoding: 'cp_ville',
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)

          if (!error) geocodedCount++
        }
        // Petit délai pour ne pas surcharger l'API
        await sleep(50)
      }
      console.log(`  Fallback batch ${i + 1}/${batchCount}: ${geocodedCount} géocodés au total`)
    } catch (err) {
      console.error(`  Erreur fallback batch ${i + 1}:`, err.message)
    }

    if (i < batchCount - 1) await sleep(200)
  }

  console.log(`\nFallback terminé: ${geocodedCount} clients géocodés par CP+ville`)
}

// ========== FONCTIONS UTILITAIRES ==========

function buildClientAddress(client) {
  if (client.adresse_livraison_ligne1 && client.adresse_livraison_cp && client.adresse_livraison_ville) {
    return {
      adresse: client.adresse_livraison_ligne1,
      codePostal: client.adresse_livraison_cp,
      ville: client.adresse_livraison_ville,
      source: 'livraison',
    }
  }
  if (client.adresse_societe_ligne1 && client.adresse_societe_cp && client.adresse_societe_ville) {
    return {
      adresse: client.adresse_societe_ligne1,
      codePostal: client.adresse_societe_cp,
      ville: client.adresse_societe_ville,
      source: 'societe',
    }
  }
  return null
}

async function geocodeBatchCSV(items) {
  // Construire le CSV
  const csvLines = ['id,adresse,postcode,city']
  for (const item of items) {
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
  return parseGeocodeCsvResult(resultCsv, items)
}

async function geocodeSingle(query) {
  try {
    const encoded = encodeURIComponent(query)
    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encoded}&limit=1`)
    if (!response.ok) return null

    const data = await response.json()
    if (data.features && data.features.length > 0) {
      const feature = data.features[0]
      const [lng, lat] = feature.geometry.coordinates
      const score = feature.properties?.score || 0
      return { lat, lng, score }
    }
    return null
  } catch {
    return null
  }
}

function parseGeocodeCsvResult(csvText, originalItems) {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0])
  const idIdx = headers.indexOf('id')
  const latIdx = headers.indexOf('latitude')
  const lngIdx = headers.indexOf('longitude')
  const scoreIdx = headers.indexOf('result_score')

  if (idIdx === -1 || latIdx === -1 || lngIdx === -1) {
    console.error('Colonnes manquantes dans le résultat CSV:', headers)
    return []
  }

  const sourceMap = new Map(originalItems.map((item) => [item.id, item.source]))
  const results = []

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

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
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

function escapeCsvField(value) {
  if (!value) return ''
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ========== LANCEMENT ==========
main().catch((err) => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
