import urllib.request, json, time, re, ssl

API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU2MDA3NDEzMiwiYWFpIjoxMSwidWlkIjo4MjUxNjA2MywiaWFkIjoiMjAyNS0wOS0wOVQxODo1NDozMC4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MzEyMTU4MDksInJnbiI6ImV1YzEifQ.coddlcxR_0AFKA-vQ9RXdGKSVDOEeM7Bj-oTDhotMH4"
ENDPOINT = "https://api.monday.com/v2"

BOARDS = [
    {"id": 2144986053, "name": "CLIENT ATHOME", "siret_col": "text_mkvqtq36"},
    {"id": 5013455904, "name": "CLIENT SALIH", "siret_col": "text_mkvq3yka"},
    {"id": 5002798369, "name": "CLIENT ALEX", "siret_col": "text_mkvq3yka"},
    {"id": 5001072451, "name": "CLIENT STELLARS", "siret_col": "text_mkvq3yka"},
    {"id": 2140187165, "name": "CLIENT EKL", "siret_col": "numeric_mkvjym8v"},
    {"id": 2137662048, "name": "CLIENT JM", "siret_col": "text_mkvq7s"},
    {"id": 2146667697, "name": "CLIENT DIZIEN VELO", "siret_col": "text_mkvq3yka"},
]

ctx = ssl.create_default_context()

def api_call(query):
    data = json.dumps({"query": query}).encode('utf-8')
    req = urllib.request.Request(ENDPOINT, data=data, headers={
        "Authorization": API_KEY,
        "Content-Type": "application/json",
        "API-Version": "2024-10"
    })
    resp = urllib.request.urlopen(req, context=ctx)
    return json.loads(resp.read().decode('utf-8'))

all_monday_sirets = {}  # siret -> {board_name, item_name, item_id}
board_stats = {}

for board in BOARDS:
    bid = board["id"]
    bname = board["name"]
    scol = board["siret_col"]
    print(f"\n--- Fetching board: {bname} (ID: {bid}) ---")

    # First page
    query = f'''{{
      boards(ids: [{bid}]) {{
        items_page(limit: 500) {{
          cursor
          items {{
            id
            name
            column_values(ids: ["{scol}"]) {{
              text
            }}
          }}
        }}
      }}
    }}'''

    result = api_call(query)
    time.sleep(1.5)

    if 'errors' in result:
        print(f"  ERROR: {result['errors']}")
        continue

    items_data = result['data']['boards'][0]['items_page']
    items = items_data['items']
    cursor = items_data['cursor']
    total_items = len(items)

    # Paginate
    while cursor:
        query2 = f'''{{
          next_items_page(limit: 500, cursor: "{cursor}") {{
            cursor
            items {{
              id
              name
              column_values(ids: ["{scol}"]) {{
                text
              }}
            }}
          }}
        }}'''
        result2 = api_call(query2)
        time.sleep(1.5)

        if 'errors' in result2:
            print(f"  PAGINATION ERROR: {result2['errors']}")
            break

        page_data = result2['data']['next_items_page']
        items.extend(page_data['items'])
        cursor = page_data['cursor']
        total_items = len(items)
        print(f"  ... fetched {total_items} items so far")

    # Extract SIRETs
    board_siret_count = 0
    for item in items:
        siret_raw = None
        if item['column_values'] and len(item['column_values']) > 0:
            siret_raw = item['column_values'][0].get('text')

        if siret_raw and str(siret_raw).strip():
            siret_clean = re.sub(r'\D', '', str(siret_raw).strip())
            if len(siret_clean) >= 9:
                board_siret_count += 1
                if siret_clean not in all_monday_sirets:
                    all_monday_sirets[siret_clean] = {
                        'board_name': bname,
                        'item_name': item['name'],
                        'item_id': item['id']
                    }

    board_stats[bname] = {'total_items': total_items, 'sirets_found': board_siret_count}
    print(f"  Total items: {total_items}, SIRETs found: {board_siret_count}")

print(f"\n=== MONDAY.COM SUMMARY ===")
for bname, stats in board_stats.items():
    print(f"  {bname}: {stats['total_items']} items, {stats['sirets_found']} SIRETs")
print(f"\nTotal unique SIRETs across all boards: {len(all_monday_sirets)}")

# SIRET length distribution
lengths = {}
for s in all_monday_sirets:
    l = len(s)
    lengths[l] = lengths.get(l, 0) + 1
print(f"SIRET length distribution: {lengths}")

# Save
with open('/Users/john/JARVIS/monday_sirets.json', 'w') as f:
    json.dump(all_monday_sirets, f, ensure_ascii=False, indent=2)
print(f"\nSaved to /Users/john/JARVIS/monday_sirets.json")
