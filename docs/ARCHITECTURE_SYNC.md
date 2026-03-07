# Architecture de Synchronisation VELO

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MONDAY.COM                                    │
│                   (Source de Vérité - SSOT)                         │
│                                                                      │
│   Board: Vélos Cargos - Général (ID: 9990833105)                   │
│   - Création des clients                                            │
│   - Données business officielles                                    │
│   - Statuts commerciaux                                             │
└─────────────────────────────────────────────────────────────────────┘
                    │                           ▲
                    │ Webhooks                  │ API GraphQL
                    │ (automatique)             │ (syncClientToMonday)
                    ▼                           │
┌─────────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                      │
│                    (Cache + Données App)                            │
│                                                                      │
│   - Miroir des données Monday (table: clients)                      │
│   - Données propres: tokens, livraisons, documents, logs            │
│   - Performance: lecture rapide pour l'interface                    │
└─────────────────────────────────────────────────────────────────────┘
                    │                           ▲
                    │ Lecture                   │ Écriture
                    ▼                           │
┌─────────────────────────────────────────────────────────────────────┐
│                      INTERFACE WEB                                   │
│                                                                      │
│   - Admin: gestion clients, statuts, envoi formulaires              │
│   - Formulaire client: code ENEMAT, adresse livraison               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Flux de Données

### 1. Création d'un client

```
Monday (manuel) → Webhook create_item → Supabase (nouveau client)
```

Les clients sont créés **uniquement sur Monday**. Le webhook `create_item` crée automatiquement l'entrée dans Supabase.

### 2. Modification depuis l'interface admin

```
Interface → API PUT /api/admin/clients/[id]
    ↓
Supabase (mise à jour immédiate)
    ↓
syncClientToMonday() → API Monday
    ↓
Monday (mis à jour)
```

### 3. Modification depuis Monday

```
Monday (modification) → Webhook change_column_value/update_name
    ↓
/api/webhooks/monday
    ↓
Supabase (mis à jour)
    ↓
Interface (voit les changements au prochain chargement)
```

### 4. Formulaire client

```
Client remplit formulaire
    ↓
Supabase (stockage immédiat - rapidité)
    ↓
syncClientToMonday() → API Monday
    ↓
Monday (données finales)
```

---

## Webhooks Monday

**URL**: `https://velo-fawn.vercel.app/api/webhooks/monday`

| Webhook | Type Monday | Action |
|---------|-------------|--------|
| Changement colonne | `update_column_value` | Met à jour le champ correspondant dans Supabase |
| Changement nom | `update_name` | Met à jour `raison_sociale` dans Supabase |
| Création item | `create_item` | Crée un nouveau client dans Supabase |

**Gestion des webhooks**: `/api/monday/webhooks` (GET/POST/DELETE)

---

## Mapping des Champs

### Colonnes principales (Monday → Supabase)

| Monday Column ID | Supabase Field | Description |
|-----------------|----------------|-------------|
| `name` | `raison_sociale` | Nom de l'entreprise |
| `text_mkvfykn9` | `siret` | SIRET |
| `email_mkvfnv4q` | `email_beneficiaire` | Email du client |
| `email_mkvfk63f` | `email` | Email de l'agent |
| `color_mkvfws5n` | `statut_commercial` | Statut principal |
| `text_mkzvqk4s` | `code_enemat_saisi` | Code ENEMAT |
| `numeric_mkvfghjq` | `velo_devis` | Nombre vélos devis |
| `numeric_mkvcqm0r` | `velo_valide` | Nombre vélos validés |

### Mapping des statuts commerciaux

| Monday Label | Supabase Value |
|--------------|----------------|
| DOSSIER COMPLET | `dossier_complet` |
| DEVIS SIGNÉ | `devis_signe` |
| CONTROLE VALIDÉ | `controle_valide` |
| CLIENT CONTACTÉ | `client_contacte` |
| CLIENT INJOIGNABLE | `client_injoignable` |
| CODE ENVOYÉ | `code_envoye` |
| FORMULAIRE ENVOYÉ | `formulaire_envoye` |
| LIVRÉ | `livre` |

**Mapping complet**: `monday_field_mapping` (table Supabase) et `/src/lib/monday/config.ts`

---

## Fichiers Clés

### API Routes

| Fichier | Fonction |
|---------|----------|
| `/api/webhooks/monday/route.ts` | Réception webhooks Monday |
| `/api/monday/webhooks/route.ts` | Gestion webhooks (list/create/delete) |
| `/api/admin/clients/[id]/route.ts` | CRUD client + sync Monday |
| `/api/monday/clients/route.ts` | Lecture directe Monday |

### Lib Monday

| Fichier | Fonction |
|---------|----------|
| `/lib/monday/api.ts` | Fonctions API Monday (updateMondayItem, syncClientToMonday) |
| `/lib/monday/config.ts` | Configuration et mappings |
| `/lib/monday/dynamic-mapping.ts` | Chargement mappings depuis Supabase |

---

## Tables Supabase

### `clients`
Table principale, miroir de Monday + données app.

Champs sync Monday:
- `monday_item_id` - ID de l'item Monday
- `monday_synced_at` - Date dernière sync
- `monday_sync_status` - synced/pending/error/deleted

Champs app uniquement:
- `token_formulaire` - Token accès formulaire
- `code_enemat_valide` - Boolean validation code
- `code_enemat_tentatives` - Compteur tentatives
- `code_enemat_bloque` - Boolean blocage

### `monday_field_mapping`
Mappings dynamiques Monday ↔ Supabase.

- `interface_field` - Nom champ Supabase
- `monday_column_id` - ID colonne Monday
- `value_mapping` - JSON mapping valeurs (ex: statuts)
- `is_synced` - Boolean actif

### `sync_monday_log`
Logs de toutes les syncs.

- `action` - webhook_received, api_update, etc.
- `direction` - monday_to_supabase / supabase_to_monday
- `statut` - pending/success/error
- `message_erreur` - Détail erreur si applicable

### `livraisons`
Données de livraison (propres à l'app).

### `workflow_transitions`
Historique changements de statut.

---

## Points Importants

### 1. Monday = Source de Vérité
- Toute modification "officielle" doit finir sur Monday
- Les rapports/exports se font depuis Monday
- Supabase est un cache rapide, pas la référence

### 2. Bidirectionnel mais asymétrique
- Monday → Supabase : automatique via webhooks
- Supabase → Monday : via API lors des modifications interface

### 3. Gestion des erreurs
- Si sync Monday échoue, les données restent dans Supabase
- Les logs permettent de diagnostiquer
- L'interface affiche le statut de sync

### 4. Performance
- L'interface lit Supabase (rapide, ~50ms)
- Monday API est lent (~500ms-2s)
- Le cache Supabase évite les appels Monday répétés

---

## Commandes Utiles

```bash
# Voir les webhooks actifs
curl https://velo-fawn.vercel.app/api/monday/webhooks

# Créer les webhooks manquants
curl -X POST https://velo-fawn.vercel.app/api/monday/webhooks

# Voir les logs de sync récents
SELECT * FROM sync_monday_log ORDER BY created_at DESC LIMIT 20;

# Vérifier un client spécifique
SELECT raison_sociale, monday_item_id, monday_synced_at, statut_commercial
FROM clients WHERE raison_sociale ILIKE '%test%';
```

---

## Historique des Corrections (Janvier 2026)

1. **Double JSON.stringify** - Fix dans `updateMondayItem()` pour les statuts
2. **getChangedFields** - Ne compare que les champs présents dans la mise à jour
3. **Sync nom (raison_sociale)** - Type `String` au lieu de `JSON` pour Monday API
4. **Webhook update_name** - Ajout support pour sync nom Monday → Supabase
5. **Reset formulaire** - `needsReset` pour ramener client à l'étape code ENEMAT
