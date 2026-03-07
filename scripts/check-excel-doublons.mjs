import XLSX from 'xlsx'

const workbook = XLSX.readFile('/Users/john/JARVIS/velo/donnee excel.xlsx')
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })

// 1. Doublons SIRET dans l'Excel
const siretMap = new Map()
for (const row of rows) {
  const siren = row["SIREN du bénéficiaire  de l'opération"]
  if (!siren) continue
  const siret = String(siren).trim()
  if (!siretMap.has(siret)) siretMap.set(siret, [])
  siretMap.get(siret).push({
    ref: row["REFERENCE interne de l'opération"] ? String(row["REFERENCE interne de l'opération"]).trim() : null,
    nom: row["RAISON SOCIALE  du bénéficiaire  de l'opération"] ? String(row["RAISON SOCIALE  du bénéficiaire  de l'opération"]).trim() : null,
    prenom: row["PRENOM  du bénéficiaire  de l'opération"] ? String(row["PRENOM  du bénéficiaire  de l'opération"]).trim() : null,
    nomFamille: row["NOM  du bénéficiaire  de l'opération"] ? String(row["NOM  du bénéficiaire  de l'opération"]).trim() : null,
    cp: row["CODE POSTAL du siège social du bénéficiaire de l'opération"] ? String(row["CODE POSTAL du siège social du bénéficiaire de l'opération"]).trim() : null,
    ville: row["VILLE  du siège social du bénéficiaire de l'opération"] ? String(row["VILLE  du siège social du bénéficiaire de l'opération"]).trim() : null,
  })
}

console.log('=== DOUBLONS SIRET DANS L\'EXCEL (source primaire) ===')
let doublonCount = 0
const doublons = []
for (const [siret, entries] of siretMap) {
  if (entries.length > 1) {
    doublonCount++
    doublons.push({ siret, count: entries.length, entries })
  }
}

console.log(`Total SIRET en doublon dans Excel: ${doublonCount}`)
console.log(`Total lignes impliquées: ${doublons.reduce((s, d) => s + d.count, 0)}`)
console.log('')

for (const d of doublons) {
  console.log(`SIRET ${d.siret} — ${d.count} occurrences:`)
  for (const e of d.entries) {
    console.log(`    ref=${e.ref} "${e.nom}" nom=${e.nomFamille} ${e.prenom || ''} CP=${e.cp} ${e.ville}`)
  }
}

// 2. Doublons RETINA dans l'Excel
console.log('\n=== DOUBLONS RETINA DANS L\'EXCEL ===')
const refMap = new Map()
for (const row of rows) {
  const ref = row["REFERENCE interne de l'opération"]
  if (!ref) continue
  const refStr = String(ref).trim()
  if (!refMap.has(refStr)) refMap.set(refStr, [])
  refMap.get(refStr).push({
    siret: row["SIREN du bénéficiaire  de l'opération"] ? String(row["SIREN du bénéficiaire  de l'opération"]).trim() : null,
    nom: row["RAISON SOCIALE  du bénéficiaire  de l'opération"] ? String(row["RAISON SOCIALE  du bénéficiaire  de l'opération"]).trim() : null,
  })
}

let refDoublonCount = 0
for (const [ref, entries] of refMap) {
  if (entries.length > 1) {
    refDoublonCount++
    console.log(`REF ${ref} — ${entries.length} occurrences:`)
    for (const e of entries) {
      console.log(`    SIRET=${e.siret} "${e.nom}"`)
    }
  }
}
if (refDoublonCount === 0) console.log('Aucun doublon RETINA.')
console.log(`Total doublons RETINA Excel: ${refDoublonCount}`)

// 3. 5 exemples variés de clients Excel absents de Monday
console.log('\n=== 5 EXEMPLES CLIENTS EXCEL ABSENTS DE MONDAY (à vérifier) ===')
const examples = [
  { siret: '84343076000028', label: 'JVF RENOVATIONS' },
  { siret: '88463943600010', label: 'ISOLOL' },
  { siret: '93880164400015', label: '2M BATI' },
  { siret: '82352121600015', label: 'R.R.F' },
  { siret: '40315893400030', label: 'VALDECO PEINTURE' },
]
for (const ex of examples) {
  if (siretMap.has(ex.siret)) {
    const entries = siretMap.get(ex.siret)
    const e = entries[0]
    console.log(`\n${ex.label}:`)
    console.log(`  SIRET: ${ex.siret}`)
    console.log(`  Raison sociale: ${e.nom}`)
    console.log(`  Nom/Prénom: ${e.nomFamille} ${e.prenom || ''}`)
    console.log(`  Ref RETINA: ${e.ref}`)
    console.log(`  CP/Ville: ${e.cp} ${e.ville}`)
  }
}

// 4. Statistiques globales
console.log('\n=== STATS EXCEL ===')
console.log(`Lignes totales: ${rows.length}`)
console.log(`SIRET uniques: ${siretMap.size}`)
console.log(`SIRET en doublon: ${doublonCount} (affectant ${doublons.reduce((s, d) => s + d.count, 0)} lignes)`)
console.log(`Lignes sans SIRET: ${rows.length - [...siretMap.values()].reduce((s, v) => s + v.length, 0)}`)
