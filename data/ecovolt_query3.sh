#!/bin/bash
# Monday API token (account Ecovolt — alexandredelannays-team, board 9990833105)
TOKEN="${MONDAY_API_KEY:?MONDAY_API_KEY env var required (Ecovolt account)}"

# Get items with empty NAF and items with different statuses
QUERY='{"query": "{ boards(ids: 9990833105) { items_page(limit: 50, query_params: {rules: [{column_id: \"text_mkvft2w3\", compare_value: [\"\"], operator: is_empty}]}) { items { id name column_values(ids: [\"text_mkvft2w3\", \"color_mkvfws5n\"]) { id text } } cursor } } }"}'

curl -s -X POST "https://api.monday.com/v2" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${TOKEN}" \
  -d "${QUERY}" | python3 -m json.tool
