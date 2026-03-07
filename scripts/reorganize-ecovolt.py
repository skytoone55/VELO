#!/usr/bin/env python3
"""
Réorganise les dossiers ECOVOLT par statut commercial Monday.
- Récupère tous les items du board Ecovolt via API Monday (paginé)
- Match chaque dossier Retina avec son statut commercial
- Déplace dans ECOVOLT/{STATUT}/{retina}/
"""

import os
import json
import shutil
import requests
import re
import unicodedata

# --- Config ---
ECOVOLT_DIR = "/Users/john/JARVIS/projets/velo/documents-client-velo/ECOVOLT"
MONDAY_TOKEN = "REDACTED_MONDAY_ECOVOLT_TOKEN"
BOARD_ID = "9990833105"
RETINA_COL = "text_mkvfxbkp"
STATUT_COL = "color_mkvfws5n"
API_URL = "https://api.monday.com/v2"

headers = {
    "Authorization": MONDAY_TOKEN,
    "Content-Type": "application/json",
    "API-Version": "2024-10"
}


def normalize_statut(statut: str) -> str:
    """Convertit un statut en nom de dossier : MAJUSCULES, underscores."""
    if not statut or statut.strip() == "":
        return "INCONNU"
    # Remove accents
    s = unicodedata.normalize('NFD', statut)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    # Uppercase, replace spaces and special chars
    s = s.upper().strip()
    s = re.sub(r'[^A-Z0-9]+', '_', s)
    s = s.strip('_')
    return s if s else "INCONNU"


def fetch_all_items():
    """Pagine tous les items du board Monday et retourne {retina: statut}."""
    retina_to_statut = {}
    cursor = None
    page = 0

    while True:
        page += 1
        if cursor is None:
            query = """
            query {
                boards(ids: [%s]) {
                    items_page(limit: 100) {
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
            """ % (BOARD_ID, RETINA_COL, STATUT_COL)
        else:
            query = """
            query {
                next_items_page(limit: 100, cursor: "%s") {
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
            """ % (cursor, RETINA_COL, STATUT_COL)

        resp = requests.post(API_URL, json={"query": query}, headers=headers)
        data = resp.json()

        if "errors" in data:
            print(f"  ERREUR API Monday: {data['errors']}")
            break

        if cursor is None:
            page_data = data["data"]["boards"][0]["items_page"]
        else:
            page_data = data["data"]["next_items_page"]

        items = page_data.get("items", [])
        cursor = page_data.get("cursor")

        print(f"  Page {page}: {len(items)} items récupérés")

        for item in items:
            retina = None
            statut = None
            for col in item.get("column_values", []):
                if col["id"] == RETINA_COL:
                    retina = (col.get("text") or "").strip()
                elif col["id"] == STATUT_COL:
                    statut = (col.get("text") or "").strip()

            if retina:
                retina_to_statut[retina] = statut or ""

        if not cursor or len(items) == 0:
            break

    return retina_to_statut


def reorganize():
    print("=" * 60)
    print("RÉORGANISATION ECOVOLT PAR STATUT COMMERCIAL")
    print("=" * 60)

    # Step 1: List current folders
    print("\n[1/4] Listing des dossiers ECOVOLT actuels...")
    all_entries = os.listdir(ECOVOLT_DIR)
    # Only consider directories that look like retina refs (hex-like), not status folders
    folders = []
    for entry in all_entries:
        full_path = os.path.join(ECOVOLT_DIR, entry)
        if os.path.isdir(full_path):
            folders.append(entry)
    print(f"  {len(folders)} dossiers trouvés")

    # Step 2: Fetch Monday data
    print("\n[2/4] Récupération des statuts Monday (board {})...".format(BOARD_ID))
    retina_to_statut = fetch_all_items()
    print(f"  {len(retina_to_statut)} items avec Retina récupérés")

    # Show unique statuts
    unique_statuts = set(retina_to_statut.values())
    print(f"  Statuts uniques: {unique_statuts}")

    # Step 3: Reorganize
    print("\n[3/4] Réorganisation des dossiers...")
    stats = {}
    moved = 0
    not_found = []

    for folder in folders:
        # Check if this is already a status folder (contains subfolders that are retina refs)
        # Skip if folder name matches a known status pattern (all uppercase with underscores)
        if folder == folder.upper() and not re.match(r'^[0-9a-f]+$', folder.lower()):
            print(f"  SKIP (déjà un dossier statut): {folder}")
            continue

        statut_raw = retina_to_statut.get(folder, None)

        if statut_raw is None:
            statut_label = "INCONNU"
            not_found.append(folder)
        else:
            statut_label = normalize_statut(statut_raw)

        # Create status directory if needed
        statut_dir = os.path.join(ECOVOLT_DIR, statut_label)
        os.makedirs(statut_dir, exist_ok=True)

        # Move folder
        src = os.path.join(ECOVOLT_DIR, folder)
        dst = os.path.join(statut_dir, folder)

        if os.path.exists(dst):
            print(f"  ATTENTION: {dst} existe déjà, skip {folder}")
            continue

        shutil.move(src, dst)
        moved += 1

        stats[statut_label] = stats.get(statut_label, 0) + 1

    print(f"\n  {moved} dossiers déplacés")

    # Step 4: Verification
    print("\n[4/4] Vérification finale...")
    print(f"\n{'='*60}")
    print("RÉSUMÉ PAR STATUT :")
    print(f"{'='*60}")

    final_entries = sorted(os.listdir(ECOVOLT_DIR))
    total_retina = 0
    root_orphans = []

    for entry in final_entries:
        full_path = os.path.join(ECOVOLT_DIR, entry)
        if os.path.isdir(full_path):
            # Check if it's a status folder or a leftover retina folder
            sub_entries = [e for e in os.listdir(full_path) if os.path.isdir(os.path.join(full_path, e))]
            if entry == entry.upper() and not re.match(r'^[0-9a-f]+$', entry.lower()):
                # This is a status folder
                count = len(sub_entries)
                total_retina += count
                print(f"  {entry:40s} → {count} dossiers")
            else:
                # Orphan retina folder at root
                root_orphans.append(entry)

    print(f"\n  TOTAL dossiers triés : {total_retina}")

    if root_orphans:
        print(f"\n  ⚠ {len(root_orphans)} dossiers Retina restés à la racine :")
        for o in root_orphans:
            print(f"    - {o}")
    else:
        print("\n  ✓ Aucun dossier Retina à la racine — tri complet")

    if not_found:
        print(f"\n  {len(not_found)} dossiers sans match Monday (→ INCONNU) :")
        for nf in not_found[:10]:
            print(f"    - {nf}")
        if len(not_found) > 10:
            print(f"    ... et {len(not_found) - 10} autres")

    print(f"\n{'='*60}")
    print("DONE")
    print(f"{'='*60}")


if __name__ == "__main__":
    reorganize()
