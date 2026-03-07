const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'REDACTED_MONDAY_PPE_TOKEN';
const API_URL = 'https://api.monday.com/v2';

const BOARDS = [
  {
    name: 'ATHOME',
    id: 2144986053,
    siretCol: 'text_mkvqtq36',
    retinaCol: 'text_mkvm2hb5',
    columns: ['name', 'text_mkvqtq36', 'text_mkvj39h', 'text_mkvje9qa', 'email_mkvjx3jr', 'phone_mkvjhbnt', 'text_mkvm2hb5', 'text_mkvj6f51', 'numeric_mkvjbazm', 'text_mkvjgcp9', 'numeric_mkvj879j']
  },
  {
    name: 'SALIH',
    id: 5013455904,
    siretCol: 'text_mkvq3yka',
    retinaCol: 'text_mkvmgppx',
    columns: ['name', 'text_mkvq3yka', 'text_mkvj39h', 'text_mkvje9qa', 'email_mkvjx3jr', 'phone_mkvjhbnt', 'text_mkvmgppx', 'text_mkvj6f51', 'numeric_mkvjbazm', 'text_mkvjgcp9', 'numeric_mkvj879j']
  },
  {
    name: 'ALEX',
    id: 5002798369,
    siretCol: 'text_mkvq3yka',
    retinaCol: 'text_mkvmgppx',
    columns: ['name', 'text_mkvq3yka', 'text_mkvj39h', 'text_mkvje9qa', 'email_mkvjx3jr', 'phone_mkvjhbnt', 'text_mkvmgppx', 'text_mkvj6f51', 'numeric_mkvjbazm', 'text_mkvjgcp9', 'numeric_mkvj879j']
  }
];

// Load reference table
const refTable = JSON.parse(fs.readFileSync('/Users/john/JARVIS/velo/reference_table.json', 'utf8'));
console.log(`Reference table loaded: ${Object.keys(refTable).length} entries`);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mondayRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const options = {
      hostname: 'api.monday.com',
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': API_KEY,
        'API-Version': '2024-10'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors) {
            reject(new Error(JSON.stringify(parsed.errors)));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchAllItems(boardId, columnIds) {
  let allItems = [];
  let cursor = null;
  let page = 0;

  // First request
  const firstQuery = `query {
    boards(ids: [${boardId}]) {
      items_page(limit: 500, query_params: {}) {
        cursor
        items {
          id
          name
          column_values(ids: ${JSON.stringify(columnIds)}) {
            id
            text
            value
          }
        }
      }
    }
  }`;

  console.log(`  Fetching page ${++page}...`);
  const firstResp = await mondayRequest(firstQuery);
  const firstPage = firstResp.data.boards[0].items_page;
  allItems = allItems.concat(firstPage.items);
  cursor = firstPage.cursor;
  console.log(`  Got ${firstPage.items.length} items (total: ${allItems.length})`);

  // Subsequent pages
  while (cursor) {
    await sleep(1500);
    const nextQuery = `query {
      next_items_page(limit: 500, cursor: "${cursor}") {
        cursor
        items {
          id
          name
          column_values(ids: ${JSON.stringify(columnIds)}) {
            id
            text
            value
          }
        }
      }
    }`;
    console.log(`  Fetching page ${++page}...`);
    const nextResp = await mondayRequest(nextQuery);
    const nextPage = nextResp.data.next_items_page;
    allItems = allItems.concat(nextPage.items);
    cursor = nextPage.cursor;
    console.log(`  Got ${nextPage.items.length} items (total: ${allItems.length})`);
  }

  return allItems;
}

function cleanSiret(raw) {
  if (!raw) return '';
  return raw.replace(/[^0-9]/g, '');
}

function normalizeTel(raw) {
  if (!raw) return '';
  // Remove all non-digits
  let digits = raw.replace(/[^0-9]/g, '');
  // Handle .0 suffix from float conversion
  if (digits.endsWith('0') && raw.includes('.0')) {
    // The ref tel might be like "611390570.0" → digits = "6113905700"
    // Actually let's strip .0 from the raw first
  }
  // Better: strip .0 from raw before digit extraction
  let cleaned = raw.replace(/\.0$/, '');
  digits = cleaned.replace(/[^0-9]/g, '');
  // If starts with 33, replace with 0
  if (digits.startsWith('33') && digits.length >= 11) {
    digits = '0' + digits.substring(2);
  }
  // If 9 digits and doesn't start with 0, prepend 0
  if (digits.length === 9 && !digits.startsWith('0')) {
    digits = '0' + digits;
  }
  return digits;
}

function normalizeEmail(raw) {
  if (!raw) return '';
  return raw.trim().toLowerCase();
}

function extractMondayPhone(colValue) {
  if (!colValue) return '';
  try {
    const parsed = JSON.parse(colValue);
    if (parsed && parsed.phone) return parsed.phone;
  } catch (e) {}
  return colValue;
}

function extractMondayEmail(colValue) {
  if (!colValue) return '';
  try {
    const parsed = JSON.parse(colValue);
    if (parsed && parsed.email) return parsed.email;
  } catch (e) {}
  return colValue;
}

function getColValue(item, colId) {
  const col = item.column_values.find(c => c.id === colId);
  if (!col) return { text: '', value: null };
  return { text: col.text || '', value: col.value || '' };
}

function stripDotZero(s) {
  if (!s) return '';
  return s.replace(/\.0$/, '').trim();
}

function padCP(val) {
  if (!val) return '';
  let s = String(val).replace(/\.0$/, '').trim();
  while (s.length < 5) s = '0' + s;
  return s;
}

function compareField(mondayVal, refVal, fieldType) {
  let mv = (mondayVal === null || mondayVal === undefined) ? '' : String(mondayVal).trim();
  let rv = (refVal === null || refVal === undefined) ? '' : String(refVal).trim();

  // Both empty = no difference
  if (mv === '' && rv === '') return null;

  switch (fieldType) {
    case 'text_ci': // case-insensitive text
      if (mv.toLowerCase() === rv.toLowerCase()) return null;
      break;
    case 'tel':
      const mTel = normalizeTel(mv);
      const rTel = normalizeTel(rv);
      if (mTel === rTel) return null;
      mv = mTel;
      rv = rTel;
      break;
    case 'email':
      if (normalizeEmail(mv) === normalizeEmail(rv)) return null;
      break;
    case 'retina':
      const mRet = stripDotZero(mv);
      const rRet = stripDotZero(rv);
      if (mRet === rRet) return null;
      mv = mRet;
      rv = rRet;
      break;
    case 'cp':
      const mCP = padCP(mv);
      const rCP = padCP(rv);
      if (mCP === rCP) return null;
      mv = mCP;
      rv = rCP;
      break;
    case 'int':
      const mInt = parseInt(mv) || 0;
      const rInt = parseInt(rv) || 0;
      if (mInt === rInt) return null;
      mv = String(mInt);
      rv = String(rInt);
      break;
    default:
      if (mv === rv) return null;
  }

  return { monday: mondayVal || '', reference: refVal || '' };
}

async function processBoard(boardConfig) {
  console.log(`\n=== Processing board: ${boardConfig.name} (${boardConfig.id}) ===`);

  const items = await fetchAllItems(boardConfig.id, boardConfig.columns);
  console.log(`  Total items fetched: ${items.length}`);

  const result = {
    board_name: boardConfig.name,
    board_id: boardConfig.id,
    total_items: items.length,
    items_matched: 0,
    items_not_in_ref: [],
    differences: []
  };

  for (const item of items) {
    const siretRaw = getColValue(item, boardConfig.siretCol).text;
    const siret = cleanSiret(siretRaw);

    if (!siret || siret.length < 14) {
      // Check if SIRET is present but malformed
      if (siretRaw && siretRaw.trim()) {
        result.items_not_in_ref.push({
          item_id: item.id,
          item_name: item.name,
          siret_raw: siretRaw,
          reason: `Invalid SIRET (${siret.length} digits after cleaning)`
        });
      } else {
        result.items_not_in_ref.push({
          item_id: item.id,
          item_name: item.name,
          siret_raw: siretRaw || '',
          reason: 'No SIRET'
        });
      }
      continue;
    }

    // Check if SIRET needs formatting fix (has spaces etc.)
    const siretNeedsFormatFix = siretRaw.trim() !== siret;

    const ref = refTable[siret];
    if (!ref) {
      result.items_not_in_ref.push({
        item_id: item.id,
        item_name: item.name,
        siret_raw: siretRaw,
        siret_clean: siret,
        reason: 'Not found in reference table'
      });
      continue;
    }

    result.items_matched++;

    // Extract Monday values
    const mNom = getColValue(item, 'text_mkvj39h').text;
    const mPrenom = getColValue(item, 'text_mkvje9qa').text;
    const mEmailVal = getColValue(item, 'email_mkvjx3jr').value;
    const mEmail = extractMondayEmail(mEmailVal);
    const mPhoneVal = getColValue(item, 'phone_mkvjhbnt').value;
    const mPhone = extractMondayPhone(mPhoneVal);
    const mRetina = getColValue(item, boardConfig.retinaCol).text;
    const mAdresse = getColValue(item, 'text_mkvj6f51').text;
    const mCP = getColValue(item, 'numeric_mkvjbazm').text;
    const mVille = getColValue(item, 'text_mkvjgcp9').text;
    const mVelos = getColValue(item, 'numeric_mkvj879j').text;

    const fields = {};

    // Compare each field
    const raisonDiff = compareField(item.name, ref.raison_sociale, 'text_ci');
    if (raisonDiff) fields['RAISON_SOCIALE'] = raisonDiff;

    const nomDiff = compareField(mNom, ref.nom, 'text_ci');
    if (nomDiff) fields['NOM'] = nomDiff;

    const prenomDiff = compareField(mPrenom, ref.prenom, 'text_ci');
    if (prenomDiff) fields['PRENOM'] = prenomDiff;

    const emailDiff = compareField(mEmail, ref.email, 'email');
    if (emailDiff) fields['EMAIL'] = emailDiff;

    const telDiff = compareField(mPhone, ref.tel, 'tel');
    if (telDiff) fields['TEL'] = telDiff;

    const retinaDiff = compareField(mRetina, ref.ref_retina, 'retina');
    if (retinaDiff) fields['REF_RETINA'] = retinaDiff;

    // SIRET formatting check
    if (siretNeedsFormatFix) {
      fields['SIRET'] = { monday: siretRaw, reference: siret };
    }

    const adresseDiff = compareField(mAdresse, ref.adresse, 'text_ci');
    if (adresseDiff) fields['ADRESSE'] = adresseDiff;

    const cpDiff = compareField(mCP, ref.code_postal, 'cp');
    if (cpDiff) fields['CODE_POSTAL'] = cpDiff;

    const villeDiff = compareField(mVille, ref.ville, 'text_ci');
    if (villeDiff) fields['VILLE'] = villeDiff;

    const velosDiff = compareField(mVelos, ref.nb_velos, 'int');
    if (velosDiff) fields['VELO_VOULU'] = velosDiff;

    if (Object.keys(fields).length > 0) {
      result.differences.push({
        item_id: item.id,
        item_name: item.name,
        siret: siret,
        board: boardConfig.name,
        fields: fields
      });
    }
  }

  return result;
}

async function main() {
  console.log('Starting comparison...\n');

  const allResults = [];

  for (const board of BOARDS) {
    const result = await processBoard(board);
    allResults.push(result);
    // Wait between boards
    await sleep(2000);
  }

  // Save results
  const outputPath = '/Users/john/JARVIS/velo/diff_batch1.json';
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\nResults saved to ${outputPath}`);

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const fieldCounts = {};
  let totalDifferences = 0;

  for (const result of allResults) {
    const itemsWithDiffs = result.differences.length;
    let fieldDiffs = 0;
    for (const diff of result.differences) {
      const fieldCount = Object.keys(diff.fields).length;
      fieldDiffs += fieldCount;
      for (const fieldName of Object.keys(diff.fields)) {
        fieldCounts[fieldName] = (fieldCounts[fieldName] || 0) + 1;
      }
    }
    totalDifferences += fieldDiffs;

    console.log(`\n--- ${result.board_name} (Board ${result.board_id}) ---`);
    console.log(`  Total items:           ${result.total_items}`);
    console.log(`  Matched in ref:        ${result.items_matched}`);
    console.log(`  Not found in ref:      ${result.items_not_in_ref.length}`);
    console.log(`  Items with diffs:      ${itemsWithDiffs}`);
    console.log(`  Total field diffs:     ${fieldDiffs}`);
  }

  console.log('\n--- Field difference counts (across all boards) ---');
  const sortedFields = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
  for (const [field, count] of sortedFields) {
    console.log(`  ${field.padEnd(20)} ${count}`);
  }
  console.log(`\n  TOTAL field diffs:     ${totalDifferences}`);
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
