#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjYwNzQ0NzE0NiwiYWFpIjoxMSwidWlkIjo4MjAyNTk1MiwiaWFkIjoiMjAyNi0wMS0xNFQxMjo1MTozMi4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjU5OTgxMjEsInJnbiI6InVzZTEifQ.pKHUmGDm_nv37bFv0aXwLQ1y4HimaLnW0FM6bWuBp5M"

# Get items with empty NAF and items with different statuses
QUERY='{"query": "{ boards(ids: 9990833105) { items_page(limit: 50, query_params: {rules: [{column_id: \"text_mkvft2w3\", compare_value: [\"\"], operator: is_empty}]}) { items { id name column_values(ids: [\"text_mkvft2w3\", \"color_mkvfws5n\"]) { id text } } cursor } } }"}'

curl -s -X POST "https://api.monday.com/v2" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${TOKEN}" \
  -d "${QUERY}" | python3 -m json.tool
