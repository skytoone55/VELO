const MONDAY_API_KEY = 'REDACTED_MONDAY_PPE_TOKEN'

// Board configs
const BOARDS = {
  2140187165: { name: 'CLIENT EKL', email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa' },
  2137662048: { name: 'CLIENT JM', email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa' },
  2146667697: { name: 'CLIENT DIZIEN VELO', email: 'email_mkvjx3jr', tel: 'phone_mkvjhbnt', prenom: 'text_mkvje9qa' },
}

const COMMON_COLS = {
  nom: 'text_mkvj39h',
  adresse: 'text_mkvj6f51',
  cp: 'numeric_mkvjbazm',
  ville: 'text_mkvjgcp9',
}

// ── Les 14 corrections : données Excel (source primaire) ──
const FIXES = [
  // === EKL: 2 items — adresse + ville ===
  {
    mondayId: '5011364546', boardId: 2140187165,
    label: 'SCEA BAILLE-BARRELLE',
    changes: { adresse: 'CHEZEAU', ville: 'ROCHES-PREMARIE-ANDILLE' },
  },
  {
    mondayId: '5011307448', boardId: 2140187165,
    label: 'LUCAS GAY',
    changes: { adresse: 'FARGE', ville: 'VEZELIN-SUR-LOIRE' },
  },

  // === JM: 11 items — NOM (Monday affiche la raison sociale, Excel a le nom de famille) ===
  {
    mondayId: '5001438613', boardId: 2137662048,
    label: 'METRE CARRE IMMOBILIER DISSAY',
    changes: { nom: 'DOUET' },
  },
  {
    mondayId: '5001435326', boardId: 2137662048,
    label: "LEDIGN'EN SCENES",
    changes: { nom: 'MAURIN' },
  },
  {
    mondayId: '5001437934', boardId: 2137662048,
    label: 'COMPOST IN CAUX',
    changes: { nom: 'Delacour' },
  },
  {
    mondayId: '5001434905', boardId: 2137662048,
    label: 'MICKAEL BACHER',
    changes: { nom: 'BACHER' },
  },
  {
    mondayId: '5001436194', boardId: 2137662048,
    label: 'YANNICK LABASTIE',
    changes: { nom: 'LABASTIE' },
  },
  {
    mondayId: '5001436579', boardId: 2137662048,
    label: 'CASA BENELLI',
    changes: { nom: 'BENELLI' },
  },
  {
    mondayId: '5001437324', boardId: 2137662048,
    label: 'TALOS',
    changes: { nom: 'CHARKIOLAKIS' },
  },
  {
    mondayId: '5001436705', boardId: 2137662048,
    label: 'ABC FRUITS',
    changes: { nom: 'KHIRALLA' },
  },
  {
    mondayId: '5001436443', boardId: 2137662048,
    label: 'LA MELEE DES JEUX (LMJ)',
    changes: { nom: 'MEROLA PASSETTI' },
  },
  {
    mondayId: '5001438782', boardId: 2137662048,
    label: 'MOHAMMED BOUNOUHI',
    changes: { nom: 'BOUNOUHI' },
  },
  {
    mondayId: '5001438923', boardId: 2137662048,
    label: 'B 2',
    changes: { nom: 'BENHALIMA' },
  },

  // === DIZIEN VELO: 1 item — adresse + email + tel ===
  {
    mondayId: '5004155478', boardId: 2146667697,
    label: 'SNC LES PERSPECTIVES',
    changes: { adresse: 'CHAMPCEVRAIS', email: 'axel.robilliart@gmail.com', tel: '0631286434' },
  },
]

// ── Fonction pour mettre à jour un item Monday ──
async function updateMondayItem(boardId, itemId, columnValues) {
  const colValStr = JSON.stringify(JSON.stringify(columnValues))
  const query = `mutation { change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: ${colValStr}) { id } }`

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
    throw new Error(JSON.stringify(data.errors))
  }
  if (data.error_message) {
    throw new Error(data.error_message)
  }
  return data
}

// ── Appliquer les corrections ──
console.log('=== CORRECTION DES 14 DIFFÉRENCES MONDAY → EXCEL ===')
console.log('(L\'Excel est la source primaire)\n')

let successCount = 0
let errorCount = 0

for (const fix of FIXES) {
  const bc = BOARDS[fix.boardId]
  const columnValues = {}
  const changeLog = []

  for (const [field, value] of Object.entries(fix.changes)) {
    switch (field) {
      case 'nom':
        columnValues[COMMON_COLS.nom] = value
        changeLog.push(`NOM → "${value}"`)
        break
      case 'adresse':
        columnValues[COMMON_COLS.adresse] = value
        changeLog.push(`ADRESSE → "${value}"`)
        break
      case 'cp':
        columnValues[COMMON_COLS.cp] = value
        changeLog.push(`CP → "${value}"`)
        break
      case 'ville':
        columnValues[COMMON_COLS.ville] = value
        changeLog.push(`VILLE → "${value}"`)
        break
      case 'email':
        columnValues[bc.email] = { email: value, text: value }
        changeLog.push(`EMAIL → "${value}"`)
        break
      case 'tel':
        columnValues[bc.tel] = { phone: value, countryShortName: 'FR' }
        changeLog.push(`TEL → "${value}"`)
        break
    }
  }

  console.log(`🔄 [${fix.mondayId}] "${fix.label}" (${bc.name})`)
  for (const c of changeLog) {
    console.log(`   ${c}`)
  }

  try {
    await updateMondayItem(fix.boardId, fix.mondayId, columnValues)
    console.log(`   ✅ OK`)
    successCount++
  } catch (err) {
    console.log(`   ❌ ERREUR: ${err.message}`)
    errorCount++
  }

  // Rate limiting — 1.5s entre chaque appel API
  await new Promise(r => setTimeout(r, 1500))
}

console.log(`\n=== RÉSULTAT ===`)
console.log(`✅ Corrections réussies: ${successCount}/${FIXES.length}`)
if (errorCount > 0) console.log(`❌ Erreurs: ${errorCount}`)
