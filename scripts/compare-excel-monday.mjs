import XLSX from 'xlsx'

// ── Config ──
const MONDAY_API_KEY = 'REDACTED_MONDAY_PPE_TOKEN'

// Les 7 boards PPE avec leurs colonnes spécifiques
const BOARDS = [
  {
    id: 2144986053, name: 'CLIENT ATHOME',
    siret: 'text_mkvqtq36', ref: 'text_mkvm2hb5',
    email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa',
    ape: 'text_mkvkhf8p',
  },
  {
    id: 5013455904, name: 'CLIENT SALIH',
    siret: 'text_mkvq3yka', ref: 'text_mkvmgppx',
    email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa',
    ape: 'text_mkvk64jp',
  },
  {
    id: 5002798369, name: 'CLIENT ALEX',
    siret: 'text_mkvq3yka', ref: 'text_mkvmgppx',
    email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa',
    ape: 'text_mkvk64jp',
  },
  {
    id: 5001072451, name: 'CLIENT STELLARS',
    siret: 'text_mkvq3yka', ref: 'text_mkvmgppx',
    email: 'email_mkw56r94', tel: 'phone_mkw5e4p2', prenom: 'text_mkw6q1vb',
    ape: 'text_mkvk64jp',
  },
  {
    id: 2140187165, name: 'CLIENT EKL',
    siret: 'numeric_mkvjym8v', ref: 'text_mkvmsyz1',
    email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa',
    ape: 'text_mkvks2a4',
  },
  {
    id: 2137662048, name: 'CLIENT JM',
    siret: 'text_mkvq7s', ref: 'text_mkvm7z5h',
    email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa',
    ape: 'text_mkvkj1mb',
  },
  {
    id: 2146667697, name: 'CLIENT DIZIEN VELO',
    siret: 'text_mkvq3yka', ref: 'text_mkvmgppx',
    email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa',
    ape: 'text_mkvk64jp',
  },
]

// Colonnes communes à tous les boards (vérifiées identiques sur les 7 boards)
const COMMON_COLS = {
  nom: 'text_mkvj39h',
  adresse: 'text_mkvj6f51',
  cp: 'numeric_mkvjbazm',
  ville: 'text_mkvjgcp9',
  // NOTE: ape/NAF est maintenant per-board car les IDs diffèrent
}

// ── 1. Lire l'Excel ──
console.log('=== LECTURE DU FICHIER EXCEL ===')
const workbook = XLSX.readFile('/Users/john/JARVIS/velo/donnee excel.xlsx')
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
console.log(`Excel: ${rows.length} lignes lues`)

const excelBySiret = new Map()
const excelByRef = new Map()

for (const row of rows) {
  const siren = row['SIREN du bénéficiaire  de l\'opération']
  const ref = row['REFERENCE interne de l\'opération']

  const entry = {
    siret: siren ? String(siren).trim() : null,
    ref: ref ? String(ref).trim() : null,
    raisonSociale: row['RAISON SOCIALE  du bénéficiaire  de l\'opération'] ? String(row['RAISON SOCIALE  du bénéficiaire  de l\'opération']).trim() : null,
    adresse: row['ADRESSE  du siège social du bénéficiaire de l\'opération'] ? String(row['ADRESSE  du siège social du bénéficiaire de l\'opération']).trim() : null,
    cp: row['CODE POSTAL du siège social du bénéficiaire de l\'opération'] ? String(row['CODE POSTAL du siège social du bénéficiaire de l\'opération']).trim().padStart(5, '0') : null,
    ville: row['VILLE  du siège social du bénéficiaire de l\'opération'] ? String(row['VILLE  du siège social du bénéficiaire de l\'opération']).trim() : null,
    email: row['Adresse de courriel du bénéficiaire'] ? String(row['Adresse de courriel du bénéficiaire']).trim().toLowerCase() : null,
    tel: row['Numéro de téléphone du bénéficiaire'] ? String(row['Numéro de téléphone du bénéficiaire']).trim() : null,
    nom: row['NOM  du bénéficiaire  de l\'opération'] ? String(row['NOM  du bénéficiaire  de l\'opération']).trim() : null,
    prenom: row['PRENOM  du bénéficiaire  de l\'opération'] ? String(row['PRENOM  du bénéficiaire  de l\'opération']).trim() : null,
    ape: row['Code APE NAF du Beneficiaire'] ? String(row['Code APE NAF du Beneficiaire']).trim() : null,
  }

  if (entry.ref) excelByRef.set(entry.ref, entry)

  if (entry.siret) {
    if (!excelBySiret.has(entry.siret)) {
      excelBySiret.set(entry.siret, [])
    }
    excelBySiret.get(entry.siret).push(entry)
  }
}

console.log(`Excel: ${excelBySiret.size} SIRET uniques, ${excelByRef.size} références uniques`)

// ── 2. Récupérer les clients Monday ──
console.log('\n=== RÉCUPÉRATION DES CLIENTS MONDAY ===')

async function fetchBoardItems(boardId) {
  const items = []
  let cursor = null

  while (true) {
    const query = cursor
      ? `query { next_items_page(cursor: "${cursor}", limit: 500) { cursor items { id name column_values { id text value } } } }`
      : `query { boards(ids: ${boardId}) { name items_page(limit: 500) { cursor items { id name column_values { id text value } } } } }`

    const resp = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': MONDAY_API_KEY,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query })
    })

    const data = await resp.json()
    let page
    if (cursor) {
      page = data.data.next_items_page
    } else {
      const board = data.data.boards[0]
      console.log(`Board ${boardId} (${board.name}):`)
      page = board.items_page
    }

    items.push(...page.items)
    if (!page.cursor) break
    cursor = page.cursor
  }

  console.log(`  → ${items.length} items`)
  return items
}

function getCol(item, colId) {
  const col = item.column_values.find(c => c.id === colId)
  if (!col) return null
  return col.text ? col.text.trim() : null
}

const allMondayItems = []

for (const board of BOARDS) {
  const items = await fetchBoardItems(board.id)
  for (const item of items) {
    allMondayItems.push({ ...item, boardId: board.id, boardName: board.name, boardCols: board })
  }
  // Pause entre chaque board pour respecter le rate limit
  await new Promise(r => setTimeout(r, 1500))
}

console.log(`\nTotal Monday: ${allMondayItems.length} items`)

// ── 3. Parser les items Monday avec colonnes par board ──
const mondayBySiret = new Map()
const mondayByRef = new Map()
let mondayNoSiret = 0
const mondayItems = []

for (const item of allMondayItems) {
  const bc = item.boardCols // colonnes spécifiques au board

  const parsed = {
    mondayId: item.id,
    mondayName: item.name,
    boardId: item.boardId,
    boardName: item.boardName,
    ref: getCol(item, bc.ref),
    nom: getCol(item, COMMON_COLS.nom),
    prenom: getCol(item, bc.prenom),
    email: getCol(item, bc.email)?.toLowerCase() || null,
    tel: getCol(item, bc.tel),
    siret: getCol(item, bc.siret),
    adresse: getCol(item, COMMON_COLS.adresse),
    cp: getCol(item, COMMON_COLS.cp),
    ville: getCol(item, COMMON_COLS.ville),
    ape: getCol(item, bc.ape),
  }

  mondayItems.push(parsed)

  if (parsed.ref) mondayByRef.set(parsed.ref, parsed)

  if (parsed.siret) {
    if (!mondayBySiret.has(parsed.siret)) {
      mondayBySiret.set(parsed.siret, [])
    }
    mondayBySiret.get(parsed.siret).push(parsed)
  } else {
    mondayNoSiret++
  }
}

console.log(`Monday: ${mondayBySiret.size} SIRET uniques, ${mondayByRef.size} refs, ${mondayNoSiret} sans SIRET`)

// Stats par board
console.log('\nRépartition par board:')
const boardStats = {}
for (const item of mondayItems) {
  if (!boardStats[item.boardName]) boardStats[item.boardName] = { total: 0, withSiret: 0, withRef: 0 }
  boardStats[item.boardName].total++
  if (item.siret) boardStats[item.boardName].withSiret++
  if (item.ref) boardStats[item.boardName].withRef++
}
for (const [name, stats] of Object.entries(boardStats)) {
  console.log(`  ${name}: ${stats.total} items (${stats.withSiret} avec SIRET, ${stats.withRef} avec ref)`)
}

// ── 4a. DOUBLONS SIRET : tout SIRET apparaissant 2+ fois (tous boards confondus) ──
console.log('\n' + '='.repeat(80))
console.log('=== DOUBLONS SIRET (tout tableau confondu) ===')
console.log('='.repeat(80))

let doublonSiretCount = 0
const doublonSiretDetails = []
for (const [siret, items] of mondayBySiret) {
  if (items.length > 1) {
    doublonSiretCount++
    const boards = [...new Set(items.map(i => i.boardName))]
    const crossBoard = boards.length > 1 ? '🔴 CROSS-BOARD' : '🟡 MÊME BOARD'
    console.log(`\n⚠️  SIRET ${siret} — ${items.length} occurrences ${crossBoard} [${boards.join(', ')}]:`)
    for (const item of items) {
      console.log(`    - [${item.mondayId}] "${item.mondayName}" board=${item.boardName} ref=${item.ref || 'VIDE'} nom=${item.nom || ''} ${item.prenom || ''}`)
    }
    doublonSiretDetails.push({
      siret,
      count: items.length,
      crossBoard: boards.length > 1,
      boards,
      items: items.map(i => ({ id: i.mondayId, name: i.mondayName, ref: i.ref, board: i.boardName }))
    })
  }
}
if (doublonSiretCount === 0) console.log('Aucun doublon SIRET détecté.')
const crossBoardSiret = doublonSiretDetails.filter(d => d.crossBoard).length
const sameBoardSiret = doublonSiretDetails.filter(d => !d.crossBoard).length
console.log(`\nTotal doublons SIRET: ${doublonSiretCount} (${crossBoardSiret} cross-board, ${sameBoardSiret} même board)`)

// ── 4b. DOUBLONS RETINA : toute référence apparaissant 2+ fois (tous boards confondus) ──
console.log('\n' + '='.repeat(80))
console.log('=== DOUBLONS RETINA (tout tableau confondu) ===')
console.log('='.repeat(80))

// Construire un index ref → [items]
const mondayByRefAll = new Map()
for (const item of mondayItems) {
  if (item.ref) {
    if (!mondayByRefAll.has(item.ref)) {
      mondayByRefAll.set(item.ref, [])
    }
    mondayByRefAll.get(item.ref).push(item)
  }
}

let doublonRefCount = 0
const doublonRefDetails = []
for (const [ref, items] of mondayByRefAll) {
  if (items.length > 1) {
    doublonRefCount++
    const boards = [...new Set(items.map(i => i.boardName))]
    const crossBoard = boards.length > 1 ? '🔴 CROSS-BOARD' : '🟡 MÊME BOARD'
    console.log(`\n⚠️  RETINA "${ref}" — ${items.length} occurrences ${crossBoard} [${boards.join(', ')}]:`)
    for (const item of items) {
      console.log(`    - [${item.mondayId}] "${item.mondayName}" board=${item.boardName} SIRET=${item.siret || 'VIDE'} nom=${item.nom || ''} ${item.prenom || ''}`)
    }
    doublonRefDetails.push({
      ref,
      count: items.length,
      crossBoard: boards.length > 1,
      boards,
      items: items.map(i => ({ id: i.mondayId, name: i.mondayName, siret: i.siret, board: i.boardName }))
    })
  }
}
if (doublonRefCount === 0) console.log('Aucun doublon RETINA détecté.')
const crossBoardRef = doublonRefDetails.filter(d => d.crossBoard).length
const sameBoardRef = doublonRefDetails.filter(d => !d.crossBoard).length
console.log(`\nTotal doublons RETINA: ${doublonRefCount} (${crossBoardRef} cross-board, ${sameBoardRef} même board)`)

// ── 5. Clients Monday SANS correspondance Excel ──
console.log('\n' + '='.repeat(80))
console.log('=== CLIENTS MONDAY ABSENTS DE L\'EXCEL ===')
console.log('='.repeat(80))

let absentCount = 0
const absentItems = []
for (const item of mondayItems) {
  let found = false
  if (item.ref && excelByRef.has(item.ref)) {
    found = true
  }
  if (!found && item.siret && excelBySiret.has(item.siret)) {
    found = true
  }
  if (!found) {
    absentCount++
    absentItems.push(item)
    console.log(`❌ [${item.mondayId}] "${item.mondayName}" board=${item.boardName} SIRET=${item.siret || 'VIDE'} ref=${item.ref || 'VIDE'}`)
  }
}
console.log(`\nTotal absents de l'Excel: ${absentCount}`)

// Absents par board
const absentByBoard = {}
for (const item of absentItems) {
  if (!absentByBoard[item.boardName]) absentByBoard[item.boardName] = 0
  absentByBoard[item.boardName]++
}
console.log('Par board:')
for (const [name, count] of Object.entries(absentByBoard)) {
  console.log(`  ${name}: ${count}`)
}

// ── 6. Clients Excel SANS correspondance Monday ──
console.log('\n' + '='.repeat(80))
console.log('=== CLIENTS EXCEL ABSENTS DE MONDAY ===')
console.log('='.repeat(80))

let excelAbsentCount = 0
for (const [siret, entries] of excelBySiret) {
  // Vérifier si ce SIRET existe dans Monday
  if (!mondayBySiret.has(siret)) {
    // Vérifier aussi par ref
    let foundByRef = false
    for (const entry of entries) {
      if (entry.ref && mondayByRef.has(entry.ref)) {
        foundByRef = true
        break
      }
    }
    if (!foundByRef) {
      excelAbsentCount++
      const entry = entries[0]
      if (excelAbsentCount <= 50) { // Limiter l'affichage
        console.log(`❌ SIRET ${siret} "${entry.raisonSociale}" ref=${entry.ref} — absent de Monday`)
      }
    }
  }
}
if (excelAbsentCount > 50) console.log(`  ... et ${excelAbsentCount - 50} autres`)
console.log(`\nTotal SIRET Excel absents de Monday: ${excelAbsentCount}`)

// ── 7. Comparaison des données : Monday vs Excel ──
console.log('\n' + '='.repeat(80))
console.log('=== DIFFÉRENCES MONDAY vs EXCEL ===')
console.log('='.repeat(80))

function normalize(val) {
  if (!val) return ''
  return String(val).trim().toUpperCase().replace(/\s+/g, ' ')
}

function normalizeCp(val) {
  if (!val) return ''
  return String(val).trim().padStart(5, '0')
}

function normalizeTel(val) {
  if (!val) return ''
  return String(val).replace(/[^0-9]/g, '')
}

let diffCount = 0
const diffs = []

for (const mItem of mondayItems) {
  let excelEntry = null
  if (mItem.ref && excelByRef.has(mItem.ref)) {
    excelEntry = excelByRef.get(mItem.ref)
  }
  if (!excelEntry && mItem.siret && excelBySiret.has(mItem.siret)) {
    excelEntry = excelBySiret.get(mItem.siret)[0]
  }
  if (!excelEntry) continue

  const differences = []

  // Comparer les champs clés
  if (normalize(mItem.nom) !== normalize(excelEntry.nom) && excelEntry.nom) {
    differences.push(`NOM: Monday="${mItem.nom}" vs Excel="${excelEntry.nom}"`)
  }
  if (normalize(mItem.prenom) !== normalize(excelEntry.prenom) && excelEntry.prenom) {
    differences.push(`PRENOM: Monday="${mItem.prenom}" vs Excel="${excelEntry.prenom}"`)
  }
  if (normalize(mItem.adresse) !== normalize(excelEntry.adresse) && excelEntry.adresse) {
    differences.push(`ADRESSE: Monday="${mItem.adresse || 'VIDE'}" vs Excel="${excelEntry.adresse}"`)
  }
  if (normalizeCp(mItem.cp) !== normalizeCp(excelEntry.cp) && excelEntry.cp) {
    differences.push(`CP: Monday="${mItem.cp || 'VIDE'}" vs Excel="${excelEntry.cp}"`)
  }
  if (normalize(mItem.ville) !== normalize(excelEntry.ville) && excelEntry.ville) {
    differences.push(`VILLE: Monday="${mItem.ville || 'VIDE'}" vs Excel="${excelEntry.ville}"`)
  }
  if (mItem.email && excelEntry.email && normalize(mItem.email) !== normalize(excelEntry.email)) {
    differences.push(`EMAIL: Monday="${mItem.email}" vs Excel="${excelEntry.email}"`)
  }
  if (mItem.tel && excelEntry.tel && normalizeTel(mItem.tel) !== normalizeTel(excelEntry.tel)) {
    differences.push(`TEL: Monday="${mItem.tel}" vs Excel="${excelEntry.tel}"`)
  }

  // Champs vides dans Monday mais présents dans Excel
  if (!mItem.nom && excelEntry.nom) {
    differences.push(`NOM MANQUANT dans Monday (Excel="${excelEntry.nom}")`)
  }
  if (!mItem.prenom && excelEntry.prenom) {
    differences.push(`PRENOM MANQUANT dans Monday (Excel="${excelEntry.prenom}")`)
  }
  if (!mItem.adresse && excelEntry.adresse) {
    differences.push(`ADRESSE MANQUANTE dans Monday (Excel="${excelEntry.adresse}")`)
  }
  if (!mItem.cp && excelEntry.cp) {
    differences.push(`CP MANQUANT dans Monday (Excel="${excelEntry.cp}")`)
  }
  if (!mItem.ville && excelEntry.ville) {
    differences.push(`VILLE MANQUANTE dans Monday (Excel="${excelEntry.ville}")`)
  }
  if (!mItem.email && excelEntry.email) {
    differences.push(`EMAIL MANQUANT dans Monday (Excel="${excelEntry.email}")`)
  }
  if (!mItem.tel && excelEntry.tel) {
    differences.push(`TEL MANQUANT dans Monday (Excel="${excelEntry.tel}")`)
  }
  if (!mItem.siret && excelEntry.siret) {
    differences.push(`SIRET MANQUANT dans Monday (Excel="${excelEntry.siret}")`)
  }

  if (differences.length > 0) {
    diffCount++
    diffs.push({ mondayId: mItem.mondayId, name: mItem.mondayName, ref: mItem.ref, boardId: mItem.boardId, boardName: mItem.boardName, differences })
    if (diffCount <= 100) { // Limiter l'affichage détaillé
      console.log(`\n🔄 [${mItem.mondayId}] "${mItem.mondayName}" (${mItem.boardName}, ref=${mItem.ref}):`)
      for (const d of differences) {
        console.log(`    ${d}`)
      }
    }
  }
}

if (diffCount > 100) console.log(`\n  ... et ${diffCount - 100} autres items avec différences`)
console.log(`\nTotal items avec différences: ${diffCount}`)

// ── 8. Résumé complet ──
console.log('\n' + '='.repeat(80))
console.log('=== RÉSUMÉ FINAL ===')
console.log('='.repeat(80))

const categories = {
  adresseManquante: 0,
  adresseDifferente: 0,
  nomDifferent: 0,
  prenomDifferent: 0,
  emailManquant: 0,
  emailDifferent: 0,
  telManquant: 0,
  telDifferent: 0,
  cpManquant: 0,
  cpDifferent: 0,
  villeManquante: 0,
  villeDifferente: 0,
  siretManquant: 0,
  nomManquant: 0,
  prenomManquant: 0,
}

for (const d of diffs) {
  for (const diff of d.differences) {
    if (diff.includes('ADRESSE MANQUANTE')) categories.adresseManquante++
    else if (diff.includes('ADRESSE:')) categories.adresseDifferente++
    if (diff.includes('NOM MANQUANT')) categories.nomManquant++
    else if (diff.includes('NOM:')) categories.nomDifferent++
    if (diff.includes('PRENOM MANQUANT')) categories.prenomManquant++
    else if (diff.includes('PRENOM:')) categories.prenomDifferent++
    if (diff.includes('EMAIL MANQUANT')) categories.emailManquant++
    else if (diff.includes('EMAIL:')) categories.emailDifferent++
    if (diff.includes('TEL MANQUANT')) categories.telManquant++
    else if (diff.includes('TEL:')) categories.telDifferent++
    if (diff.includes('CP MANQUANT')) categories.cpManquant++
    else if (diff.includes('CP:')) categories.cpDifferent++
    if (diff.includes('VILLE MANQUANTE')) categories.villeManquante++
    else if (diff.includes('VILLE:')) categories.villeDifferente++
    if (diff.includes('SIRET MANQUANT')) categories.siretManquant++
  }
}

// Différences par board
const diffByBoard = {}
for (const d of diffs) {
  if (!diffByBoard[d.boardName]) diffByBoard[d.boardName] = 0
  diffByBoard[d.boardName]++
}

console.log(`\n📊 STATISTIQUES GLOBALES:`)
console.log(`  Excel: ${rows.length} lignes, ${excelBySiret.size} SIRET uniques`)
console.log(`  Monday: ${mondayItems.length} items sur ${BOARDS.length} boards`)
console.log(`  Monday sans SIRET: ${mondayNoSiret}`)
console.log(`\n🔗 CORRESPONDANCES:`)
console.log(`  Monday matchés avec Excel: ${mondayItems.length - absentCount}`)
console.log(`  Monday absents de l'Excel: ${absentCount}`)
console.log(`  Excel absents de Monday: ${excelAbsentCount}`)
console.log(`\n⚠️  DOUBLONS SIRET: ${doublonSiretCount} (${crossBoardSiret} cross-board, ${sameBoardSiret} même board)`)
console.log(`⚠️  DOUBLONS RETINA: ${doublonRefCount} (${crossBoardRef} cross-board, ${sameBoardRef} même board)`)
console.log(`\n🔄 DIFFÉRENCES MONDAY vs EXCEL: ${diffCount} items`)
console.log(`  - Adresse manquante: ${categories.adresseManquante}`)
console.log(`  - Adresse différente: ${categories.adresseDifferente}`)
console.log(`  - Nom manquant: ${categories.nomManquant}`)
console.log(`  - Nom différent: ${categories.nomDifferent}`)
console.log(`  - Prénom manquant: ${categories.prenomManquant}`)
console.log(`  - Prénom différent: ${categories.prenomDifferent}`)
console.log(`  - Email manquant: ${categories.emailManquant}`)
console.log(`  - Email différent: ${categories.emailDifferent}`)
console.log(`  - Tel manquant: ${categories.telManquant}`)
console.log(`  - Tel différent: ${categories.telDifferent}`)
console.log(`  - CP manquant: ${categories.cpManquant}`)
console.log(`  - CP différent: ${categories.cpDifferent}`)
console.log(`  - Ville manquante: ${categories.villeManquante}`)
console.log(`  - Ville différente: ${categories.villeDifferente}`)
console.log(`  - SIRET manquant: ${categories.siretManquant}`)

console.log(`\n📋 DIFFÉRENCES PAR BOARD:`)
for (const [name, count] of Object.entries(diffByBoard)) {
  console.log(`  ${name}: ${count}`)
}
