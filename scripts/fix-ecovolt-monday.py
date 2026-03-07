#!/usr/bin/env python3
"""
Fix Ecovolt Monday.com board (9990833105) based on comparison JSON.
- Updates ~551 phone format differences
- Updates ~24 real data differences (ref devis, ref interne, adresse, CP, SIRET, email, ville)

Usage: python3 fix-ecovolt-monday.py [--dry-run]
"""

import json
import os
import sys
import time
import requests
from pathlib import Path

# --- Config ---
BOARD_ID = 9990833105
API_URL = "https://api.monday.com/v2"
COMPARISON_FILE = Path(__file__).parent / "ecovolt-comparison-v3.json"
ENV_FILE = Path(__file__).parent.parent / ".env.local"
DRY_RUN = "--dry-run" in sys.argv

# --- Column mapping: comparison label -> Monday column_id ---
COLUMN_MAP = {
    "Telephone":   "long_text_mkvn5k9w",   # long_text
    "Ref devis":   "text_mkvf8zp6",         # text (Numerodevis_RETINA)
    "Ref interne": "text_mkvfxbkp",         # text (refinternedeloperation_RETINA)
    "Adresse":     "text_mkvfetg2",         # text (adresseopération_RETINA)
    "Code postal": "text_mkvfhcn9",         # text (CPoperation_RETINA)
    "SIRET":       "text_mkvfykn9",         # text (SIRET_RETINA)
    "Email":       "email_mkvfnv4q",        # email (emailbeneficiaire_RETINA)
    "Ville":       "text_mkvfgh8t",         # text (Villeopération_RETINA)
}

# Column types that need special JSON formatting
SPECIAL_TYPES = {
    "long_text_mkvn5k9w": "long_text",
    "email_mkvfnv4q": "email",
}


def load_token():
    """Load Monday API token from .env.local"""
    with open(ENV_FILE) as f:
        for line in f:
            if line.startswith("MONDAY_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise ValueError("MONDAY_API_KEY not found in .env.local")


def clean_excel_value(field, value):
    """Clean Excel values (remove .0 from numbers, normalize phone)."""
    if value is None:
        return ""
    value = str(value).strip()
    # Remove trailing .0 from numeric-looking values
    if value.endswith(".0") and field in ("Code postal", "SIRET", "Ref interne", "Telephone"):
        value = value[:-2]
    # Phone: normalize to local 0X format
    if field == "Telephone":
        digits = value.replace(" ", "")
        # Already local format (starts with 0, 10 digits)
        if digits.startswith("0") and len(digits) == 10:
            value = digits
        # Reunion/Mayotte: 262 + 9 digits (e.g. "2626 92 01 62 67" -> 262692016267)
        elif digits.startswith("262") and len(digits) >= 12:
            local = digits[3:]
            value = local if local.startswith("0") else "0" + local
        # Martinique/Guadeloupe: 596/590 + 9 digits
        elif digits.startswith("596") and len(digits) >= 12:
            local = digits[3:]
            value = local if local.startswith("0") else "0" + local
        elif digits.startswith("590") and len(digits) >= 12:
            local = digits[3:]
            value = local if local.startswith("0") else "0" + local
        # France metro: 33 + 9-10 digits (e.g. "336 95 38 64 86" or "3307 67 42 71 53")
        elif digits.startswith("33") and len(digits) >= 11:
            local = digits[2:]
            value = local if local.startswith("0") else "0" + local
        # Martinique alt: 5946 prefix (e.g. "5946 94 40 02 44" -> 594694400244)
        # Actually 594 is Guyane, the "6" is part of local number
        elif digits.startswith("594") and len(digits) >= 12:
            value = "0" + digits[3:]
        # Guadeloupe: 352 prefix might be Reunion mobile?
        elif digits.startswith("352") and len(digits) >= 12:
            value = "0" + digits[3:]
        # Short number without country code (9 digits like 690630974)
        elif len(digits) == 9 and digits[0] in "6789":
            value = "0" + digits
        # 178... unusual - leave as-is (skip update)
        elif digits.startswith("178"):
            return None  # Signal to skip
        else:
            # Fallback: just strip spaces
            value = digits
    return value


def format_column_value(col_id, value):
    """Format a value for Monday API based on column type."""
    col_type = SPECIAL_TYPES.get(col_id)
    if col_type == "long_text":
        return json.dumps({"text": value})
    elif col_type == "email":
        return json.dumps({"email": value, "text": value})
    else:
        # Simple text columns
        return json.dumps(value)


def monday_api(token, query, retries=3):
    """Execute a Monday API query with retry logic."""
    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
    }
    for attempt in range(retries):
        try:
            resp = requests.post(API_URL, headers=headers, json={"query": query}, timeout=30)
            data = resp.json()
            if "errors" in data:
                err_msg = data["errors"][0].get("message", "")
                if "rate limit" in err_msg.lower() or "complexity" in err_msg.lower():
                    wait = 5 * (attempt + 1)
                    print(f"  Rate limited, waiting {wait}s...")
                    time.sleep(wait)
                    continue
                return data
            return data
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                return {"errors": [{"message": str(e)}]}
    return {"errors": [{"message": "Max retries exceeded"}]}


def update_item(token, item_id, col_id, value):
    """Update a single column value for an item."""
    formatted = format_column_value(col_id, value)
    # Use change_column_value for special types, change_simple_column_value for text
    col_type = SPECIAL_TYPES.get(col_id)
    if col_type:
        # For email and long_text, use change_column_value with JSON
        escaped = formatted.replace("\\", "\\\\").replace('"', '\\"')
        query = f'''mutation {{
            change_column_value(
                board_id: {BOARD_ID},
                item_id: {item_id},
                column_id: "{col_id}",
                value: "{escaped}"
            ) {{ id }}
        }}'''
    else:
        # For simple text columns
        escaped_val = value.replace("\\", "\\\\").replace('"', '\\"')
        query = f'''mutation {{
            change_simple_column_value(
                board_id: {BOARD_ID},
                item_id: {item_id},
                column_id: "{col_id}",
                value: "{escaped_val}"
            ) {{ id }}
        }}'''
    return monday_api(token, query)


def main():
    token = load_token()
    print(f"Loaded API token (ends ...{token[-8:]})")

    with open(COMPARISON_FILE) as f:
        data = json.load(f)

    mismatches = data["mismatches_all"]
    print(f"Total items with differences: {len(mismatches)}")
    print(f"Dry run: {DRY_RUN}\n")

    # Stats
    stats = {
        "items_updated": 0,
        "fields_updated": 0,
        "by_field": {},
        "errors": [],
    }

    for i, item in enumerate(mismatches):
        item_id = item["monday_id"]
        item_name = item["name"]
        diffs = item["diffs"]

        updates_for_item = []
        for field_label, vals in diffs.items():
            col_id = COLUMN_MAP.get(field_label)
            if not col_id:
                stats["errors"].append(f"Unknown field: {field_label}")
                continue

            excel_val = clean_excel_value(field_label, vals["excel"])

            if excel_val is None or not excel_val or excel_val == "(vide)":
                # Skip empty/invalid values - don't overwrite Monday with empty
                continue

            updates_for_item.append((field_label, col_id, excel_val))

        if not updates_for_item:
            continue

        item_had_update = False
        for field_label, col_id, excel_val in updates_for_item:
            if DRY_RUN:
                print(f"  [DRY] {item_name} | {field_label}: -> {excel_val!r}")
                stats["by_field"][field_label] = stats["by_field"].get(field_label, 0) + 1
                stats["fields_updated"] += 1
                item_had_update = True
                continue

            result = update_item(token, item_id, col_id, excel_val)
            if "errors" in result:
                err = result["errors"][0].get("message", "unknown")
                stats["errors"].append(f"{item_name} / {field_label}: {err}")
                print(f"  ERROR {item_name} | {field_label}: {err}")
            else:
                stats["by_field"][field_label] = stats["by_field"].get(field_label, 0) + 1
                stats["fields_updated"] += 1
                item_had_update = True

            # Rate limit: 0.15s between mutations
            time.sleep(0.15)

        if item_had_update:
            stats["items_updated"] += 1

        # Progress every 50 items
        if (i + 1) % 50 == 0:
            print(f"  Progress: {i+1}/{len(mismatches)} items processed, {stats['fields_updated']} fields updated")

    # --- Report ---
    print("\n" + "=" * 60)
    print("REPORT")
    print("=" * 60)
    print(f"Items updated:  {stats['items_updated']}")
    print(f"Fields updated: {stats['fields_updated']}")
    print(f"\nBreakdown by field:")
    for field, count in sorted(stats["by_field"].items(), key=lambda x: -x[1]):
        print(f"  {field:20s}: {count}")
    if stats["errors"]:
        print(f"\nErrors ({len(stats['errors'])}):")
        for err in stats["errors"][:20]:
            print(f"  - {err}")
        if len(stats["errors"]) > 20:
            print(f"  ... and {len(stats['errors']) - 20} more")
    else:
        print("\nNo errors.")


if __name__ == "__main__":
    main()
