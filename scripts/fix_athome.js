const fs = require('fs');

// Monday API token (account PPE — crm-oreka, 7 boards)
const API_KEY = process.env.MONDAY_API_KEY;
if (!API_KEY) throw new Error('MONDAY_API_KEY env var required (PPE account)');
const API_URL = 'https://api.monday.com/v2';
const BOARD_ID = 2144986053;

// Column mapping from diff field names to Monday column IDs
const FIELD_TO_COLUMN = {
  'SIRET': 'text_mkvqtq36',
  'NOM': 'text_mkvj39h',
  'PRENOM': 'text_mkvje9qa',
  'EMAIL': 'email_mkvjx3jr',
  'TEL': 'phone_mkvjhbnt',
  'REF_RETINA': 'text_mkvm2hb5',
  'ADRESSE': 'text_mkvj6f51',
  'CODE_POSTAL': 'numeric_mkvjbazm',
  'VILLE': 'text_mkvjgcp9',
  'VELO_VOULU': 'numeric_mkvj879j'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mondayQuery(query) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': API_KEY,
      'API-Version': '2024-10'
    },
    body: JSON.stringify({ query })
  });
  return res.json();
}

function buildColumnValue(fieldName, refValue) {
  const val = String(refValue);
  switch (fieldName) {
    case 'EMAIL':
      return JSON.stringify({ email: val, text: val });
    case 'TEL':
      return JSON.stringify({ phone: val, countryShortName: 'FR' });
    default:
      return JSON.stringify(val);
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync('/Users/john/JARVIS/velo/diff_batch1.json', 'utf8'));

  // Find ATHOME board data
  const athome = data.find(b => b.board_id === BOARD_ID);
  if (!athome) {
    console.log('Board ATHOME not found in diff file');
    process.exit(1);
  }

  const diffs = athome.differences;
  console.log(`Found ${diffs.length} items to correct on ATHOME board`);

  let okCount = 0;
  let errCount = 0;
  const report = { board: 'ATHOME', board_id: BOARD_ID, timestamp: new Date().toISOString(), corrections: [], errors: [] };

  for (const item of diffs) {
    const fields = item.fields;
    const fieldNames = Object.keys(fields);
    const correctedFields = [];
    let hasError = false;
    let errorMsg = '';

    try {
      // Handle RAISON_SOCIALE (name column) separately
      if (fields.RAISON_SOCIALE) {
        // Skip RAISON_SOCIALE corrections where reference ends with .0 (numeric artifact)
        const ref = String(fields.RAISON_SOCIALE.reference);
        if (!ref.endsWith('.0')) {
          const escapedName = ref.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const query = `mutation { change_simple_column_value(item_id: ${item.item_id}, board_id: ${BOARD_ID}, column_id: "name", value: "\\"${escapedName}\\"") { id } }`;
          const result = await mondayQuery(query);
          if (result.errors) {
            throw new Error(JSON.stringify(result.errors));
          }
          correctedFields.push('RAISON_SOCIALE');
          await sleep(1500);
        }
      }

      // Handle other fields via change_multiple_column_values
      const otherFields = fieldNames.filter(f => f !== 'RAISON_SOCIALE');
      if (otherFields.length > 0) {
        const columnValues = {};
        for (const fieldName of otherFields) {
          const columnId = FIELD_TO_COLUMN[fieldName];
          if (!columnId) {
            console.log(`  [WARN] Unknown field: ${fieldName}, skipping`);
            continue;
          }
          const refValue = fields[fieldName].reference;
          columnValues[columnId] = buildColumnValue(fieldName, refValue);
        }

        if (Object.keys(columnValues).length > 0) {
          // Build the JSON string for column_values
          // Monday expects: "{\"col_id\": \"value\", ...}" but values are already JSON strings
          // We need to build a proper JSON object where numeric values are strings
          const cvObj = {};
          for (const [colId, val] of Object.entries(columnValues)) {
            cvObj[colId] = JSON.parse(val);
          }
          const cvStr = JSON.stringify(JSON.stringify(cvObj));

          const query = `mutation { change_multiple_column_values(item_id: ${item.item_id}, board_id: ${BOARD_ID}, column_values: ${cvStr}) { id } }`;
          const result = await mondayQuery(query);
          if (result.errors) {
            throw new Error(JSON.stringify(result.errors));
          }
          correctedFields.push(...otherFields);
          await sleep(1500);
        }
      }

      if (correctedFields.length > 0) {
        console.log(`[OK] Item ${item.item_id} (${item.item_name}): ${correctedFields.join(', ')}`);
        okCount++;
        report.corrections.push({ item_id: item.item_id, item_name: item.item_name, fields: correctedFields });
      }
    } catch (err) {
      errCount++;
      errorMsg = err.message;
      console.log(`[ERR] Item ${item.item_id} (${item.item_name}): ${errorMsg}`);
      report.errors.push({ item_id: item.item_id, item_name: item.item_name, error: errorMsg });
    }
  }

  console.log(`\n=== RESUME ===`);
  console.log(`${okCount} items corrigés, ${errCount} erreurs`);

  report.summary = { corrected: okCount, errors: errCount };
  fs.writeFileSync('/Users/john/JARVIS/velo/fix_athome_report.json', JSON.stringify(report, null, 2));
  console.log('Report saved to /Users/john/JARVIS/velo/fix_athome_report.json');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
