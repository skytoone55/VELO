#!/bin/bash
TOKEN="REDACTED_MONDAY_ECOVOLT_TOKEN"

# Get column settings for the status column to see ALL labels
QUERY='{"query": "{ boards(ids: 9990833105) { columns(ids: [\"color_mkvfws5n\"]) { id title settings_str } } }"}'

curl -s -X POST "https://api.monday.com/v2" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${TOKEN}" \
  -d "${QUERY}" | python3 -m json.tool
