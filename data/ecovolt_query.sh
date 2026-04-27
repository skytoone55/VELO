#!/bin/bash
# Monday API token (account Ecovolt — alexandredelannays-team, board 9990833105)
TOKEN="${MONDAY_API_KEY:?MONDAY_API_KEY env var required (Ecovolt account)}"

QUERY='{"query": "{ boards(ids: 9990833105) { items_page(limit: 20) { items { id name column_values(ids: [\"text_mkvft2w3\", \"color_mkvfws5n\", \"numeric_mkvfghjq\"]) { id text value } } } } }"}'

curl -s -X POST "https://api.monday.com/v2" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${TOKEN}" \
  -d "${QUERY}" | python3 -m json.tool
