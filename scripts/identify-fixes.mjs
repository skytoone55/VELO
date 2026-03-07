import XLSX from 'xlsx'

const MONDAY_API_KEY = 'REDACTED'

// Les 14 items à corriger — on va les récupérer pour avoir leur SIRET exact
const ITEM_IDS = [
  // EKL
  '5011364546', '5011307448',
  // JM
  '5001438613', '5001435326', '5001437934', '5001434905',
  '5001436194', '5001436579', '5001437324', '5001436705',
  '5001436443', '5001438782', '5001438923',
  // DIZIEN
  '5004155478',
]

// Board configs
const BOARD_COLS = {
  2140187165: { name: 'EKL', siret: 'numeric_mkvjym8v', ref: 'text_mkvmsyz1' },
  2137662048: { name: 'JM', siret: 'text_mkvq7s', ref: 'text_mkvm7z5h' },
  2146667697: { name: 'DIZIEN', siret: 'text_mkvq3yka', ref: 'text_mkvmgppx' },
}

// Récupérer les items par ID
async function fetchItemsByIds(ids) {
  const idsStr = ids.map(id => Number(id))
  const query = `query { items(ids: [${idsStr.join(',')}]) { id name board { id name } column_values { id text value } } }`

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
  if (data.errors) {
    console.error('API errors:', JSON.stringify(data.errors))
    return []
  }
  return data.data.items
}

function getCol(item, colId) {
  const col = item.column_values.find(c => c.id === colId)
  if (!col) return null
  return col.text ? col.text.trim() : null
}

// Lire l'Excel
const workbook = XLSX.readFile('/Users/john/JARVIS/velo/donnee excel.xlsx')
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })

const excelBySiret = new Map()
for (const row of rows) {
  const siren = row['SIREN du bénéficiaire  de l\'opération']
  if (!siren) continue
  const siret = String(siren).trim()
  if (!excelBySiret.has(siret)) excelBySiret.set(siret, [])
  excelBySiret.get(siret).push({
    ref: row['REFERENCE interne de l\'opération'] ? String(row['REFERENCE interne de l\'opération']).trim() : null,
    raisonSociale: row['RAISON SOCIALE  du bénéficiaire  de l\'opération'] ? String(row['RAISON SOCIALE  du bénéficiaire  de l\'opération']).trim() : null,
    nom: row['NOM  du bénéficiaire  de l\'opération'] ? String(row['NOM  du bénéficiaire  de l\'opération']).trim() : null,
    prenom: row['PRENOM  du bénéficiaire  de l\'opération'] ? String(row['PRENOM  du bénéficiaire  de l\'opération']).trim() : null,
    adresse: row['ADRESSE  du siège social du bénéficiaire de l\'opération'] ? String(row['ADRESSE  du siège social du bénéficiaire de l\'opération']).trim() : null,
    cp: row['CODE POSTAL du siège social du bénéficiaire de l\'opération'] ? String(row['CODE POSTAL du siège social du bénéficiaire de l\'opération']).trim().padStart(5, '0') : null,
    ville: row['VILLE  du siège social du bénéficiaire de l\'opération'] ? String(row['VILLE  du siège social du bénéficiaire de l\'opération']).trim() : null,
    email: row['Adresse de courriel du bénéficiaire'] ? String(row['Adresse de courriel du bénéficiaire']).trim().toLowerCase() : null,
    tel: row['Numéro de téléphone du bénéficiaire'] ? String(row['Numéro de téléphone du bénéficiaire']).trim() : null,
  })
}

console.log('=== IDENTIFICATION DES 14 ITEMS À CORRIGER ===\n')

const items = await fetchItemsByIds(ITEM_IDS)
console.log(`Récupéré ${items.length} items de Monday\n`)

const fixList = []

for (const item of items) {
  const boardId = Number(item.board.id)
  const bc = BOARD_COLS[boardId]
  if (!bc) {
    console.log(`⚠️  Board ${boardId} non configuré pour item ${item.id} "${item.name}"`)
    continue
  }

  const siret = getCol(item, bc.siret)
  const ref = getCol(item, bc.ref)

  console.log(`[${item.id}] "${item.name}" — board=${bc.name} SIRET=${siret || 'VIDE'} REF=${ref || 'VIDE'}`)

  const excelEntries = siret ? excelBySiret.get(siret) : null
  if (excelEntries) {
    const excel = excelEntries[0]
    console.log(`  Excel match: NOM="${excel.nom}" PRENOM="${excel.prenom}" ADRESSE="${excel.adresse}" VILLE="${excel.ville}" EMAIL="${excel.email}" TEL="${excel.tel}"`)

    fixList.push({
      mondayId: item.id,
      boardId,
      siret,
      mondayName: item.name,
      excelNom: excel.nom,
      excelPrenom: excel.prenom,
      excelAdresse: excel.adresse,
      excelCp: excel.cp,
      excelVille: excel.ville,
      excelEmail: excel.email,
      excelTel: excel.tel,
    })
  } else {
    console.log(`  ❌ Pas de match Excel pour SIRET ${siret}`)
  }
  console.log('')
}

// Générer le code de correction
console.log('\n=== CODE DE CORRECTION (JSON) ===\n')
console.log(JSON.stringify(fixList, null, 2))
