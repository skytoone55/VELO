const fs = require('fs');
const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU2MDA3NDEzMiwiYWFpIjoxMSwidWlkIjo4MjUxNjA2MywiaWFkIjoiMjAyNS0wOS0wOVQxODo1NDozMC4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MzEyMTU4MDksInJnbiI6ImV1YzEifQ.coddlcxR_0AFKA-vQ9RXdGKSVDOEeM7Bj-oTDhotMH4';

const BOARDS = [
  {
    name: 'STELLARS', id: 5001072451,
    columns: { siret:'text_mkvq3yka', nom:'text_mkvj39h', prenom:'text_mkw6q1vb', email:'email_mkw56r94', tel:'phone_mkw5e4p2', retina:'text_mkvmgppx', adresse:'text_mkvj6f51', cp:'numeric_mkvjbazm', ville:'text_mkvjgcp9', velo:'numeric_mkvj879j' },
    siretType: 'text'
  },
  {
    name: 'EKL', id: 2140187165,
    columns: { siret:'numeric_mkvjym8v', nom:'text_mkvj39h', prenom:'text_mkvje9qa', email:'email_mkvjx3jr', tel:'phone_mkvjhbnt', retina:'text_mkvmsyz1', adresse:'text_mkvj6f51', cp:'numeric_mkvjbazm', ville:'text_mkvjgcp9', velo:'numeric_mkvj879j' },
    siretType: 'numeric'
  },
  {
    name: 'JM', id: 2137662048,
    columns: { siret:'text_mkvq7s', nom:'text_mkvj39h', prenom:'text_mkvje9qa', email:'email_mkvjx3jr', tel:'phone_mkvjhbnt', retina:'text_mkvm7z5h', adresse:'text_mkvj6f51', cp:'numeric_mkvjbazm', ville:'text_mkvjgcp9', velo:'numeric_mkvj879j' },
    siretType: 'text'
  },
  {
    name: 'DIZIEN VELO', id: 2146667697,
    columns: { siret:'text_mkvq3yka', nom:'text_mkvj39h', prenom:'text_mkvje9qa', email:'email_mkvjx3jr', tel:'phone_mkvjhbnt', retina:'text_mkvmgppx', adresse:'text_mkvj6f51', cp:'numeric_mkvjbazm', ville:'text_mkvjgcp9', velo:'numeric_mkvj879j' },
    siretType: 'text'
  }
];

const refTable = JSON.parse(fs.readFileSync('/Users/john/JARVIS/velo/reference_table.json', 'utf8'));
console.log(`Reference table: ${Object.keys(refTable).length} entries`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function mondayQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: 'api.monday.com', path: '/v2', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': API_KEY, 'API-Version': '2024-10' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors) reject(new Error(JSON.stringify(parsed.errors)));
          else resolve(parsed);
        } catch(e) { reject(new Error('Parse: ' + data.substring(0,300))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchAllItems(boardId, columnIds) {
  let allItems = [];
  const colList = JSON.stringify(columnIds);

  console.log(`  Fetching page 1...`);
  const r1 = await mondayQuery(`query { boards(ids: ${boardId}) { items_page(limit: 500) { cursor items { id name column_values(ids: ${colList}) { id text value } } } } }`);
  const p1 = r1.data.boards[0].items_page;
  allItems = p1.items;
  let cursor = p1.cursor;
  console.log(`  Page 1: ${p1.items.length} items`);

  while (cursor) {
    await sleep(1500);
    const escapedCursor = cursor.replace(/"/g, '\\"');
    const rn = await mondayQuery(`query { next_items_page(limit: 500, cursor: "${escapedCursor}") { cursor items { id name column_values(ids: ${colList}) { id text value } } } }`);
    const pn = rn.data.next_items_page;
    allItems = allItems.concat(pn.items);
    cursor = pn.cursor;
    console.log(`  Next page: ${pn.items.length} items (total: ${allItems.length})`);
  }
  return allItems;
}

function cleanSiret(raw, isNumeric) {
  if (!raw && raw !== 0) return '';
  let s = String(raw).trim().replace(/\.0$/, '').replace(/\D/g, '');
  if (isNumeric && s.length > 0 && s.length < 14) s = s.padStart(14, '0');
  return s;
}

function normalizeTel(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/\.0$/, '').replace(/\D/g, '');
  if (s.startsWith('33') && s.length > 9) s = '0' + s.substring(2);
  if (s.length === 9 && !s.startsWith('0')) s = '0' + s;
  return s;
}

function extractPhone(val) {
  if (!val) return '';
  try { const p = JSON.parse(val); if (p && p.phone) return p.phone; } catch(e) {}
  return String(val).trim();
}

function extractEmail(val) {
  if (!val) return '';
  try { const p = JSON.parse(val); if (p && p.email) return p.email; } catch(e) {}
  return String(val).trim();
}

function tl(s) { return s ? String(s).trim().toLowerCase() : ''; }
function tr(s) { return s ? String(s).trim() : ''; }
function stripDec(s) { return s ? String(s).trim().replace(/\.0$/, '') : ''; }
function padCP(s) { if (!s) return ''; let v = String(s).trim().replace(/\.0$/, '').replace(/\D/g, ''); return v.length > 0 && v.length < 5 ? v.padStart(5, '0') : v; }
function toInt(s) { if (!s && s !== 0) return null; let n = parseInt(String(s).trim().replace(/\.0$/, ''), 10); return isNaN(n) ? null : n; }
function isEmpty(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }

function getCol(item, colId) {
  const c = item.column_values.find(x => x.id === colId);
  return c ? { text: c.text || '', value: c.value || '' } : { text: '', value: '' };
}

async function processBoard(board) {
  console.log(`\n=== ${board.name} (${board.id}) ===`);
  const items = await fetchAllItems(board.id, Object.values(board.columns));
  console.log(`  Total: ${items.length} items`);

  const result = { board_name: board.name, board_id: board.id, total_items: items.length, items_matched: 0, items_not_in_ref: [], differences: [] };

  for (const item of items) {
    const siretCol = getCol(item, board.columns.siret);
    const siretRaw = siretCol.text;
    const siret = cleanSiret(siretRaw, board.siretType === 'numeric');

    if (!siret) { result.items_not_in_ref.push({ item_id: item.id, item_name: item.name, reason: 'empty_siret' }); continue; }

    const ref = refTable[siret];
    if (!ref) { result.items_not_in_ref.push({ item_id: item.id, item_name: item.name, siret, reason: 'not_found' }); continue; }

    result.items_matched++;
    const diffs = {};

    // RAISON_SOCIALE
    if (!isEmpty(ref.raison_sociale) && tl(item.name) !== tl(ref.raison_sociale)) {
      diffs['RAISON_SOCIALE'] = { monday: tr(item.name), reference: ref.raison_sociale };
    }

    // NOM
    const mNom = tl(getCol(item, board.columns.nom).text);
    if (!isEmpty(ref.nom) && mNom !== tl(ref.nom)) {
      diffs['NOM'] = { monday: tr(getCol(item, board.columns.nom).text), reference: ref.nom };
    }

    // PRENOM
    const mPrenom = tl(getCol(item, board.columns.prenom).text);
    if (!isEmpty(ref.prenom) && mPrenom !== tl(ref.prenom)) {
      diffs['PRENOM'] = { monday: tr(getCol(item, board.columns.prenom).text), reference: ref.prenom };
    }

    // EMAIL
    const emailVal = getCol(item, board.columns.email).value;
    const mEmail = tl(extractEmail(emailVal));
    if (!isEmpty(ref.email) && mEmail !== tl(ref.email)) {
      diffs['EMAIL'] = { monday: extractEmail(emailVal).trim(), reference: ref.email };
    }

    // TEL
    const telVal = getCol(item, board.columns.tel).value;
    const mTel = normalizeTel(extractPhone(telVal));
    const rTel = normalizeTel(ref.tel);
    if (!isEmpty(ref.tel) && mTel !== rTel) {
      diffs['TEL'] = { monday: extractPhone(telVal), reference: String(ref.tel) };
    }

    // REF_RETINA
    const mRetina = stripDec(getCol(item, board.columns.retina).text);
    const rRetina = stripDec(ref.ref_retina);
    if (!isEmpty(ref.ref_retina) && mRetina !== rRetina) {
      diffs['REF_RETINA'] = { monday: mRetina, reference: rRetina };
    }

    // SIRET FORMAT
    const siretFmt = tr(siretRaw);
    if (siretFmt && !/^\d{14}$/.test(siretFmt) && board.siretType !== 'numeric') {
      diffs['SIRET_FORMAT'] = { monday: siretFmt, reference: siret + ' (14 digits no spaces)' };
    }

    // ADRESSE
    const mAddr = tl(getCol(item, board.columns.adresse).text);
    if (!isEmpty(ref.adresse) && mAddr !== tl(ref.adresse)) {
      diffs['ADRESSE'] = { monday: tr(getCol(item, board.columns.adresse).text), reference: ref.adresse };
    }

    // CODE_POSTAL
    const mCP = padCP(getCol(item, board.columns.cp).text);
    const rCP = padCP(ref.code_postal);
    if (!isEmpty(ref.code_postal) && mCP !== rCP) {
      diffs['CODE_POSTAL'] = { monday: tr(getCol(item, board.columns.cp).text), reference: String(ref.code_postal) };
    }

    // VILLE
    const mVille = tl(getCol(item, board.columns.ville).text);
    if (!isEmpty(ref.ville) && mVille !== tl(ref.ville)) {
      diffs['VILLE'] = { monday: tr(getCol(item, board.columns.ville).text), reference: ref.ville };
    }

    // VELO_VOULU
    const mVelo = toInt(getCol(item, board.columns.velo).text);
    const rVelo = toInt(ref.nb_velos);
    if (rVelo !== null && mVelo !== rVelo) {
      diffs['VELO_VOULU'] = { monday: mVelo, reference: rVelo };
    }

    if (Object.keys(diffs).length > 0) {
      result.differences.push({ item_id: item.id, item_name: item.name, siret, board: board.name, fields: diffs });
    }
  }
  return result;
}

async function main() {
  console.log('Starting batch 2 comparison...\n');
  const allResults = [];
  const fieldCounts = {};

  for (let i = 0; i < BOARDS.length; i++) {
    if (i > 0) { console.log('\n  Rate limit pause...'); await sleep(1500); }
    const result = await processBoard(BOARDS[i]);
    allResults.push(result);
    for (const diff of result.differences) {
      for (const f of Object.keys(diff.fields)) {
        fieldCounts[f] = (fieldCounts[f] || 0) + 1;
      }
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    boards: allResults,
    summary: {
      per_board: allResults.map(r => ({
        board: r.board_name, total_items: r.total_items, matched: r.items_matched,
        not_in_ref: r.items_not_in_ref.length,
        items_with_diffs: r.differences.length,
        total_field_diffs: r.differences.reduce((s, d) => s + Object.keys(d.fields).length, 0)
      })),
      per_field: fieldCounts
    }
  };

  fs.writeFileSync('/Users/john/JARVIS/velo/diff_batch2.json', JSON.stringify(output, null, 2));
  console.log('\n\nSaved to /Users/john/JARVIS/velo/diff_batch2.json');

  console.log('\n========== SUMMARY ==========\n');
  console.log('PER BOARD:');
  console.log('-'.repeat(90));
  console.log('Board'.padEnd(20)+'Total'.padEnd(10)+'Matched'.padEnd(10)+'Not in Ref'.padEnd(12)+'With Diffs'.padEnd(12)+'Field Diffs');
  console.log('-'.repeat(90));
  let totT=0, totM=0, totN=0, totD=0, totF=0;
  for (const r of output.summary.per_board) {
    console.log(r.board.padEnd(20)+String(r.total_items).padEnd(10)+String(r.matched).padEnd(10)+String(r.not_in_ref).padEnd(12)+String(r.items_with_diffs).padEnd(12)+String(r.total_field_diffs));
    totT+=r.total_items; totM+=r.matched; totN+=r.not_in_ref; totD+=r.items_with_diffs; totF+=r.total_field_diffs;
  }
  console.log('-'.repeat(90));
  console.log('TOTAL'.padEnd(20)+String(totT).padEnd(10)+String(totM).padEnd(10)+String(totN).padEnd(12)+String(totD).padEnd(12)+String(totF));

  console.log('\n\nPER FIELD (all boards):');
  console.log('-'.repeat(40));
  const sorted = Object.entries(fieldCounts).sort((a,b)=>b[1]-a[1]);
  for (const [f,c] of sorted) console.log(`  ${f.padEnd(20)} ${c}`);
  console.log('-'.repeat(40));
  console.log(`  TOTAL${' '.repeat(15)}${sorted.reduce((s,[,c])=>s+c,0)}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
