const https = require('https');

const API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU2MDA3NDEzMiwiYWFpIjoxMSwidWlkIjo4MjUxNjA2MywiaWFkIjoiMjAyNS0wOS0wOVQxODo1NDozMC4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MzEyMTU4MDksInJnbiI6ImV1YzEifQ.coddlcxR_0AFKA-vQ9RXdGKSVDOEeM7Bj-oTDhotMH4';
const API_URL = 'https://api.monday.com/v2';

// Boards and their SIRET column IDs
const BOARDS = [
  { id: 2144986053, name: 'ATHOME', siretCol: 'text_mkvqtq36' },
  { id: 5002798369, name: 'ALEX', siretCol: 'text_mkvq3yka' },
];

// SIRETs to find (normalized: spaces removed)
const TARGET_SIRETS_ATHOME = [
  '87891841600016',
  '92102470900013',
  '89254039400012',
  '81283977700032',
  '85118843300011',
  '53978487600051',
  '85166234600028',
  '89100143000026',
];

const TARGET_SIRETS_ALEX = [
  '88254630200010',
  '80080889100017',
  '42810873200085',
  '38339402000010',
];

function normalizeSiret(s) {
  if (!s) return '';
  return s.replace(/[\s.\-]/g, '').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mondayApiCall(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query, variables });
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
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse: ' + data.substring(0, 500)));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function fetchAllItems(boardId, siretCol) {
  let allItems = [];
  let cursor = null;
  let page = 0;

  while (true) {
    page++;
    let query;
    if (!cursor) {
      query = `query {
        boards(ids: [${boardId}]) {
          items_page(limit: 500) {
            cursor
            items {
              id
              name
              column_values(ids: ["${siretCol}"]) {
                id
                text
              }
            }
          }
        }
      }`;
    } else {
      query = `query {
        next_items_page(limit: 500, cursor: "${cursor}") {
          cursor
          items {
            id
            name
            column_values(ids: ["${siretCol}"]) {
              id
              text
            }
          }
        }
      }`;
    }

    console.error(`  Page ${page} (cursor: ${cursor ? 'yes' : 'initial'})...`);
    const result = await mondayApiCall(query);

    if (result.errors) {
      console.error('API Error:', JSON.stringify(result.errors));
      break;
    }

    let itemsPage;
    if (!cursor) {
      itemsPage = result.data?.boards?.[0]?.items_page;
    } else {
      itemsPage = result.data?.next_items_page;
    }

    if (!itemsPage || !itemsPage.items || itemsPage.items.length === 0) {
      break;
    }

    allItems = allItems.concat(itemsPage.items);
    console.error(`    Got ${itemsPage.items.length} items (total: ${allItems.length})`);

    cursor = itemsPage.cursor;
    if (!cursor) break;

    await sleep(1500);
  }

  return allItems;
}

async function main() {
  const results = {}; // siret -> [{boardName, boardId, itemId, itemName, siretRaw}]

  for (const board of BOARDS) {
    console.error(`\nFetching board ${board.name} (${board.id})...`);
    const items = await fetchAllItems(board.id, board.siretCol);
    console.error(`  Total items fetched: ${items.length}`);

    const targetSirets = board.name === 'ATHOME' ? TARGET_SIRETS_ATHOME : TARGET_SIRETS_ALEX;

    for (const item of items) {
      const siretRaw = item.column_values?.[0]?.text || '';
      const siretNorm = normalizeSiret(siretRaw);

      if (targetSirets.includes(siretNorm)) {
        if (!results[siretNorm]) results[siretNorm] = [];
        results[siretNorm].push({
          boardName: board.name,
          boardId: board.id,
          itemId: item.id,
          itemName: item.name,
          siretRaw: siretRaw,
        });
      }
    }

    await sleep(1500);
  }

  // Output results
  console.log('\n========================================================');
  console.log('  SIRET DOUBLONS - DETAIL COMPLET');
  console.log('========================================================\n');

  const sortedSirets = Object.keys(results).sort();
  let totalItems = 0;

  for (const siret of sortedSirets) {
    const entries = results[siret];
    totalItems += entries.length;
    const isDuplicate = entries.length > 1;

    console.log(`SIRET: ${siret} (${entries[0].siretRaw})${isDuplicate ? ` — ${entries.length} DOUBLONS` : ''}`);
    console.log('─'.repeat(60));

    for (const e of entries) {
      const url = `https://patrimoine-energie.monday.com/boards/${e.boardId}/pulses/${e.itemId}`;
      console.log(`  Board  : ${e.boardName} (${e.boardId})`);
      console.log(`  Item   : ${e.itemName} (ID: ${e.itemId})`);
      console.log(`  SIRET  : ${e.siretRaw}`);
      console.log(`  URL    : ${url}`);
      console.log('');
    }
    console.log('');
  }

  console.log('========================================================');
  console.log(`TOTAL: ${sortedSirets.length} SIRETs distincts, ${totalItems} items trouves`);
  console.log('========================================================');

  // Also check if any target SIRETs were NOT found
  const allTargets = [...TARGET_SIRETS_ATHOME, ...TARGET_SIRETS_ALEX];
  const notFound = allTargets.filter(s => !results[s]);
  if (notFound.length > 0) {
    console.log('\n⚠ SIRETs NON TROUVES:');
    for (const s of notFound) {
      console.log(`  - ${s}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
