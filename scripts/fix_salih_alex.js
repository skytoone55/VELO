const fs = require('fs');
const https = require('https');

// Monday API token (account PPE — crm-oreka, 7 boards)
const API_KEY = process.env.MONDAY_API_KEY;
if (!API_KEY) throw new Error('MONDAY_API_KEY env var required (PPE account)');
const API_URL = 'https://api.monday.com/v2';

const FIELD_MAP = {
  SIRET: 'text_mkvq3yka',
  NOM: 'text_mkvj39h',
  PRENOM: 'text_mkvje9qa',
  EMAIL: 'email_mkvjx3jr',
  TEL: 'phone_mkvjhbnt',
  REF_RETINA: 'text_mkvmgppx',
  ADRESSE: 'text_mkvj6f51',
  CODE_POSTAL: 'numeric_mkvjbazm',
  VILLE: 'text_mkvjgcp9',
  VELO_VOULU: 'numeric_mkvj879j',
};

const BOARD_IDS = {
  SALIH: 5013455904,
  ALEX: 5002798369,
};

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
        'API-Version': '2024-10',
      },
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
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildColumnValue(fieldName, refValue) {
  const colId = FIELD_MAP[fieldName];
  if (!colId) return null;

  const val = String(refValue);

  if (fieldName === 'EMAIL') {
    return { [colId]: { email: val, text: val } };
  }
  if (fieldName === 'TEL') {
    return { [colId]: { phone: val, countryShortName: 'FR' } };
  }
  // numeric and text fields: just string value
  return { [colId]: val };
}

async function main() {
  const data = JSON.parse(fs.readFileSync('/Users/john/JARVIS/velo/diff_batch1.json', 'utf8'));

  // Filter SALIH and ALEX boards
  const targetBoards = data.filter(b => b.board_id === BOARD_IDS.SALIH || b.board_id === BOARD_IDS.ALEX);

  const results = [];
  let okCount = 0;
  let errCount = 0;

  for (const board of targetBoards) {
    for (const item of board.differences) {
      const itemId = item.item_id;
      const boardId = board.board_id;
      const boardName = board.board_name;
      const fields = item.fields;
      const fieldNames = Object.keys(fields);

      try {
        // Separate RAISON_SOCIALE from other fields
        const hasName = 'RAISON_SOCIALE' in fields;
        const otherFields = fieldNames.filter(f => f !== 'RAISON_SOCIALE');

        // Handle other column values
        if (otherFields.length > 0) {
          let columnValues = {};
          for (const fieldName of otherFields) {
            const refVal = fields[fieldName].reference;
            const cv = buildColumnValue(fieldName, refVal);
            if (cv) {
              Object.assign(columnValues, cv);
            }
          }

          if (Object.keys(columnValues).length > 0) {
            const cvJson = JSON.stringify(JSON.stringify(columnValues));
            const query = `mutation { change_multiple_column_values(item_id: ${itemId}, board_id: ${boardId}, column_values: ${cvJson}) { id } }`;
            const resp = await mondayRequest(query);
            if (resp.data) {
              // ok
            } else {
              throw new Error(JSON.stringify(resp));
            }
          }
        }

        // Handle RAISON_SOCIALE (name column)
        if (hasName) {
          await sleep(1500);
          let newName = String(fields.RAISON_SOCIALE.reference);
          // Clean up float artifacts like "1852.0" -> "1852"
          if (newName.endsWith('.0') && !isNaN(parseFloat(newName))) {
            newName = newName.replace('.0', '');
          }
          const escapedName = newName.replace(/"/g, '\\"');
          const query = `mutation { change_simple_column_value(item_id: ${itemId}, board_id: ${boardId}, column_id: "name", value: "\\"${escapedName}\\"") { id } }`;
          const resp = await mondayRequest(query);
          if (!resp.data) {
            throw new Error(JSON.stringify(resp));
          }
        }

        const correctedFields = fieldNames.join(', ');
        console.log(`[OK] ${boardName}/Item ${itemId} (${item.item_name}): ${correctedFields}`);
        results.push({ status: 'OK', board: boardName, item_id: itemId, item_name: item.item_name, fields: correctedFields });
        okCount++;
      } catch (err) {
        console.error(`[ERR] ${boardName}/Item ${itemId} (${item.item_name}): ${err.message}`);
        results.push({ status: 'ERR', board: boardName, item_id: itemId, item_name: item.item_name, error: err.message });
        errCount++;
      }

      await sleep(1500);
    }
  }

  console.log(`\n=== RESULTAT: ${okCount} items corrigés, ${errCount} erreurs ===`);

  const report = {
    timestamp: new Date().toISOString(),
    summary: { ok: okCount, errors: errCount, total: okCount + errCount },
    details: results,
  };
  fs.writeFileSync('/Users/john/JARVIS/velo/fix_salih_alex_report.json', JSON.stringify(report, null, 2));
  console.log('Rapport sauvegardé dans /Users/john/JARVIS/velo/fix_salih_alex_report.json');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
