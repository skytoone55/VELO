const fs = require('fs');
const https = require('https');

const API_KEY = 'REDACTED_MONDAY_PPE_TOKEN';
const API_URL = 'https://api.monday.com/v2';

// Column mappings per board
const COLUMN_MAP = {
  5001072451: { // STELLARS
    SIRET: 'text_mkvq3yka',
    NOM: 'text_mkvj39h',
    PRENOM: 'text_mkw6q1vb',
    EMAIL: 'email_mkw56r94',
    TEL: 'phone_mkw5e4p2',
    REF_RETINA: 'text_mkvmgppx',
    ADRESSE: 'text_mkvj6f51',
    CP: 'numeric_mkvjbazm',
    VILLE: 'text_mkvjgcp9',
    VELO_VOULU: 'numeric_mkvj879j',
    SIRET_FORMAT: 'text_mkvq3yka', // SIRET column
  },
  2137662048: { // JM
    SIRET: 'text_mkvq7s',
    NOM: 'text_mkvj39h',
    PRENOM: 'text_mkvje9qa',
    EMAIL: 'email_mkvjx3jr',
    TEL: 'phone_mkvjhbnt',
    REF_RETINA: 'text_mkvm7z5h',
    ADRESSE: 'text_mkvj6f51',
    CP: 'numeric_mkvjbazm',
    VILLE: 'text_mkvjgcp9',
    VELO_VOULU: 'numeric_mkvj879j',
    SIRET_FORMAT: 'text_mkvq7s', // SIRET column
  },
  2146667697: { // DIZIEN VELO
    SIRET: 'text_mkvq3yka',
    NOM: 'text_mkvj39h',
    PRENOM: 'text_mkvje9qa',
    EMAIL: 'email_mkvjx3jr',
    TEL: 'phone_mkvjhbnt',
    REF_RETINA: 'text_mkvmgppx',
    ADRESSE: 'text_mkvj6f51',
    CP: 'numeric_mkvjbazm',
    VILLE: 'text_mkvjgcp9',
    VELO_VOULU: 'numeric_mkvj879j',
    SIRET_FORMAT: 'text_mkvq3yka', // SIRET column
  }
};

const TARGET_BOARDS = [5001072451, 2137662048, 2146667697];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mondayApi(query, variables = {}) {
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
          if (parsed.errors && parsed.errors.length > 0) {
            reject(new Error(JSON.stringify(parsed.errors)));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildColumnValue(fieldName, refValue, boardId) {
  const colId = COLUMN_MAP[boardId][fieldName];
  if (!colId) return null;

  switch (fieldName) {
    case 'VELO_VOULU':
      return { [colId]: String(refValue) };
    case 'REF_RETINA':
    case 'NOM':
    case 'PRENOM':
    case 'ADRESSE':
    case 'VILLE':
      return { [colId]: refValue };
    case 'SIRET_FORMAT': {
      // Extract clean 14-digit SIRET from reference like "83252004300015 (14 digits no spaces)"
      const cleanSiret = String(refValue).replace(/\s.*$/, '').trim();
      return { [colId]: cleanSiret };
    }
    case 'EMAIL':
      return { [colId]: { email: refValue, text: refValue } };
    case 'TEL': {
      // Clean phone - reference may have ".0" suffix or be a number
      let phone = String(refValue).replace(/\.0$/, '');
      // If it's just digits without leading 0, it might be a weird format; keep as-is
      return { [colId]: { phone: phone, countryShortName: 'FR' } };
    }
    case 'CP':
      return { [colId]: String(refValue) };
    default:
      return { [colId]: String(refValue) };
  }
}

async function main() {
  const diffData = JSON.parse(fs.readFileSync('/Users/john/JARVIS/velo/diff_batch2.json', 'utf-8'));

  const report = {
    started_at: new Date().toISOString(),
    corrections: [],
    errors: [],
    summary: { total_items: 0, corrected: 0, errors: 0 }
  };

  let totalItems = 0;
  let corrected = 0;
  let errors = 0;

  for (const board of diffData.boards) {
    if (!TARGET_BOARDS.includes(board.board_id)) {
      console.log(`[SKIP] ${board.board_name} (board_id: ${board.board_id})`);
      continue;
    }

    if (board.differences.length === 0) {
      console.log(`[SKIP] ${board.board_name} - 0 diffs`);
      continue;
    }

    console.log(`\n=== ${board.board_name} (${board.board_id}) - ${board.differences.length} items ===`);

    for (const item of board.differences) {
      totalItems++;
      const fields = Object.keys(item.fields);
      const columnValues = {};
      const fixedFields = [];

      for (const fieldName of fields) {
        const refValue = item.fields[fieldName].reference;
        const cv = buildColumnValue(fieldName, refValue, board.board_id);
        if (cv) {
          Object.assign(columnValues, cv);
          fixedFields.push(fieldName);
        }
      }

      if (Object.keys(columnValues).length === 0) {
        console.log(`[SKIP] ${board.board_name}/${item.item_name} (${item.item_id}) - no actionable fields`);
        continue;
      }

      // Build mutation
      const colValuesJson = JSON.stringify(JSON.stringify(columnValues));
      const mutation = `mutation {
        change_multiple_column_values(
          item_id: ${item.item_id},
          board_id: ${board.board_id},
          column_values: ${colValuesJson}
        ) {
          id
        }
      }`;

      try {
        const result = await mondayApi(mutation);
        if (result.data && result.data.change_multiple_column_values) {
          corrected++;
          console.log(`[OK] ${board.board_name}/${item.item_name} (${item.item_id}): ${fixedFields.join(', ')}`);
          report.corrections.push({
            board: board.board_name,
            board_id: board.board_id,
            item_id: item.item_id,
            item_name: item.item_name,
            fields: fixedFields,
            status: 'OK'
          });
        } else {
          errors++;
          const errMsg = JSON.stringify(result);
          console.log(`[ERR] ${board.board_name}/${item.item_name} (${item.item_id}): ${errMsg}`);
          report.errors.push({
            board: board.board_name,
            item_id: item.item_id,
            item_name: item.item_name,
            fields: fixedFields,
            error: errMsg
          });
        }
      } catch (err) {
        errors++;
        console.log(`[ERR] ${board.board_name}/${item.item_name} (${item.item_id}): ${err.message}`);
        report.errors.push({
          board: board.board_name,
          item_id: item.item_id,
          item_name: item.item_name,
          fields: fixedFields,
          error: err.message
        });
      }

      await sleep(1500);
    }
  }

  report.finished_at = new Date().toISOString();
  report.summary = { total_items: totalItems, corrected, errors };

  fs.writeFileSync('/Users/john/JARVIS/velo/fix_stellars_jm_dizien_report.json', JSON.stringify(report, null, 2));

  console.log(`\n========== RÉSUMÉ ==========`);
  console.log(`${corrected} items corrigés, ${errors} erreurs (sur ${totalItems} total)`);
  console.log(`Rapport sauvegardé dans fix_stellars_jm_dizien_report.json`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
