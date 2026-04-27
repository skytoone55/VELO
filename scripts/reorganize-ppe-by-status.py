#!/usr/bin/env python3
"""
Reorganise tous les dossiers PPE par statut Monday.
- Query tous les boards PPE pour recuperer retina -> statut
- Deplace chaque dossier dans PPE/{STATUT}/{retina}/
- Les dossiers sans match vont dans PPE/INCONNU/
"""

import os
import json
import shutil
import urllib.request
import urllib.error
import time

# Monday API token (account PPE — crm-oreka, 7 boards)
PPE_TOKEN = os.environ.get('MONDAY_API_KEY')
assert PPE_TOKEN, 'MONDAY_API_KEY env var required (PPE account)'

MONDAY_API = "https://api.monday.com/v2"

PPE_DIR = "/Users/john/JARVIS/projets/velo/documents-client-velo/PPE"

BOARDS = [
    {"name": "ATHOME",   "id": 2144986053, "retina_col": "text_mkvm2hb5"},
    {"name": "JM",       "id": 2137662048, "retina_col": "text_mkvm7z5h"},
    {"name": "DIZIEN",   "id": 2146667697, "retina_col": "text_mkvmgppx"},
    {"name": "EKL",      "id": 2140187165, "retina_col": "text_mkvmsyz1"},
    {"name": "SALIH",    "id": 5013455904, "retina_col": "text_mkvmgppx"},
    {"name": "STELLARS", "id": 5001072451, "retina_col": "text_mkvmgppx"},
    {"name": "ALEX",     "id": 5002798369, "retina_col": "text_mkvmgppx"},
]


def monday_query(query, token=PPE_TOKEN, retries=3):
    """Execute a Monday.com GraphQL query with retries."""
    payload = json.dumps({"query": query}).encode("utf-8")
    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
        "API-Version": "2024-10",
    }
    for attempt in range(retries):
        try:
            req = urllib.request.Request(MONDAY_API, data=payload, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if "errors" in data:
                print(f"  [WARN] GraphQL errors: {data['errors']}")
            return data
        except Exception as e:
            print(f"  [RETRY {attempt+1}/{retries}] {e}")
            time.sleep(2 * (attempt + 1))
    return None


def discover_status_column(board_id):
    """Find the status column ID on a board."""
    query = f'''{{
        boards(ids: {board_id}) {{
            columns {{
                id
                title
                type
            }}
        }}
    }}'''
    data = monday_query(query)
    if not data or "data" not in data:
        return None
    columns = data["data"]["boards"][0]["columns"]
    # Look for a column named "Statut" or type "color" (status type)
    for col in columns:
        if col["title"].lower() in ("statut", "status"):
            return col["id"]
    # Fallback: first color-type column
    for col in columns:
        if col["type"] == "color":
            return col["id"]
    return None


def fetch_all_items(board_id, retina_col, status_col):
    """Fetch all items from a board with pagination, return list of (retina, status)."""
    items = []
    cursor = None
    page = 0

    # First page
    query = f'''{{
        boards(ids: {board_id}) {{
            items_page(limit: 500) {{
                cursor
                items {{
                    id
                    name
                    column_values(ids: ["{retina_col}", "{status_col}"]) {{
                        id
                        text
                    }}
                }}
            }}
        }}
    }}'''
    data = monday_query(query)
    if not data or "data" not in data:
        return items

    page_data = data["data"]["boards"][0]["items_page"]
    cursor = page_data.get("cursor")
    batch = page_data.get("items", [])
    items.extend(batch)
    page += 1
    print(f"    Page {page}: {len(batch)} items (cursor: {'yes' if cursor else 'no'})")

    # Subsequent pages
    while cursor:
        query = f'''{{
            next_items_page(limit: 500, cursor: "{cursor}") {{
                cursor
                items {{
                    id
                    name
                    column_values(ids: ["{retina_col}", "{status_col}"]) {{
                        id
                        text
                    }}
                }}
            }}
        }}'''
        data = monday_query(query)
        if not data or "data" not in data:
            break
        page_data = data["data"]["next_items_page"]
        cursor = page_data.get("cursor")
        batch = page_data.get("items", [])
        items.extend(batch)
        page += 1
        print(f"    Page {page}: {len(batch)} items (cursor: {'yes' if cursor else 'no'})")
        time.sleep(0.5)  # Rate limiting

    return items


def extract_retina_status(items, retina_col, status_col):
    """Extract retina -> status mapping from items."""
    mapping = {}
    for item in items:
        retina = None
        status = None
        for cv in item.get("column_values", []):
            if cv["id"] == retina_col:
                retina = (cv.get("text") or "").strip().lower()
            elif cv["id"] == status_col:
                status = (cv.get("text") or "").strip()
        if retina and retina != "":
            if not status or status == "":
                status = "SANS_STATUT"
            mapping[retina] = status
    return mapping


def sanitize_status(status):
    """Convert status to a folder name: uppercase, underscores."""
    s = status.strip().upper()
    s = s.replace(" ", "_")
    s = s.replace("'", "")
    s = s.replace("/", "-")
    s = s.replace("\\", "-")
    # Remove any problematic chars
    safe = ""
    for c in s:
        if c.isalnum() or c in ("_", "-", "."):
            safe += c
        else:
            safe += "_"
    return safe if safe else "SANS_STATUT"


def main():
    print("=" * 60)
    print("REORGANISATION PPE PAR STATUT MONDAY")
    print("=" * 60)

    # Step 1: List current PPE folders
    all_folders = [
        d for d in os.listdir(PPE_DIR)
        if os.path.isdir(os.path.join(PPE_DIR, d))
    ]
    print(f"\n[1] Dossiers PPE trouves: {len(all_folders)}")

    # Step 2: Fetch statuses from Monday
    print("\n[2] Recuperation des statuts Monday...")
    retina_to_status = {}

    for board in BOARDS:
        print(f"\n  Board: {board['name']} (ID: {board['id']})")

        # Discover status column
        status_col = discover_status_column(board["id"])
        if not status_col:
            print(f"    [ERROR] Colonne statut introuvable, skip")
            continue
        print(f"    Colonne statut: {status_col}")

        # Fetch all items
        items = fetch_all_items(board["id"], board["retina_col"], status_col)
        print(f"    Total items: {len(items)}")

        # Extract mapping
        mapping = extract_retina_status(items, board["retina_col"], status_col)
        print(f"    Items avec retina: {len(mapping)}")

        # Merge (later boards don't override earlier ones)
        for retina, status in mapping.items():
            if retina not in retina_to_status:
                retina_to_status[retina] = status

        time.sleep(1)  # Rate limiting between boards

    print(f"\n  Total retina -> statut mappings: {len(retina_to_status)}")

    # Step 3: Reorganize folders
    print("\n[3] Reorganisation des dossiers...")
    moved = 0
    unknown = 0
    status_counts = {}

    for folder in all_folders:
        folder_lower = folder.lower()
        src = os.path.join(PPE_DIR, folder)

        if folder_lower in retina_to_status:
            raw_status = retina_to_status[folder_lower]
            status_dir = sanitize_status(raw_status)
        else:
            status_dir = "INCONNU"
            unknown += 1

        # Create status subfolder if needed
        dest_parent = os.path.join(PPE_DIR, status_dir)
        os.makedirs(dest_parent, exist_ok=True)

        dest = os.path.join(dest_parent, folder)

        # Move
        if os.path.exists(dest):
            print(f"  [SKIP] {folder} -> {status_dir}/ (destination existe deja)")
            continue

        shutil.move(src, dest)
        moved += 1

        status_counts[status_dir] = status_counts.get(status_dir, 0) + 1

    print(f"\n  Dossiers deplaces: {moved}")
    print(f"  Dossiers INCONNU: {unknown}")

    # Step 4: Verification
    print("\n[4] Verification finale...")
    print(f"\nContenu de PPE/ :")
    remaining_root = []
    status_folders = []

    for item in sorted(os.listdir(PPE_DIR)):
        full = os.path.join(PPE_DIR, item)
        if os.path.isdir(full):
            # Check if it's a status folder (contains subfolders) or a stray retina folder
            sub_items = os.listdir(full)
            sub_dirs = [s for s in sub_items if os.path.isdir(os.path.join(full, s))]
            if sub_dirs:
                status_folders.append((item, len(sub_dirs)))
            else:
                remaining_root.append(item)

    print(f"\n{'STATUT':<35} {'NB DOSSIERS':>12}")
    print("-" * 50)
    total = 0
    for status, count in sorted(status_folders, key=lambda x: -x[1]):
        print(f"  {status:<33} {count:>10}")
        total += count
    print("-" * 50)
    print(f"  {'TOTAL':<33} {total:>10}")

    if remaining_root:
        print(f"\n  [WARN] {len(remaining_root)} dossiers encore a la racine de PPE/:")
        for f in remaining_root[:10]:
            print(f"    - {f}")
    else:
        print(f"\n  OK — Aucun dossier Retina a la racine de PPE/")

    print("\n" + "=" * 60)
    print("TERMINE")
    print("=" * 60)


if __name__ == "__main__":
    main()
