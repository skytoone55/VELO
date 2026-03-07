# Memory Export — Velo FNUCI — 2026-03-04

## Projet
- Nom : Velo (PPE Energie + Ecovolt)
- Sujet de la session : Création des boards FNUCI sur deux comptes Monday.com séparés (Ecovolt + PPE) et import des étiquettes depuis Excel

## Décisions prises
- Deux boards FNUCI séparés sur deux comptes Monday distincts (Ecovolt ≠ PPE)
- Colonnes retenues : Étiquette (nom item), Référence (text), Département (status) — PAS de colonne Pulse ID
- Départements Ecovolt : Martinique, Guadeloupe, Guyane, Réunion
- Départements PPE : Paris, Marseille, Lyon, Bordeaux, Nantes
- Assignation Ecovolt : tout Martinique SAUF étiquettes 501-705 → Réunion

## Découvertes / apprentissages
- Monday.com status column `defaults` format : `{"labels":{"0":"Label1","1":"Label2",...}}` (index-based map, pas un array)
- MCP connector `create_column` ne supporte pas bien les status labels → utiliser `all_monday_api` avec mutation GraphQL brute
- Les status column values se settent via `{"index": N}` dans column_values JSON
- Pagination Monday : `items_page` + `next_items_page` avec cursor (pas offset)
- Bug critique : lancer deux Task en background pour le même import = double exécution = doublons

## Actions effectuées
- Board FNUCI Ecovolt créé (workspace "Vélo Cargo" ID 12213672) avec 1500 items importés et départements assignés
- Board FNUCI PPE créé (board ID 5092616486, workspace "CRM ENERGIE" ID 4852276) avec colonnes Référence (text_mm13zd7a) et Département (color_mm13fzxk)
- 1000 items importés sur PPE (étiquettes 501-1500)
- Bug double import détecté et corrigé : 1000 doublons supprimés (dedup-ppe.py)
- Fichiers Excel déplacés du DEPOT vers projets/velo/docs/ (FNUCI-ecovolt.xlsx + FNUCI-PPE.xlsx)
- Scripts créés : import-monday-ecovolt.py, import-monday-ppe.py, dedup-ppe.py

## État actuel
- Board FNUCI Ecovolt : TERMINÉ (1500 items, départements assignés)
- Board FNUCI PPE : 1000 items importés, board propre (doublons supprimés), MAIS départements PAS encore assignés (John n'a pas donné la répartition Paris/Marseille/Lyon/Bordeaux/Nantes)

## Prochaines étapes
- John doit fournir la répartition des départements PPE (quelles étiquettes → quel département)
- Assigner les départements sur le board PPE une fois la répartition connue

## Infos importantes à mémoriser
- **Compte Monday PPE** (crm-oreka) : via MCP connector `mcp__1cbacd9b-aa49-4cc1-8444-d1e04ead8347`
- **Compte Monday Ecovolt** (alexandredelannays-team) : via API directe, token `eyJhbG...Bp5M`
- **Board PPE FNUCI** : ID 5092616486, workspace CRM ENERGIE (4852276)
- **Colonnes PPE** : Référence = text_mm13zd7a, Département = color_mm13fzxk
- **Labels Département PPE** : 0=Paris, 1=Marseille, 2=Lyon, 3=Bordeaux, 4=Nantes
- **Scripts** : projets/velo/import-monday-ecovolt.py, import-monday-ppe.py, dedup-ppe.py
- **Fichiers source** : projets/velo/docs/FNUCI-ecovolt.xlsx, projets/velo/docs/FNUCI-PPE.xlsx
