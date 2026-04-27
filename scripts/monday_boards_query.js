const https = require('https');

// Monday API token (account PPE — crm-oreka, 7 boards)
const API_KEY = process.env.MONDAY_API_KEY;
if (!API_KEY) throw new Error('MONDAY_API_KEY env var required (PPE account)');

const BOARDS = [
  { id: 2144986053, name: 'ATHOME', siretCol: 'text_mkvqtq36' },
  { id: 5013455904, name: 'SALIH', siretCol: 'text_mkvq3yka' },
  { id: 5002798369, name: 'ALEX', siretCol: 'text_mkvq3yka' },
  { id: 5001072451, name: 'STELLARS', siretCol: 'text_mkvq3yka' },
  { id: 2140187165, name: 'EKL', siretCol: 'numeric_mkvjym8v' },
  { id: 2137662048, name: 'JM', siretCol: 'text_mkvq7s' },
  { id: 2146667697, name: 'DIZIEN VELO', siretCol: 'text_mkvq3yka' },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mondayQuery(query) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query });
    const options = {
      hostname: 'api.monday.com',
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': API_KEY,
        'API-Version': '2024-10',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse error: ' + data.substring(0, 500)));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function fetchAllItems(board) {
  const allItems = [];

  // First page
  const firstQuery = `query { boards(ids: [${board.id}]) { items_page(limit: 500) { cursor items { id name column_values(ids: ["${board.siretCol}"]) { id text } } } } }`;

  console.log(`  Querying board ${board.name} (${board.id})...`);
  const firstResult = await mondayQuery(firstQuery);

  if (firstResult.errors) {
    console.error(`  ERROR on board ${board.name}:`, JSON.stringify(firstResult.errors));
    return allItems;
  }

  const firstPage = firstResult.data.boards[0].items_page;
  allItems.push(...firstPage.items);
  console.log(`  Got ${firstPage.items.length} items (page 1), cursor: ${firstPage.cursor ? 'yes' : 'no'}`);

  let cursor = firstPage.cursor;
  let pageNum = 2;

  while (cursor) {
    await sleep(1500);
    const nextQuery = `query { next_items_page(limit: 500, cursor: "${cursor}") { cursor items { id name column_values(ids: ["${board.siretCol}"]) { id text } } } }`;

    const nextResult = await mondayQuery(nextQuery);

    if (nextResult.errors) {
      console.error(`  ERROR on page ${pageNum} of ${board.name}:`, JSON.stringify(nextResult.errors));
      break;
    }

    const nextPage = nextResult.data.next_items_page;
    allItems.push(...nextPage.items);
    console.log(`  Got ${nextPage.items.length} items (page ${pageNum}), cursor: ${nextPage.cursor ? 'yes' : 'no'}`);

    cursor = nextPage.cursor;
    pageNum++;
  }

  return allItems;
}

async function main() {
  console.log('=== Monday.com Boards Query - All 7 Boards ===\n');

  const boardResults = {};
  const allSirets = {}; // siret -> [{board, itemName, itemId}]
  let grandTotal = 0;
  let totalEmpty = 0;

  for (let i = 0; i < BOARDS.length; i++) {
    const board = BOARDS[i];
    console.log(`\n[${i+1}/7] Board: ${board.name}`);

    const items = await fetchAllItems(board);
    const boardSirets = [];
    let emptyCount = 0;

    for (const item of items) {
      const siretVal = item.column_values[0]?.text?.trim() || '';

      if (!siretVal) {
        emptyCount++;
      } else {
        boardSirets.push(siretVal);
        if (!allSirets[siretVal]) {
          allSirets[siretVal] = [];
        }
        allSirets[siretVal].push({
          board: board.name,
          boardId: board.id,
          itemName: item.name,
          itemId: item.id,
        });
      }
    }

    boardResults[board.name] = {
      boardId: board.id,
      totalItems: items.length,
      withSiret: items.length - emptyCount,
      emptySiret: emptyCount,
      sirets: boardSirets,
    };

    grandTotal += items.length;
    totalEmpty += emptyCount;

    console.log(`  Total: ${items.length} items, ${items.length - emptyCount} with SIRET, ${emptyCount} empty`);

    // Rate limit pause between boards
    if (i < BOARDS.length - 1) {
      await sleep(1500);
    }
  }

  // Find unique SIRETs and doublons
  const uniqueSirets = Object.keys(allSirets);
  const doublons = {};

  for (const [siret, entries] of Object.entries(allSirets)) {
    if (entries.length > 1) {
      doublons[siret] = entries;
    }
  }

  // Print results
  console.log('\n\n========================================');
  console.log('         RESULTATS FINAUX');
  console.log('========================================\n');

  console.log('--- 1. Total items par board ---');
  for (const board of BOARDS) {
    const r = boardResults[board.name];
    console.log(`  ${board.name.padEnd(15)} : ${r.totalItems} items (${r.withSiret} avec SIRET, ${r.emptySiret} sans)`);
  }

  console.log(`\n--- 2. Grand total ---`);
  console.log(`  Total items (= velos) : ${grandTotal}`);

  console.log(`\n--- 3. SIRETs uniques ---`);
  console.log(`  SIRETs uniques : ${uniqueSirets.length}`);

  console.log(`\n--- 4. Doublons SIRET ---`);
  const doublonKeys = Object.keys(doublons);
  if (doublonKeys.length === 0) {
    console.log('  Aucun doublon trouve.');
  } else {
    console.log(`  ${doublonKeys.length} SIRET(s) en doublon :`);
    for (const [siret, entries] of Object.entries(doublons)) {
      console.log(`\n  SIRET: ${siret} (${entries.length} occurrences)`);
      for (const e of entries) {
        console.log(`    - Board ${e.board}: "${e.itemName}" (id: ${e.itemId})`);
      }
    }
  }

  console.log(`\n--- 5. Items sans SIRET ---`);
  console.log(`  Total items sans SIRET : ${totalEmpty}`);
  for (const board of BOARDS) {
    const r = boardResults[board.name];
    if (r.emptySiret > 0) {
      console.log(`    ${board.name.padEnd(15)} : ${r.emptySiret} sans SIRET`);
    }
  }

  console.log('\n========================================');
  console.log('         FIN DU RAPPORT');
  console.log('========================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
