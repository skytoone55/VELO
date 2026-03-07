#!/usr/bin/env node
/**
 * Géocodage batch des clients Ecovolt via api-adresse.data.gouv.fr
 * Usage: node scripts/geocode-ecovolt.mjs
 */

import { readFileSync } from 'fs'

// Load from .env.ecovolt.local
const envFile = readFileSync(new URL('../.env.ecovolt.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envFile.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const [k, ...v] = l.split('=')
    return [k.trim(), v.join('=').trim().replace(/^"|"$/g, '')]
  })
)
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

const BATCH_SIZE = 200
const DELAY_MS = 300
const MIN_SCORE = 0.3

async function supabaseQuery(query, method = 'GET', body = null) {
  const url = `${SUPABASE_URL}/rest/v1/${query}`
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'PATCH' ? 'return=minimal' : 'return=representation'
    }
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase ${method} failed: ${res.status} ${text}`)
  }
  if (method === 'PATCH') return null
  return res.json()
}

async function geocodeBatch(clients) {
  // Build CSV
  const header = 'id,adresse,postcode,city'
  const rows = clients.map(c => {
    const adr = (c.adresse_societe_ligne1 || '').replace(/"/g, '""')
    const cp = c.adresse_societe_cp || ''
    const ville = (c.adresse_societe_ville || '').replace(/"/g, '""')
    return `${c.id},"${adr}",${cp},"${ville}"`
  })
  const csv = [header, ...rows].join('\n')

  const form = new FormData()
  form.append('data', new Blob([csv], { type: 'text/csv' }), 'batch.csv')
  form.append('columns', 'adresse')
  form.append('postcode', 'postcode')
  form.append('city', 'city')

  const res = await fetch('https://api-adresse.data.gouv.fr/search/csv/', {
    method: 'POST',
    body: form
  })

  if (!res.ok) {
    console.error(`  Geocoding API error: ${res.status}`)
    return []
  }

  const text = await res.text()
  return parseCSVResults(text)
}

function parseCSVResults(csvText) {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',')
  const idIdx = headers.indexOf('id')
  const latIdx = headers.indexOf('latitude')
  const lngIdx = headers.indexOf('longitude')
  const scoreIdx = headers.indexOf('result_score')

  return lines.slice(1).map(line => {
    const cols = line.split(',')
    return {
      id: cols[idIdx],
      latitude: parseFloat(cols[latIdx]),
      longitude: parseFloat(cols[lngIdx]),
      score: parseFloat(cols[scoreIdx] || '0')
    }
  }).filter(r => !isNaN(r.latitude) && !isNaN(r.longitude) && r.score >= MIN_SCORE)
}

async function geocodeByCPCentroid(clients) {
  // Fallback: geocode by CP only (commune centroid)
  const results = []
  for (const c of clients) {
    const cp = c.adresse_societe_cp
    if (!cp) continue
    try {
      const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${cp}&type=municipality&postcode=${cp}&limit=1`)
      if (!res.ok) continue
      const data = await res.json()
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates
        results.push({ id: c.id, latitude: lat, longitude: lng, score: 0.3 })
      }
      await sleep(50)
    } catch { /* skip */ }
  }
  return results
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log('=== Geocodage batch Ecovolt ===')

  // Fetch all clients without coordinates
  const clients = await supabaseQuery(
    'clients?select=id,adresse_societe_ligne1,adresse_societe_cp,adresse_societe_ville&latitude=is.null&order=id&limit=2000'
  )
  console.log(`${clients.length} clients à géocoder`)

  if (clients.length === 0) {
    console.log('Rien à faire.')
    return
  }

  let geocoded = 0
  let failed = []

  // Pass 1: CSV batch geocoding
  console.log('\n--- Pass 1: Geocodage CSV batch ---')
  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE)
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(clients.length / BATCH_SIZE)} (${batch.length} clients)...`)

    const results = await geocodeBatch(batch)

    // Update Supabase for successful geocodes
    for (const r of results) {
      try {
        await supabaseQuery(`clients?id=eq.${r.id}`, 'PATCH', {
          latitude: r.latitude,
          longitude: r.longitude,
          geocoding_score: r.score,
          geocoding_source: 'batch',
          address_used_for_geocoding: 'societe'
        })
        geocoded++
      } catch (e) {
        console.error(`  Error updating ${r.id}: ${e.message}`)
      }
    }

    // Track failures
    const successIds = new Set(results.map(r => r.id))
    const batchFailed = batch.filter(c => !successIds.has(c.id))
    failed.push(...batchFailed)

    console.log(`  → ${results.length}/${batch.length} geocodés (score >= ${MIN_SCORE})`)
    await sleep(DELAY_MS)
  }

  // Pass 2: CP centroid fallback for failures
  if (failed.length > 0) {
    console.log(`\n--- Pass 2: CP centroid pour ${failed.length} echecs ---`)
    const fallbackResults = await geocodeByCPCentroid(failed)

    for (const r of fallbackResults) {
      try {
        await supabaseQuery(`clients?id=eq.${r.id}`, 'PATCH', {
          latitude: r.latitude,
          longitude: r.longitude,
          geocoding_score: r.score,
          geocoding_source: 'batch-cp-centroid',
          address_used_for_geocoding: 'societe-cp'
        })
        geocoded++
      } catch (e) {
        console.error(`  Error updating ${r.id}: ${e.message}`)
      }
    }
    console.log(`  → ${fallbackResults.length}/${failed.length} geocodés par centroide CP`)
    failed = failed.filter(c => !fallbackResults.some(r => r.id === c.id))
  }

  console.log(`\n=== Résultat final ===`)
  console.log(`Geocodés: ${geocoded}/${clients.length}`)
  console.log(`Echecs restants: ${failed.length}`)
  if (failed.length > 0) {
    console.log('CPs en echec:', [...new Set(failed.map(c => c.adresse_societe_cp))].join(', '))
  }
}

main().catch(console.error)
