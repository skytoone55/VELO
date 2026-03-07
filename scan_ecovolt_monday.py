#!/usr/bin/env python3
"""Cross-reference Monday Ecovolt board with local ECOVOLT folders."""

import requests
import os
import json

MONDAY_TOKEN = "REDACTED"
BOARD_ID = "9990833105"
VELO_COL = "numeric_mkvcqm0r"
RETINA_COL = "text_mkvfxbkp"
LOCAL_DIR = "/Users/john/JARVIS/projets/velo/documents-client-velo/ECOVOLT/"

API_URL = "https://api.monday.com/v2"
HEADERS = {
    "Authorization": MONDAY_TOKEN,
    "Content-Type": "application/json",
    "API-Version": "2024-10"
}

def fetch_all_items():
    """Paginate through all items on the board."""
    all_items = []
    cursor = None
    page = 0

    while True:
        page += 1
        if cursor:
            query = """
            query ($cursor: String!) {
                next_items_page(cursor: $cursor, limit: 500) {
                    cursor
                    items {
                        id
                        name
                        column_values(ids: ["%s", "%s"]) {
                            id
                            text
                            value
                        }
                    }
                }
            }
            """ % (VELO_COL, RETINA_COL)
            variables = {"cursor": cursor}
        else:
            query = """
            query ($boardId: [ID!]!) {
                boards(ids: $boardId) {
                    items_page(limit: 500) {
                        cursor
                        items {
                            id
                            name
                            column_values(ids: ["%s", "%s"]) {
                                id
                                text
                                value
                            }
                        }
                    }
                }
            }
            """ % (VELO_COL, RETINA_COL)
            variables = {"boardId": [BOARD_ID]}

        resp = requests.post(API_URL, json={"query": query, "variables": variables}, headers=HEADERS)
        data = resp.json()

        if "errors" in data:
            print(f"API Error: {data['errors']}")
            break

        if cursor:
            page_data = data["data"]["next_items_page"]
        else:
            page_data = data["data"]["boards"][0]["items_page"]

        items = page_data["items"]
        all_items.extend(items)
        cursor = page_data.get("cursor")

        print(f"  Page {page}: {len(items)} items (total: {len(all_items)})")

        if not cursor or not items:
            break

    return all_items

def parse_item(item):
    """Extract retina ref and velo count from an item."""
    retina = ""
    velo_count = 0

    for col in item["column_values"]:
        if col["id"] == RETINA_COL:
            retina = (col["text"] or "").strip()
        elif col["id"] == VELO_COL:
            try:
                val = col["text"] or "0"
                velo_count = int(float(val)) if val else 0
            except (ValueError, TypeError):
                velo_count = 0

    return retina, velo_count

def main():
    # 1. Get local folders
    local_folders = set(os.listdir(LOCAL_DIR))
    local_folders.discard(".DS_Store")
    print(f"Local ECOVOLT folders: {len(local_folders)}")

    # 2. Fetch all Monday items
    print("Fetching Monday board items...")
    items = fetch_all_items()
    print(f"Total items fetched: {len(items)}")

    # 3. Parse items
    monday_data = {}  # retina -> velo_count
    items_with_velo = 0
    items_without_retina = 0

    for item in items:
        retina, velo_count = parse_item(item)
        if not retina:
            items_without_retina += 1
            continue
        monday_data[retina] = velo_count
        if velo_count >= 1:
            items_with_velo += 1

    # 4. Cross-reference
    with_folder_and_velo = 0
    with_folder_no_velo = 0
    folder_not_in_monday = 0
    no_folder_but_velo = 0

    folders_no_velo_list = []
    missing_folder_list = []

    for folder in sorted(local_folders):
        if folder in monday_data:
            if monday_data[folder] >= 1:
                with_folder_and_velo += 1
            else:
                with_folder_no_velo += 1
                folders_no_velo_list.append(folder)
        else:
            folder_not_in_monday += 1

    for retina, velo_count in monday_data.items():
        if retina not in local_folders and velo_count >= 1:
            no_folder_but_velo += 1
            missing_folder_list.append(retina)

    # 5. Results
    print("\n" + "=" * 60)
    print("RÉSULTATS CROISEMENT ECOVOLT")
    print("=" * 60)
    print(f"Items Monday total          : {len(items)}")
    print(f"  - avec Retina ref         : {len(monday_data)}")
    print(f"  - sans Retina ref         : {items_without_retina}")
    print(f"  - avec ≥1 vélo confirmé   : {items_with_velo}")
    print(f"")
    print(f"Dossiers locaux             : {len(local_folders)}")
    print(f"  - avec ≥1 vélo confirmé   : {with_folder_and_velo}")
    print(f"  - avec 0 vélo (inutiles)  : {with_folder_no_velo}")
    print(f"  - pas trouvé sur Monday   : {folder_not_in_monday}")
    print(f"")
    print(f"Dossiers MANQUANTS (vélo confirmé mais pas de dossier local) : {no_folder_but_velo}")

    if folders_no_velo_list:
        print(f"\n--- Premiers dossiers inutiles (0 vélo) : {', '.join(folders_no_velo_list[:10])}...")
    if missing_folder_list:
        print(f"\n--- Premiers dossiers manquants : {', '.join(missing_folder_list[:10])}...")

if __name__ == "__main__":
    main()
