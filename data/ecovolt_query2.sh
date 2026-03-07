#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjYwNzQ0NzE0NiwiYWFpIjoxMSwidWlkIjo4MjAyNTk1MiwiaWFkIjoiMjAyNi0wMS0xNFQxMjo1MTozMi4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjU5OTgxMjEsInJnbiI6InVzZTEifQ.pKHUmGDm_nv37bFv0aXwLQ1y4HimaLnW0FM6bWuBp5M"

# Get column settings for the status column to see ALL labels
QUERY='{"query": "{ boards(ids: 9990833105) { columns(ids: [\"color_mkvfws5n\"]) { id title settings_str } } }"}'

curl -s -X POST "https://api.monday.com/v2" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${TOKEN}" \
  -d "${QUERY}" | python3 -m json.tool
