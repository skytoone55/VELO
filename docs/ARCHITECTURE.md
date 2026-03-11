# ARCHITECTURE VELO — Source de Verite

> Derniere mise a jour : 2026-03-11
> Ce fichier DOIT etre mis a jour a chaque modification du systeme.
> Genere a partir des audits : AUDIT-API-ROUTES-COMPLET.md, AUDIT-PAGES-VELO.md, audit DB schema, audit integrations.

### Changelog
| Date | Modifications |
|------|---------------|
| 2026-03-11 | Auth guards ajoutes sur 13 routes API, filtrage role-based sur 5 routes, fix RLS monday_field_mapping/monday_boards, database.ts synced (3 tables + 14 colonnes), FNUCI/NAF sort + pagination, livraisons page UI cleanup |
| 2026-03-11 (v2) | Refonte filtrage agent_secteur par depot_ids (5 routes), sync statut client/livraison (C1+C2+C3), tournees accessibles agent/livreur (lecture), bulk statut formulaire_envoye, envoi formulaire livraison → en_livraison, filtre depot dual (retrait+logistique), RLS livraisons depot_ids, NAF affiche fiche client |

---

## 1. Vue d'ensemble

### Description
CRM et gestion commerciale pour velos-cargos electriques. Multi-tenant : deux entites (PPE Energie et Ecovolt) partagent le meme codebase avec des configurations differentes. Gestion complete du parcours client : import Monday.com, validation NAF, formulaire client, geocodage, assignation depot, planification livraison, tournee livreur, FNUCI, bon de livraison PDF.

### Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Next.js 15.5.12 |
| Runtime | React 19.2.3, TypeScript |
| UI | Radix UI, Tailwind CSS, Lucide React |
| Backend | Supabase (2 instances) |
| Auth | Supabase Auth + table `users_profile` |
| Integration | Monday.com API (GraphQL, 2 comptes distincts) |
| Email | Nodemailer (SMTP Microsoft 365 ou Gmail OAuth2) |
| Geocodage | api-adresse.data.gouv.fr (gratuit, sans cle) |
| Carte | Google Maps (`@react-google-maps/api`) |
| Deploiement | Vercel (2 deployments) |

### URLs de deploiement

| Tenant | URL | Vercel project |
|--------|-----|----------------|
| Ecovolt | https://velo-fawn.vercel.app | velo |
| PPE Energie | https://velo-ppe.vercel.app | velo |

### Repo GitHub
`skytoone55/VELO`

---

## 2. Multi-tenant

### Principe
Meme codebase, 2 deployments Vercel avec des env vars differentes. Le tenant actif est determine par `NEXT_PUBLIC_TENANT_ID` ('ecovolt' ou 'ppe'). Default = 'ecovolt'.

### Differences cles

| Critere | PPE Energie | Ecovolt |
|---------|-------------|---------|
| Supabase | zfpzhhdovxllchlsihcr | irpnllwlxivlylclfjwd |
| MCP alias | supabase-ppe | supabase-mz |
| Compte Monday | crm-oreka | alexandredelannays-team |
| Boards Monday | 7 boards (ATHOME, ALEX, DIZIEN, EKL, JM, SALIH, STELLARS) | 1 board (#9990833105) |
| Multi-board | Oui (MONDAY_BOARD_IDS) | Non (MONDAY_BOARD_ID) |
| Validation NAF labels | OUI / NON / A VERIFIER | Fait / Bloque / En cours |
| Departements | France metro (codes 2 chiffres) | DOM-TOM (971-976) |
| Commercial | Nom du board (ATHOME, ALEX, etc.) | Email agent Monday |
| Email | SMTP (Microsoft 365) | Gmail OAuth2 |
| Couleur primaire | #7CB342 (vert) | #F5D100 (jaune) |
| Contact support email | velo-cargo@patrimoine-energie.fr | admin@eco-volt.fr |
| Contact support tel | 0974161400 | 0757991125 |
| Territoires | ['FR'] | ['971','972','973','974'] |
| SIRET legal | 84451895100018 | (vide) |
| FNUCI | Oui (page admin dediee) | Non |

### Variable d'environnement
`NEXT_PUBLIC_TENANT_ID` = 'ecovolt' | 'ppe'

---

## 3. Base de donnees

### 3.1 Instances Supabase

| Instance | ID projet | URL | MCP alias | Tenant |
|----------|-----------|-----|-----------|--------|
| Ecovolt | irpnllwlxivlylclfjwd | https://irpnllwlxivlylclfjwd.supabase.co | supabase-mz | ecovolt |
| PPE Energie | zfpzhhdovxllchlsihcr | https://zfpzhhdovxllchlsihcr.supabase.co | supabase-ppe | ppe |

Les 2 instances ont le MEME schema. 3 modes de connexion :

| Fichier | Client Supabase | Contexte | Auth |
|---------|----------------|----------|------|
| `src/lib/supabase/client.ts` | createBrowserClient (SSR) | Navigateur | Anon key |
| `src/lib/supabase/server.ts` | createServerClient (SSR) | Server Components / API Routes | Anon key + cookies |
| `src/lib/supabase/admin.ts` | createClient (standard) | Server-side uniquement | Service Role Key (bypass RLS) |

### 3.2 Tables

#### 3.2.1 `clients` (table principale — 68 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `raison_sociale` | TEXT | NON | - | Required |
| `siret` | TEXT | OUI | - | Etait VARCHAR(14), converti en TEXT (migration 0123) |
| `email` | TEXT | NON | - | Required |
| `telephone` | TEXT | OUI | null | - |
| `code_ape` | TEXT | OUI | null | Code NAF/APE |
| `departement` | TEXT | NON | - | Code INSEE (ex: '974') |
| `adresse_societe_ligne1` | TEXT | NON | - | Required |
| `adresse_societe_ligne2` | TEXT | OUI | null | - |
| `adresse_societe_cp` | TEXT | NON | - | Required |
| `adresse_societe_ville` | TEXT | NON | - | Required |
| `adresse_livraison_ligne1` | TEXT | OUI | null | - |
| `adresse_livraison_ligne2` | TEXT | OUI | null | - |
| `adresse_livraison_cp` | TEXT | OUI | null | - |
| `adresse_livraison_ville` | TEXT | OUI | null | - |
| `latitude` | FLOAT | OUI | null | Geocodage |
| `longitude` | FLOAT | OUI | null | Geocodage |
| `contact_nom` | TEXT | OUI | null | Contact principal (convention actuelle) |
| `contact_prenom` | TEXT | OUI | null | - |
| `contact_fonction` | TEXT | OUI | null | - |
| `nom_contact` | TEXT | OUI | null | **LEGACY doublon** de contact_nom |
| `prenom_contact` | TEXT | OUI | null | **LEGACY doublon** de contact_prenom |
| `email_beneficiaire` | TEXT | OUI | null | - |
| `format_juridique` | TEXT | OUI | null | - |
| `nb_salaries` | INTEGER | OUI | null | - |
| `commercial_assigne` | TEXT | OUI | null | Nom du commercial |
| `agence` | TEXT | OUI | null | Zone operationnelle Ecovolt |
| `velo_devis` | INTEGER | NON | - | Nb velos au devis |
| `velo_valide` | INTEGER | OUI | null | Nb velos valides |
| `numero_devis` | TEXT | OUI | null | - |
| `numero_facture` | TEXT | OUI | null | - |
| `reference_dossier` | TEXT | OUI | null | - |
| `reference_retina` | VARCHAR(10) | OUI | null | Cle de jointure universelle (unique index partiel) |
| `devis_pdf_url` | TEXT | OUI | null | - |
| `date_signature_devis` | TIMESTAMPTZ | OUI | null | - |
| `date_envoi_formulaire` | TIMESTAMPTZ | OUI | null | - |
| `date_visite_prealable` | TIMESTAMPTZ | OUI | null | - |
| `date_statut` | TIMESTAMPTZ | OUI | null | - |
| `date_validation_code` | TIMESTAMPTZ | OUI | null | - |
| `statut_commercial` | TEXT | OUI | null | Statut process client |
| `statut_formulaire` | TEXT | OUI | null | en_attente / formulaire_envoye / formulaire_complete / formulaire_bloque / valide |
| `statut_mail` | TEXT | OUI | null | - |
| `statut_retina` | TEXT | OUI | null | - |
| `statut_make` | TEXT | OUI | null | - |
| `statut_anomalie` | TEXT | OUI | null | - |
| `statut_doublon` | TEXT | OUI | null | - |
| `validation_naf` | TEXT | OUI | null | OUI / NON / A VERIFIER |
| `code_enemat_saisi` | TEXT | OUI | null | Code saisi par le client |
| `code_enemat_valide` | BOOLEAN | OUI | null | - |
| `code_enemat_bloque` | BOOLEAN | OUI | null | 3 tentatives max |
| `code_enemat_tentatives` | INTEGER | OUI | null | - |
| `code_validation_hash` | TEXT | OUI | null | SHA256 du code 6 chiffres |
| `code_validation_envoye_at` | TIMESTAMPTZ | OUI | null | - |
| `token_formulaire` | TEXT | OUI | null | Token acces formulaire |
| `depot_retrait_id` | UUID | OUI | null | FK -> depots(id) ON DELETE SET NULL |
| `depot_logistique_id` | UUID | OUI | null | FK -> depots(id) ON DELETE SET NULL |
| `monday_item_id` | BIGINT | OUI | null | ID item Monday.com |
| `monday_board_id` | TEXT | OUI | null | Board Monday d'origine |
| `monday_sync_status` | TEXT | OUI | null | - |
| `monday_synced_at` | TIMESTAMPTZ | OUI | null | - |
| `notes_internes` | TEXT | OUI | null | - |
| `preferences_livraison` | TEXT | OUI | null | - |
| `type_de_zone` | TEXT | OUI | null | gratuit / hors_zone |
| `equipe_ids` | TEXT | OUI | null | - |
| `fnuci_ids` | JSONB | OUI | null | IDs FNUCI |
| `attestation_urssaf_url` | TEXT | OUI | null | Document upload |
| `attestation_dsn_url` | TEXT | OUI | null | Document upload |
| `declaration_benevoles_url` | TEXT | OUI | null | Document upload |
| `documents_demandes` | JSONB | OUI | '{}' | { "urssaf": { "status": "pending"|"received" } } |
| `token_documents` | TEXT | OUI | null | Token formulaire demande de pieces |
| `piece_identite_url` | TEXT | OUI | null | - |
| `created_at` | TIMESTAMPTZ | NON | NOW() | - |
| `updated_at` | TIMESTAMPTZ | NON | NOW() | - |

**Index :**
- `idx_clients_depot_retrait_id` ON (depot_retrait_id)
- `idx_clients_depot_logistique_id` ON (depot_logistique_id)
- `idx_clients_monday_board_id` ON (monday_board_id) WHERE NOT NULL
- `clients_reference_retina_idx` UNIQUE ON (reference_retina) WHERE NOT NULL

**FK :** `depot_retrait_id` -> depots(id), `depot_logistique_id` -> depots(id)

**RLS :** Enabled. Policies permissives (migration 0123) :
- `clients_read_authenticated` : SELECT TO authenticated USING (true)
- `clients_insert_authenticated` : INSERT TO authenticated WITH CHECK (true)
- `clients_update_authenticated` : UPDATE TO authenticated USING (true) WITH CHECK (true)
- `clients_delete_authenticated` : DELETE TO authenticated USING (true)

---

#### 3.2.2 `depots` (19 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `nom` | TEXT | NON | - | - |
| `type` | TEXT | NON | 'retrait' | 'retrait' ou 'logistique' |
| `agence` | TEXT | NON | - | Zone operationnelle |
| `adresse` | TEXT | NON | - | - |
| `code_postal` | TEXT | NON | - | - |
| `ville` | TEXT | NON | - | - |
| `departement` | TEXT | NON | - | - |
| `latitude` | FLOAT | NON | - | - |
| `longitude` | FLOAT | NON | - | - |
| `rayon_couverture_km` | FLOAT | NON | - | Zone gratuite |
| `rayon_livraison_payant_km` | FLOAT | OUI | 0 | Zone payante au-dela du gratuit |
| `prix_livraison_payante` | FLOAT | OUI | 0 | Prix en euros |
| `email` | TEXT | OUI | null | - |
| `telephone` | TEXT | OUI | null | - |
| `actif` | BOOLEAN | OUI | null | - |
| `jours_ouverture` | TEXT[] | OUI | ['lundi','mardi','mercredi','jeudi','vendredi'] | - |
| `capacite_velos_jour` | INTEGER | OUI | 10 | - |
| `creneau_duree_minutes` | INTEGER | OUI | 30 | - |
| `creneaux` | JSONB | OUI | null | Creneaux horaires |
| `created_at` | TIMESTAMPTZ | OUI | NOW() | - |
| `updated_at` | TIMESTAMPTZ | OUI | NOW() | - |

---

#### 3.2.3 `livraisons` (37 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `client_id` | UUID | OUI | null | FK implicite -> clients(id) |
| `depot_id` | UUID | OUI | null | FK implicite -> depots(id) |
| `livreur_id` | UUID | OUI | null | FK implicite -> users_profile(id) |
| `mode_livraison` | TEXT | NON | - | 'domicile' ou 'point_relais' |
| `statut` | TEXT | OUI | null | en_attente / programmee / en_cours / annulee / livree |
| `date_livraison` | DATE | OUI | null | - |
| `date_livraison_effective` | TIMESTAMPTZ | OUI | null | - |
| `date_programmation` | TIMESTAMPTZ | OUI | null | - |
| `date_validation_code` | TIMESTAMPTZ | OUI | null | - |
| `adresse_livraison_ligne1` | TEXT | OUI | null | - |
| `adresse_livraison_ligne2` | TEXT | OUI | null | - |
| `adresse_livraison_cp` | TEXT | OUI | null | - |
| `adresse_livraison_ville` | TEXT | OUI | null | - |
| `complement_adresse` | TEXT | OUI | null | - |
| `creneau_debut` | TIMESTAMPTZ | OUI | null | - |
| `creneau_fin` | TIMESTAMPTZ | OUI | null | - |
| `heure_precise` | TEXT | OUI | null | Saisie admin planning jour |
| `creneau_date` | DATE | OUI | null | - |
| `creneau_heure_debut` | TIME | OUI | null | - |
| `creneau_heure_fin` | TIME | OUI | null | - |
| `code_enemat_saisi` | TEXT | OUI | null | - |
| `code_enemat_valide` | BOOLEAN | OUI | null | - |
| `document_identite_type` | TEXT | OUI | null | - |
| `document_identite_url` | TEXT | OUI | null | - |
| `document_identite_nom_fichier` | TEXT | OUI | null | - |
| `signature_client` | TEXT | OUI | null | Base64 signature |
| `photos_livraison` | JSONB | OUI | null | Array d'URLs |
| `notes_internes` | TEXT | OUI | null | - |
| `notes_admin` | TEXT | OUI | null | - |
| `raison_annulation` | TEXT | OUI | null | - |
| `assignation_manuelle` | BOOLEAN | OUI | null | - |
| `token_livraison` | VARCHAR(64) | OUI | null | Token formulaire livraison (unique index partiel) |
| `nb_velos_livres` | INTEGER | OUI | null | - |
| `tournee_id` | UUID | OUI | null | FK -> tournees(id) |
| `confirmation_statut` | VARCHAR(20) | OUI | null | null / en_attente / confirmee / refusee |
| `confirmation_commentaire` | TEXT | OUI | null | - |
| `confirmation_date` | TIMESTAMPTZ | OUI | null | - |
| `pdf_livraison_url` | TEXT | OUI | null | PDF genere |
| `attestation_pdf_url` | TEXT | OUI | null | Bon de livraison PDF |
| `created_at` | TIMESTAMPTZ | NON | NOW() | - |
| `updated_at` | TIMESTAMPTZ | NON | NOW() | - |

**Index :**
- `livraisons_token_idx` UNIQUE ON (token_livraison) WHERE NOT NULL
- `idx_livraisons_tournee_id` ON (tournee_id)
- `idx_livraisons_confirmation_statut` ON (confirmation_statut)

**RLS :** Enabled. Policies agent_secteur (ajoutees 2026-03-11) :
- Condition : `depot_retrait_id = ANY(depot_ids) OR depot_logistique_id = ANY(depot_ids)` en plus de `departement = territoire`
- Applique sur PPE (zfpzhhdovxllchlsihcr) et Ecovolt (irpnllwlxivlylclfjwd)

---

#### 3.2.4 `users_profile` (16 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | - | PK (= auth.users.id) |
| `email` | TEXT | NON | - | - |
| `nom` | TEXT | OUI | null | - |
| `prenom` | TEXT | OUI | null | - |
| `role` | TEXT | NON | - | super_admin / admin / agent_secteur / livreur / client |
| `is_super_admin` | BOOLEAN | NON | false | Flag securite (unique index: 1 seul true) |
| `actif` | BOOLEAN | OUI | null | - |
| `telephone` | TEXT | OUI | null | - |
| `territoire` | TEXT | OUI | null | Code departement |
| `departement` | VARCHAR(10) | OUI | null | Pour agent_secteur |
| `depot_id` | UUID | OUI | null | Legacy single depot |
| `depot_ids` | UUID[] | OUI | '{}' | Multi-depot array |
| `preferences` | JSONB | OUI | null | - |
| `est_aussi_livreur` | BOOLEAN | OUI | false | Agent secteur qui livre aussi |
| `created_at` | TIMESTAMPTZ | OUI | NOW() | - |
| `updated_at` | TIMESTAMPTZ | OUI | NOW() | - |

**Index :**
- `users_profile_unique_super_admin` UNIQUE ON (is_super_admin) WHERE is_super_admin = true

---

#### 3.2.5 `tournees` (9 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `date` | DATE | NON | - | - |
| `livreur_id` | UUID | OUI | null | FK -> users_profile(id) |
| `depot_id` | UUID | OUI | null | FK -> depots(id) |
| `creneau_debut` | VARCHAR(5) | OUI | null | ex: "09:00" |
| `creneau_fin` | VARCHAR(5) | OUI | null | ex: "12:00" |
| `notes` | TEXT | OUI | null | - |
| `created_by` | UUID | OUI | null | FK -> users_profile(id) |
| `created_at` | TIMESTAMPTZ | NON | NOW() | - |

**RLS :** Enabled.
- `tournees_admin` : ALL TO authenticated USING role IN ('super_admin', 'admin')
- `tournees_read_agent_livreur` : SELECT TO authenticated USING role IN ('agent_secteur', 'livreur')

**Index :** `idx_tournees_date` ON (date)

---

#### 3.2.6 `livreur_agents` (table liaison M2M — 3 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `livreur_id` | UUID | NON | - | FK -> users_profile(id) ON DELETE CASCADE, PK part |
| `agent_id` | UUID | NON | - | FK -> users_profile(id) ON DELETE CASCADE, PK part |
| `created_at` | TIMESTAMPTZ | NON | NOW() | - |

**PK :** (livreur_id, agent_id) composite
**Index :** `livreur_agents_agent_id_idx` ON (agent_id)
**RLS :** `livreur_agents_read_auth` : SELECT USING (auth.uid() = livreur_id OR auth.uid() = agent_id)

---

#### 3.2.7 `naf_codes` (6 colonnes — 377 enregistrements)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | SERIAL | NON | auto-increment | PK |
| `code` | VARCHAR(10) | NON | - | UNIQUE |
| `label` | TEXT | NON | - | - |
| `valide` | BOOLEAN | NON | false | Eligibilite ENEMAT |
| `created_at` | TIMESTAMPTZ | NON | NOW() | - |
| `updated_at` | TIMESTAMPTZ | NON | NOW() | - |

**RLS :** `naf_codes_read` SELECT TO authenticated, `naf_codes_admin_write` ALL USING role IN ('super_admin', 'admin')

---

#### 3.2.8 `monday_field_mapping` (14 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `interface_field` | TEXT | NON | - | Champ Supabase (unique composite avec board_id) |
| `interface_label` | TEXT | NON | - | Label affiche |
| `interface_type` | TEXT | NON | 'text' | - |
| `interface_section` | TEXT | NON | 'other' | - |
| `monday_column_id` | TEXT | OUI | null | ID colonne Monday |
| `monday_column_title` | TEXT | OUI | null | - |
| `monday_column_type` | TEXT | OUI | null | - |
| `board_id` | TEXT | OUI | null | NULL = single-board (Ecovolt), non-NULL = multi-board (PPE) |
| `value_mapping` | JSONB | OUI | '{}' | Ex: { "controle_valide": "CONTROLE VALIDE" } |
| `is_synced` | BOOLEAN | OUI | false | - |
| `is_required` | BOOLEAN | OUI | false | - |
| `created_at` | TIMESTAMPTZ | OUI | NOW() | - |
| `updated_at` | TIMESTAMPTZ | OUI | NOW() | - |

**Index :**
- `idx_monday_field_mapping_field_board` UNIQUE ON (interface_field, COALESCE(board_id, '__null__'))
- `idx_monday_field_mapping_monday_column_id` ON (monday_column_id) WHERE NOT NULL
- `idx_monday_field_mapping_is_synced` ON (is_synced) WHERE true
- `idx_monday_field_mapping_board_id` ON (board_id) WHERE NOT NULL

**RLS :** CORRIGE (2026-03-11) -- policies mises a jour pour utiliser 'super_admin'/'admin' (sur PPE + Ecovolt).

---

#### 3.2.9 `monday_boards` (9 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `board_id` | TEXT | NON | - | UNIQUE |
| `board_name` | TEXT | NON | - | - |
| `commercial_name` | TEXT | OUI | null | - |
| `is_active` | BOOLEAN | OUI | true | - |
| `items_count` | INTEGER | OUI | 0 | - |
| `last_synced_at` | TIMESTAMPTZ | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | NOW() | - |
| `updated_at` | TIMESTAMPTZ | OUI | NOW() | - |

**RLS :** CORRIGE (2026-03-11) -- policies mises a jour pour utiliser 'super_admin'/'admin' (sur PPE + Ecovolt).

---

#### 3.2.10 `fnuci` (PPE uniquement — gere via Supabase direct, pas dans database.ts)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `numero` | TEXT | NON | - | - |
| `reference` | TEXT | NON | - | Min 6 chars |
| `detenteur` | TEXT | OUI | null | - |
| `client_id` | UUID | OUI | null | FK -> clients(id) |
| `livraison_id` | UUID | OUI | null | FK -> livraisons(id) |
| `statut` | TEXT | NON | 'disponible' | disponible / distribue / attribue / bloque |
| `attribue_at` | TIMESTAMPTZ | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | NOW() | - |

---

#### 3.2.11 `audit_log` (8 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `action` | TEXT | NON | - | - |
| `entity_type` | TEXT | NON | - | - |
| `entity_id` | TEXT | OUI | null | - |
| `user_id` | UUID | OUI | null | FK -> users_profile(id) |
| `details` | JSONB | OUI | null | - |
| `ip_address` | TEXT | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | null | - |

**FK :** `audit_log_user_id_fkey` -> users_profile(id)

---

#### 3.2.12 `email_alerts` (8 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `client_id` | UUID | OUI | null | - |
| `type` | TEXT | NON | - | client_hors_zone / enemat_bloque / formulaire_expire / livraison_echec |
| `message` | TEXT | NON | - | - |
| `envoye` | BOOLEAN | OUI | null | - |
| `date_envoi` | TIMESTAMPTZ | OUI | null | - |
| `details` | JSONB | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | null | - |

---

#### 3.2.13 `formulaires_log` (6 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `client_id` | UUID | OUI | null | - |
| `etape_numero` | INTEGER | NON | - | - |
| `etape_nom` | TEXT | NON | - | - |
| `donnees_saisies` | JSONB | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | null | - |

---

#### 3.2.14 `sync_monday_log` (10 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `action` | TEXT | NON | - | - |
| `direction` | TEXT | NON | - | - |
| `statut` | TEXT | NON | - | - |
| `client_id` | UUID | OUI | null | - |
| `monday_item_id` | BIGINT | OUI | null | - |
| `donnees_avant` | JSONB | OUI | null | - |
| `donnees_apres` | JSONB | OUI | null | - |
| `message_erreur` | TEXT | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | null | - |

---

#### 3.2.15 `workflow_transitions` (9 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `entity_type` | TEXT | NON | - | - |
| `entity_id` | TEXT | NON | - | - |
| `statut_avant` | TEXT | OUI | null | - |
| `statut_apres` | TEXT | NON | - | - |
| `user_id` | UUID | OUI | null | - |
| `effectue_par` | TEXT | OUI | null | - |
| `raison` | TEXT | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | null | - |

---

#### 3.2.16 `user_societes` (table de liaison — 5 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `user_id` | UUID | OUI | null | - |
| `client_id` | UUID | OUI | null | - |
| `is_primary` | BOOLEAN | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | null | - |

---

#### 3.2.17 `distances_cache` (5 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `client_id` | UUID | OUI | null | - |
| `depot_id` | UUID | OUI | null | - |
| `distance_km` | FLOAT | NON | - | - |
| `calculated_at` | TIMESTAMPTZ | OUI | null | - |

---

#### 3.2.18 `clients_hors_zone` (8 colonnes)

| Colonne | Type | Nullable | Default | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID | NON | gen_random_uuid() | PK |
| `client_id` | UUID | OUI | null | - |
| `depot_plus_proche_id` | UUID | OUI | null | - |
| `distance_depot_plus_proche_km` | FLOAT | OUI | null | - |
| `statut` | TEXT | OUI | null | - |
| `resolu_par` | TEXT | OUI | null | - |
| `date_resolution` | TIMESTAMPTZ | OUI | null | - |
| `created_at` | TIMESTAMPTZ | OUI | null | - |

---

### 3.3 Relations (Foreign Keys)

| FK Name | Table source | Colonne | Table cible | Colonne cible | ON DELETE |
|---------|-------------|---------|-------------|---------------|-----------|
| `audit_log_user_id_fkey` | audit_log | user_id | users_profile | id | (default) |
| (implicite) | clients | depot_retrait_id | depots | id | SET NULL |
| (implicite) | clients | depot_logistique_id | depots | id | SET NULL |
| (implicite) | tournees | livreur_id | users_profile | id | (default) |
| (implicite) | tournees | depot_id | depots | id | (default) |
| (implicite) | tournees | created_by | users_profile | id | (default) |
| (implicite) | livraisons | tournee_id | tournees | id | (default) |
| (FK declaree) | livreur_agents | livreur_id | users_profile | id | CASCADE |
| (FK declaree) | livreur_agents | agent_id | users_profile | id | CASCADE |

**Relations implicites (pas de FK declaree mais liees dans le code) :**
- `livraisons.client_id` -> `clients.id`
- `livraisons.depot_id` -> `depots.id`
- `livraisons.livreur_id` -> `users_profile.id`
- `clients_hors_zone.client_id` -> `clients.id`
- `distances_cache.client_id` -> `clients.id`
- `distances_cache.depot_id` -> `depots.id`
- `fnuci.client_id` -> `clients.id`
- `fnuci.livraison_id` -> `livraisons.id`

### 3.4 Storage

Un bucket `documents` (public) cree par la migration `20260310_attestation_pdf_url.sql`.
Un bucket `client-documents` utilise par la route `/api/documents/upload`.

### 3.5 Migrations (21 fichiers, ordre chronologique)

| # | Fichier | Description |
|---|---------|-------------|
| 1 | `20260114_add_depot_columns.sql` | Ajoute depot_retrait_id + depot_logistique_id sur clients (FK depots) |
| 2 | `20260115_add_code_validation.sql` | Ajoute code_validation_hash + code_validation_envoye_at sur clients |
| 3 | `20260115_add_code_enemat_saisi_to_clients.sql` | Ajoute code_enemat_saisi sur clients |
| 4 | `20260122_add_perimetre_livraison_payant.sql` | Ajoute rayon_livraison_payant_km sur depots |
| 5 | `20260122_add_prix_livraison_payante.sql` | Ajoute prix_livraison_payante sur depots |
| 6 | `20260123_make_siret_tolerant.sql` | SIRET: VARCHAR(14) -> TEXT, supprime contrainte unique |
| 7 | `20260123_fix_rls_infinite_recursion.sql` | Supprime anciennes RLS clients, recree policies permissives |
| 8 | `20260123_create_monday_field_mapping.sql` | Cree table monday_field_mapping + RLS admin |
| 9 | `20260208_add_type_livraison_mapping.sql` | Insert mapping type_livraison |
| 10 | `20260209_fix_type_livraison_value_mapping.sql` | Corrige valeurs mapping (MAJUSCULES pour Monday) |
| 11 | `20260217_add_multi_board_support.sql` | Ajoute board_id + cree monday_boards |
| 12 | `20260306_add_depot_ids_array.sql` | Ajoute depot_ids uuid[] sur users_profile |
| 13 | `20260307_user_roles_overhaul.sql` | Refonte roles, is_super_admin, livreur_agents, departement |
| 14 | `20260308_process_client_schema.sql` | reference_retina, naf_codes, creneaux depots, token_livraison |
| 15 | `20260308_delivery_tournees.sql` | Cree tournees, confirmation_*, nb_velos_livres |
| 16 | `20260308_client_documents.sql` | Colonnes documents clients, pdf_livraison_url |
| 17 | `20260310_agent_aussi_livreur.sql` | est_aussi_livreur boolean sur users_profile |
| 18 | `20260310_heure_precise.sql` | heure_precise TEXT sur livraisons |
| 19 | `20260310_attestation_pdf_url.sql` | attestation_pdf_url + bucket storage documents |
| 20 | `20260311_naf_codes_complete.sql` | Restructure naf_codes, insere 377 codes NAF |
| 21 | `20260311_fix_agent_rls_depot_ids.sql` | RLS livraisons : ajout condition `depot_retrait_id = ANY(depot_ids) OR depot_logistique_id = ANY(depot_ids)` pour agent_secteur (PPE + Ecovolt) |

---

## 4. API Routes (72 routes)

### 4.1 Admin

#### 4.1.1 Admin / Clients (10 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 1 | `GET /api/admin/clients` | GET | Auth manuelle (role != client) | Liste clients avec filtre depot_ids (agent_secteur) |
| 2 | `GET /api/admin/clients/[id]` | GET | Auth manuelle (role != client) | Fiche client + livraisons + depots + distance + code NAF |
| 3 | `PUT /api/admin/clients/[id]` | PUT | super_admin, admin, agent_secteur | Modifier client (30+ champs) + sync Monday |
| 4 | `DELETE /api/admin/clients/[id]` | DELETE | super_admin uniquement | Suppression cascade (10 tables) |
| 5 | `POST /api/admin/clients/[id]/sync-monday` | POST | super_admin, admin | Sync forcee vers Monday |
| 6 | `POST /api/admin/clients/bulk` | POST | super_admin, admin, agent_secteur | Actions bulk (send_form, change_status) |
| 7 | `POST /api/admin/clients/resend-code` | POST | super_admin, admin, agent_secteur | Renvoyer code validation ENEMAT |
| 8 | `POST /api/admin/clients/reset-formulaire` | POST | super_admin, admin, agent_secteur | Reinitialiser formulaire + livraisons |
| 9 | `POST /api/admin/clients/send-formulaire` | POST | requireRole | Envoyer formulaire (garde NAF + statut) |
| 10 | `POST /api/admin/clients/send-formulaire-livraison` | POST | requireRole | Envoyer formulaire livraison |

**Details supplementaires :**

**GET /api/admin/clients** :
- Tables : clients, users_profile
- Filtrage role : agent_secteur filtre par `depot_ids` (via `depot_retrait_id` / `depot_logistique_id` des clients). Admin avec `territoire='FR'` = acces total (guard `!== 'FR'`)
- Pagination : NON
- Tri : created_at DESC

**GET /api/admin/clients/[id]** :
- Retour : { client, livraisons[], depotRetrait, depotLogistique, distanceKm }
- Tables : clients, users_profile, livraisons, depots, distances_cache
- 4 requetes separees
- Filtrage agent_secteur : verifie que le client appartient a un depot du `depot_ids` de l'agent (via `depot_retrait_id` ou `depot_logistique_id`)

**PUT /api/admin/clients/[id]** :
- Params : 30+ champs modifiables (raison_sociale, siret, email, telephone, adresse, code_ape, velo_devis, statut_commercial, validation_naf, notes_internes, preferences_livraison, etc.)
- Side effects : Sync bidirectionnelle Monday (getChangedFields + syncClientToMonday), log sync_monday_log

**DELETE /api/admin/clients/[id]** :
- Cascade manuelle sur 10 tables : clients, livraisons, distances_cache, clients_hors_zone, email_alerts, formulaires_log, workflow_transitions, user_societes, sync_monday_log, audit_log

**POST /api/admin/clients/bulk** :
- Actions : send_form (garde NAF OUI, geocode, assign depot, email, sync Monday, met `statut_commercial: 'formulaire_envoye'`) / change_status (10 statuts valides)
- Filtrage agent_secteur : filtre par `depot_ids` (via `depot_retrait_id` / `depot_logistique_id`)

**POST /api/admin/clients/resend-code** :
- Side effects : Regenere code, reset tentatives ENEMAT, email, sync Monday (statut=code_envoye)

**POST /api/admin/clients/reset-formulaire** :
- Gardes : NAF OUI requis
- Side effects : Reset complet (code, token, depot, signature), supprime livraisons, envoie code + lien formulaire

**POST /api/admin/clients/send-formulaire** :
- Gardes : NAF OUI + statut_commercial = controle_valide
- Side effects : Genere code+token, email code + formulaire (2s delay), sync Monday

**POST /api/admin/clients/send-formulaire-livraison** :
- Gardes : statut=a_livrer, livraison existe, creneau pas encore choisi
- Side effects : Token 64 hex, stocke dans livraisons.token_livraison, email, met `statut_commercial: 'en_livraison'`

---

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 11 | `POST /api/admin/clients/send-relance` | POST | requireRole | Email de relance |
| 12 | `POST /api/admin/clients/request-documents` | POST | requireRole | Demande pieces (urssaf/dsn/benevoles) |

**POST /api/admin/clients/send-relance** :
- Side effects : Email avec lien /relance?token=xxx

**POST /api/admin/clients/request-documents** :
- Params : { clientId, documents: ('urssaf'|'dsn'|'benevoles')[] }
- Side effects : Token 32 bytes, merge documents_demandes JSONB, email avec lien

---

#### 4.1.2 Admin / Depots (4 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 13 | `GET /api/admin/depots` | GET | requireRole (tous admin) | Liste depots actifs |
| 14 | `POST /api/admin/depots/reassign-clients` | POST | super_admin, admin | Reassignation auto clients -> depots |
| 15 | `POST /api/admin/depots/simulate` | POST | super_admin, admin | Simuler impact nouveau depot |
| 16 | `GET /api/admin/depots/stats` | GET | super_admin, admin, agent_secteur | Stats couverture depots |

---

#### 4.1.3 Admin / Users (4 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 17 | `DELETE/PATCH/PUT /api/admin/users/[id]` | DELETE, PATCH, PUT | requireRole + hierarchie | CRUD utilisateur + reset password |
| 18 | `POST /api/admin/users/[id]/impersonate` | POST | super_admin uniquement | Magic link impersonation |
| 19 | `POST /api/admin/users/create` | POST | requireRole + creatableRoles | Creer utilisateur + invitation email |
| 20 | `GET /api/admin/users/agents` | GET | requireRole | Liste agents secteur |

---

#### 4.1.4 Admin / Livraisons (8 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 21 | `GET /api/admin/livraisons` | GET | requireRole (tous admin) | Liste livraisons (limit 200). agent_secteur filtre par depot_ids (via join client depot_retrait_id/depot_logistique_id), livreur filtre par livreur_id |
| 22 | `GET/PATCH /api/admin/livraisons/[id]` | GET, PATCH | requireRole | Detail / modifier livraison. 403 si livreur/agent tente d'acceder a une livraison d'un autre. PATCH sync `clients.statut_commercial` via LIVRAISON_TO_CLIENT_STATUT |
| 23 | `PATCH /api/admin/livraisons/[id]/status` | PATCH | requireRole (tous admin) | Changement statut avec machine a etats. Verification acces livreur/agent |
| 24 | `POST /api/admin/livraisons/[id]/deliver` | POST | requireRole | Livraison complete (FNUCI, signature, photos, PDF). Verification assignation livreur |
| 25 | `POST /api/admin/livraisons/[id]/send-bon` | POST | requireRole | Envoyer bon de livraison par email |
| 26 | `POST /api/admin/livraisons/send-mail-livraison` | POST | requireRole | Email notification livraison + met `statut_commercial: 'en_livraison'` |
| 27 | `POST /api/admin/livraisons/send-mail-planning` | POST | requireRole | Batch email planning |
| 28 | `POST /api/admin/livraisons/send-confirmation-creneau` | POST | requireRole | Email confirmation creneau |

**Transitions statut livraison :**
- en_attente -> {programmee, en_cours, annulee}
- programmee -> {en_cours, annulee}
- en_cours -> {livree, probleme, annulee}
- probleme -> {en_cours, annulee}

**Cascade statut client (LIVRAISON_TO_CLIENT_STATUT) :**
- en_attente -> a_livrer
- programmee -> en_livraison
- en_cours -> en_livraison
- livree -> livre
- probleme -> probleme_livraison
- annulee -> a_relivrer

**Sync declencheurs supplementaires :**
- `POST /api/admin/tournees` : creation tournee → clients associes passent en `statut_commercial: 'en_livraison'`
- `POST /api/tournee/confirm` (refus) : client passe en `statut_commercial: 'a_relivrer'`
- `POST /api/admin/clients/send-formulaire-livraison` : client passe en `statut_commercial: 'en_livraison'`
- `POST /api/admin/livraisons/send-mail-livraison` : client passe en `statut_commercial: 'en_livraison'`
- `POST /api/admin/clients/bulk` (send_form) : clients passent en `statut_commercial: 'formulaire_envoye'`

---

#### 4.1.5 Admin / Planning (2 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 29 | `GET /api/admin/planning` | GET | requireRole | Planning depot par semaine |
| 30 | `POST /api/admin/planning/anomalies` | POST | super_admin, admin | Detection anomalies (>10 jours ouvres sans creneau) |

---

#### 4.1.6 Admin / Tournees (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 31 | `GET/POST /api/admin/tournees` | GET, POST | GET: super_admin, admin, agent_secteur, livreur (lecture seule). POST: super_admin, admin | CRUD tournees + assignation livraisons. POST sync `statut_commercial: 'en_livraison'` sur clients associes |

---

#### 4.1.7 Admin / FNUCI (2 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 32 | `GET/PATCH /api/admin/fnuci` | GET, PATCH | requireRole | Liste FNUCI (sortBy, sortOrder, pagination, client join) + toggle statut |
| 33 | `POST /api/admin/fnuci/validate` | POST | requireRole | Valider reference FNUCI |

---

#### 4.1.8 Admin / NAF (2 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 34 | `GET /api/admin/naf` | GET | requireRole | Liste codes NAF avec pagination + sortBy/sortOrder |
| 35 | `PATCH /api/admin/naf/[code]` | PATCH | super_admin, admin | Toggle validite NAF + bulk update clients |

---

#### 4.1.9 Admin / Map (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 36 | `GET /api/admin/map/data` | GET | Auth manuelle | Depots + clients pour carte Google Maps. Filtrage agent_secteur par `depot_ids` (via `depot_retrait_id` / `depot_logistique_id`) |

---

#### 4.1.10 Admin / Geocoding (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 37 | `GET/POST /api/admin/geocoding/batch` | GET, POST | super_admin, admin | Stats + geocodage batch (api-adresse.data.gouv.fr) |

---

### 4.2 Public / Auth

#### 4.2.1 Clients (6 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 38 | `GET /api/clients` | GET | requireRole | Liste clients paginee (7 filtres, 12 tris). Filtre depot verifie `depot_retrait_id` ET `depot_logistique_id` |
| 39 | `GET /api/clients/stats` | GET | super_admin, admin, agent_secteur | Stats globales clients |
| 40 | `GET /api/clients/commercials` | GET | super_admin, admin, agent_secteur | Liste emails commerciaux |
| 41 | `GET /api/clients/statuses` | GET | **AUCUN** | Liste statuts distincts |
| 42 | `GET /api/clients/departements` | GET | **AUCUN** | Liste departements avec labels |
| 43 | `POST /api/clients/send-form` | POST | super_admin, admin, agent_secteur | Legacy : envoyer formulaire |

---

#### 4.2.2 Depots (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 44 | `GET /api/depots` | GET | **AUCUN** | Liste depots actifs (donnees peu sensibles) |

---

#### 4.2.3 Alerts (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 45 | `GET/POST /api/alerts` | GET, POST | super_admin, admin | CRUD alertes email |

---

#### 4.2.4 Auth (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 46 | `POST /api/auth/login` | POST | Public | Login Supabase + redirect selon role |

---

#### 4.2.5 Address (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 47 | `GET /api/address/search` | GET | Public | Autocomplete adresse (api-adresse.data.gouv.fr) |

---

#### 4.2.6 Formulaire (6 routes, token-based)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 48 | `POST /api/formulaire/validate-token` | POST | Public (token) | Valider token formulaire |
| 49 | `POST /api/formulaire/validate-enemat` | POST | Public (token) | Valider code ENEMAT (3 tentatives max) |
| 50 | `POST /api/formulaire/submit` | POST | Public (token) | Soumettre formulaire (statut -> formulaire_valide) |
| 51 | `POST /api/formulaire/save-address` | POST | Public (token) | Sauvegarder adresse + geocoder + classifier zone |
| 52 | `POST /api/formulaire/resend-code` | POST | Public (token) | Renvoyer code ENEMAT (cooldown 2 min) |
| 53 | `POST /api/formulaire/client-address` | POST | Public (token) | Charger adresse client + depots |

---

#### 4.2.7 Formulaire-Livraison (2 routes, token-based)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 54 | `GET /api/formulaire-livraison/validate-token` | GET | Public (token) | Valider token livraison |
| 55 | `POST /api/formulaire-livraison/submit` | POST | Public (token) | Soumettre choix creneau |

---

#### 4.2.8 Livraisons (4 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 56 | `GET /api/livraisons` | GET | requireRole (tous admin) | Liste livraisons paginee (6 filtres). agent_secteur filtre par `depot_ids` via inner join `{ referencedTable: 'client' }` (evite limite URL avec trop d'IDs) |
| 57 | `GET /api/livraisons/confirm-creneau` | GET | Public (token) | Confirmer creneau livraison |
| 58 | `GET /api/livraisons/cancel-creneau` | GET | Public (token) | Annuler creneau (client -> anomalie) |
| 59 | `GET /api/livraisons/info-creneau` | GET | Public (token) | Infos creneau livraison |

---

#### 4.2.9 Relance (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 60 | `POST/PUT /api/relance` | POST, PUT | Public (token) | Valider token + soumettre disponibilites |

---

#### 4.2.10 Tournee (1 route)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 61 | `GET/POST /api/tournee/confirm` | GET, POST | Public (token) | Confirmer/refuser tournee. Refus → `statut_commercial: 'a_relivrer'` |

---

#### 4.2.11 Documents (2 routes)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 62 | `POST /api/documents/validate-token` | POST | Public (token) | Valider token documents |
| 63 | `POST /api/documents/upload` | POST | Public (token) | Upload document (FormData, max 10Mo) |

---

### 4.3 Monday (maintenance)

| # | Route | Methodes | Roles | Description |
|---|-------|----------|-------|-------------|
| 64 | `GET /api/monday/clients` | GET | - | **DESACTIVE (410)** |
| 65 | `GET/PUT /api/monday/clients/[id]` | GET, PUT | - | **DESACTIVE (410)** |
| 66 | `GET /api/monday/clients/stats` | GET | - | **DESACTIVE (410)** |
| 67 | `GET /api/monday/statuts` | GET | - | **DESACTIVE (410)** |
| 68 | `GET/POST /api/monday/sync-ids` | GET, POST | - | **DESACTIVE (410)** |
| 69 | `POST /api/monday/columns` | POST | super_admin, admin | Creer colonne Monday |
| 70 | `GET /api/monday/schema` | GET | super_admin, admin | Schema board Monday (cache 5 min) |
| 71 | `POST /api/monday/create-column` | POST | super_admin, admin | Creer colonne Monday (doublon #69) |
| 72 | `GET/POST/DELETE /api/monday/mapping` | GET, POST, DELETE | super_admin, admin | CRUD mappings champs |
| 73 | `GET/POST /api/monday/mapping/init` | GET, POST | super_admin, admin | Initialiser mappings depuis config |
| 74 | `GET/POST/DELETE /api/monday/webhooks` | GET, POST, DELETE | **AUCUN** | CRUD webhooks Monday |
| 75 | `GET/POST /api/webhooks/monday` | GET, POST | Public | Challenge handler seulement (desactive) |
| 76 | `GET/POST /api/sync/monday` | GET, POST | **AUCUN** (GET) / **410** (POST) | Stats Supabase / desactive |

---

## 5. Pages (34 pages)

### 5.1 Pages Admin (17 pages)

#### 5.1.1 `/admin/dashboard`

| Critere | Detail |
|---------|--------|
| Type | Grille de navigation (8 cartes menu) |
| API | Aucun (statique) |
| Roles | Selon carte : super_admin pour Utilisateurs/Depots/Parametres |
| Responsive | Grille 2->3->4 colonnes |

---

#### 5.1.2 `/admin/clients`

| Critere | Detail |
|---------|--------|
| API | GET /api/clients, GET /api/clients/commercials, GET /api/clients/departements, GET /api/clients/stats, POST /api/admin/clients/send-formulaire, PUT /api/admin/clients/{id}, DELETE /api/admin/clients/{id}, POST /api/admin/clients/bulk |
| Colonnes | Checkbox, Societe (raison_sociale + siret), Ref. Retina, Email, Tel, Commercial, Dep., Zone, Depot, Velos valides, NAF, Statut, Actions |
| Filtres | Search (debounce 600ms), Statut, NAF (valide/bloque/en_attente), Departement, Zone, Commercial, Depot, Page size (20/50/100/250/500) |
| Actions | Envoyer formulaire, Voir fiche, Generer lien, Modifier (dialog), Supprimer (confirm), Bulk (formulaire uniquement — bouton "Changer statut" en masse supprime, tous les statuts changent via process) |
| Tri | updated_at (defaut desc), raison_sociale, siret, departement, velo_valide, statut_commercial, validation_naf |
| Pagination | OUI cote serveur (20/50/100/250/500) |
| Roles | super_admin, admin, agent_secteur |
| Responsive | Colonnes masquees progressivement < lg et < md |

---

#### 5.1.3 `/admin/clients/[id]`

| Critere | Detail |
|---------|--------|
| API | GET /api/admin/clients/{id}, POST send-formulaire, POST reset-formulaire, POST send-formulaire-livraison, POST send-relance, POST request-documents, PATCH /api/admin/clients/{id}, Supabase direct: fnuci (PPE only), users_profile |
| Sections | Identite (+ code NAF sous SIRET), Contact, Adresse, Statut commercial, Statut process, Validation NAF, Zone, Depot, Velos, FNUCI (PPE only), Preferences livraison (inline edit), Complement adresse (inline edit), Historique livraisons, Mini-carte |
| Actions | Envoyer formulaire, Reinitialiser formulaire, Mail livraison, Formulaire retrait, Relance, Demander documents, Edit preferences/complement (inline) |
| Roles | super_admin, admin, agent_secteur |

---

#### 5.1.4 `/admin/livraisons`

| Critere | Detail |
|---------|--------|
| API | GET /api/livraisons, GET /api/depots, GET /api/clients/commercials, GET /api/clients/departements, POST send-formulaire-livraison, POST send-mail-livraison, POST send-mail-planning |
| Colonnes | Checkbox, Societe + siret, Ref. Retina, Email, Tel, Commercial, Dep., Zone, Depot, Mode, CP + Ville (simplifie), Velos, Date prevue, Statut + confirmation, Actions |
| Filtres | Search (debounce 300ms), Statut (multi-select), Depot (multi-select), Commercial (multi-select), Departement (multi-select), Zone (multi-select), PageSize (20/50/100/200) |
| Actions | Programmer, Module livraison, Voir fiche. Bulk : formulaire retrait, mail livraison, mail planning |
| Tri | created_at (defaut desc), mode_livraison, creneau_date, statut |
| Pagination | OUI cote serveur (20/50/100/200) |
| Roles | super_admin, admin, agent_secteur, livreur |

---

#### 5.1.5 `/admin/livraisons/[id]`

| Critere | Detail |
|---------|--------|
| API | Supabase direct : livraisons (avec client + depot join), users_profile |
| Actions | Programmer (dialog date/creneau/livreur/notes), Marquer livree, Annuler |
| Roles | super_admin, admin, agent_secteur, livreur |

---

#### 5.1.6 `/admin/livraisons/deliver`

| Critere | Detail |
|---------|--------|
| URL | `/admin/livraisons/deliver?id=LIVRAISON_ID` |
| API | GET /api/admin/livraisons/{id} |
| Type | Module livraison step-by-step plein ecran (identite, FNUCI scan, signature, photos, recap) |
| Roles | Tous les roles admin |
| Responsive | Plein ecran, mobile-first |

---

#### 5.1.7 `/admin/livraisons/livreur`

| Critere | Detail |
|---------|--------|
| API | Supabase direct: livraisons (filtre today/tomorrow, livreur_id/depot_id), PATCH /api/admin/livraisons/{id}/status |
| Type | Vue cards mobile-optimized (heure/nom/adresse/velos/tel/statut) |
| Actions | En route, Livre, Probleme, Appeler |
| Tri | Heure creneau ASC + suggestion nearest-neighbor geographique |
| Roles | livreur (filtre auto), admin/super_admin (voient tout) |
| Responsive | Mobile-first, max-w-lg, boutons touch-friendly |

---

#### 5.1.8 `/admin/depots`

| Critere | Detail |
|---------|--------|
| API | Supabase direct: depots, livraisons (check before delete), POST /api/admin/depots/reassign-clients |
| Colonnes | Nom, Type, Adresse, Departement, Zone gratuite, Zone payante, Prix livraison, Jours, Actif, Actions |
| Filtres | Search, Type, Agence (super_admin only) |
| Actions | Nouveau depot, Modifier, Toggle actif, Supprimer (si pas de livraisons), Reassignation auto |
| Roles | super_admin (CRUD complet), admin (lecture + filtre territoire) |

---

#### 5.1.9 `/admin/map`

| Critere | Detail |
|---------|--------|
| API | Supabase direct: depots, clients (colonnes geo/statut/velos) |
| Type | Google Maps plein ecran avec markers clients + depots + cercles zones |
| Filtres | Agence, Statut commercial, Validation NAF, Board/Commercial, Zone, Depot, Search, Slider rayon simulation |
| Actions | Voir fiche client, Simuler nouveau depot, Creer depot depuis simulation |
| Roles | super_admin, admin, agent_secteur |
| Responsive | Sidebar filtres collapsible sur mobile |

---

#### 5.1.10 `/admin/planning`

| Critere | Detail |
|---------|--------|
| API | Supabase direct: depots, livraisons (avec client join), clients (a_livrer) |
| Type | Vue planning calendrier (depot selector, navigation semaine, grilles creneaux) |
| Filtres | Depot, Semaine, Search clients |
| Actions | Assigner client a creneau, Desassigner, Envoyer mail planning, Voir fiche |
| Roles | super_admin, admin, agent_secteur |

---

#### 5.1.11 `/admin/alertes`

| Critere | Detail |
|---------|--------|
| API | GET /api/alerts, POST /api/alerts |
| Colonnes | Date, Type (badge), Client (lien), Message, Actions |
| Filtres | Tabs : En attente / Envoyees / Archivees |
| Actions | Envoyer alerte, Archiver, Voir fiche client |
| Roles | super_admin, admin |

---

#### 5.1.12 `/admin/sync`

| Critere | Detail |
|---------|--------|
| Type | Page informative statique (lien vers /admin/settings/monday) |
| Roles | super_admin |

---

#### 5.1.13 `/admin/users`

| Critere | Detail |
|---------|--------|
| API | Supabase direct: users_profile, depots. PATCH/POST/DELETE /api/admin/users/*, PUT reset password, POST impersonate |
| Colonnes | Utilisateur, Email, Role (badge), Territoire, Depots, Actif, Actions |
| Filtres | Search (nom/email), Role |
| Actions | Nouvel utilisateur, Modifier, Reset mdp, Impersonate (super_admin only), Supprimer |
| Roles | super_admin (CRUD + impersonate), admin (filtre territoire), agent_secteur (livreur+agent de son dept) |

---

#### 5.1.14 `/admin/settings`

| Critere | Detail |
|---------|--------|
| API | GET /api/sync/monday |
| Type | 2 cards : statut Monday + lien vers mappings |
| Roles | super_admin |

---

#### 5.1.15 `/admin/settings/monday`

| Critere | Detail |
|---------|--------|
| API | GET /api/monday/mapping, GET /api/monday/columns |
| Type | Interface mapping champ-par-champ (sections collapsibles, Supabase <-> Monday) |
| Actions | Mapper un champ |
| Roles | super_admin |

---

#### 5.1.16 `/admin/settings/fnuci` (PPE only)

| Critere | Detail |
|---------|--------|
| API | GET /api/admin/fnuci (sortBy, sortOrder, pagination, client join), PATCH /api/admin/fnuci/{id} |
| Colonnes | Numero, Reference, Detenteur, Client (lien, tri client-side), Ref. Retina (tri client-side), Statut (badge), Date attribution, Actions |
| Filtres | Search, Statut |
| Tri | ArrowUpDown sur toutes les colonnes. Server-side : numero, reference, detenteur, statut, attribue_at. Client-side : Client, Ref. Retina (colonnes join) |
| Pagination | OUI cote serveur (page size 50) |
| Roles | super_admin (PPE only -- guard tenant_id != ecovolt) |

---

#### 5.1.17 `/admin/settings/naf`

| Critere | Detail |
|---------|--------|
| API | GET /api/admin/naf (sortBy, sortOrder), PATCH /api/admin/naf/{code} |
| Colonnes | Code NAF, Label, Valide (badge), Nb clients, Actions |
| Filtres | Search, Valide |
| Tri | ArrowUpDown sur Code, Libelle, Statut, Clients. sortBy/sortOrder query params cote serveur |
| Pagination | OUI cote serveur (page size 100) |
| Roles | super_admin |

---

### 5.2 Pages Auth (7 pages)

| # | URL | Description | Roles |
|---|-----|-------------|-------|
| 25 | `/auth/login` | Login email + password, redirect selon role | Public |
| 26 | `/auth/register` | Redirect immediat vers /auth/login (self-registration desactivee) | Public |
| 27 | `/auth/forgot-password` | Envoi lien reset | Public |
| 28 | `/auth/reset-password` | Nouveau mot de passe (min 8 car) | Public (session Supabase) |
| 29 | `/auth/impersonate` | Auto sign out + OTP verify + redirect | Via super_admin |
| 30 | `/auth/select-societe` | Selection societe (clients multi-societes) | client |
| 31 | `/auth/complete-profile` | Saisie prenom/nom/tel, insert users_profile | Connecte sans profil |

---

### 5.3 Pages Client (2 pages)

| # | URL | Description | Roles |
|---|-----|-------------|-------|
| 32 | `/client/dashboard` | 3 stat cards + 2 boutons actions rapides | client |
| 33 | `/client/livraisons` | Cards livraisons par societe (lecture seule) | client |

---

### 5.4 Formulaires Publics (7 pages)

| # | URL | Description | Acces |
|---|-----|-------------|-------|
| 18 | `/formulaire?token=TOKEN` | Wizard 6 etapes (ENEMAT, infos, adresse, preference, FNUCI, confirmation) | Token URL |
| 19 | `/formulaire-livraison?token=TOKEN` | Choix date + creneau retrait | Token URL |
| 20 | `/relance?token=TOKEN` | Disponibilites + contact | Token URL |
| 21 | `/tournee/confirmation?token=TOKEN` | Confirmer/refuser livraison | Token URL |
| 22 | `/livraisons/confirm-creneau?token=TOKEN` | Confirmer creneau | Token URL |
| 23 | `/livraisons/cancel-creneau/confirme` | Page statique confirmation annulation | Public |
| 24 | `/documents?token=TOKEN` | Upload documents (urssaf/dsn/benevoles, max 10Mo) | Token URL |

---

### 5.5 Page racine

| # | URL | Description |
|---|-----|-------------|
| 34 | `/` | Redirect immediat vers `/auth/login` |

---

### Resume quantitatif pages

| Categorie | Nombre |
|-----------|--------|
| Pages admin (avec tableau) | 7 (clients, livraisons, depots, alertes, users, fnuci, naf) |
| Pages admin (detail/fiche) | 3 (clients/[id], livraisons/[id], livraisons/deliver) |
| Pages admin (planning/carte) | 2 (planning, map) |
| Pages admin (settings/info) | 4 (settings, settings/monday, sync, dashboard) |
| Pages admin (livreur) | 1 (livraisons/livreur) |
| Pages publiques (formulaires) | 7 (formulaire, formulaire-livraison, relance, tournee, confirm-creneau, cancel-creneau, documents) |
| Pages auth | 7 (login, register, forgot-password, reset-password, impersonate, select-societe, complete-profile) |
| Pages client | 2 (dashboard, livraisons) |
| Page racine (redirect) | 1 |
| **TOTAL** | **34 pages** |

| Feature | Pages avec |
|---------|-----------|
| Pagination cote serveur | 4 (clients, livraisons, fnuci, naf) |
| Colonnes triables | 4 (clients, livraisons, fnuci, naf) |
| Selection multiple + bulk | 2 (clients, livraisons — 3 actions bulk sur livraisons : formulaire retrait, mail livraison, mail planning) |
| Multi-select filtres (Popover) | 1 (livraisons) |
| Google Maps | 1 (map) |
| Upload fichiers | 1 (documents) |
| Inline edit | 1 (clients/[id]) |
| Wizard multi-steps | 1 (formulaire — 6 steps) |
| Impersonate | 1 (users) |

---

## 6. Integrations

### 6.1 Monday.com

#### Architecture

| Module | Fichier | Lignes | Description |
|--------|---------|--------|-------------|
| API | `src/lib/monday/api.ts` | 546 | CRUD items Monday, sync bidirectionnelle |
| Config | `src/lib/monday/config.ts` | 389 | Configuration, mappings hardcodes (backup) |
| Dynamic mapping | `src/lib/monday/dynamic-mapping.ts` | 348 | Mappings depuis Supabase (prioritaire) |

#### Fonctions principales

| Fonction | Description |
|----------|-------------|
| `getMondayItems(boardId?)` | Lecture paginee de tous les items (500/page) |
| `getAllBoardsItems()` | Lecture multi-board (200ms delai entre boards) |
| `getMondayItemById(itemId)` | Lecture item par ID |
| `updateMondayItem(itemId, columnValues, boardId?)` | Mutation change_multiple_column_values |
| `syncClientToMonday(client, fieldsToSync?)` | Sync Supabase -> Monday avec mapping dynamique |
| `getChangedFields(oldClient, newClient)` | Compare 2 versions via mapping dynamique |
| `loadMappings(forceRefresh?, boardId?)` | Charge mappings depuis monday_field_mapping (cache 1 min) |
| `convertValueToMonday(field, value, boardId?)` | Conversion valeur Supabase -> Monday |
| `convertValueToSupabase(field, value, boardId?)` | Conversion valeur Monday -> Supabase |
| `initializeMappingsFromConfig(boardId?)` | Seed table depuis config hardcodee |

#### Endpoint API
`https://api.monday.com/v2` (GraphQL)

#### Boards

**PPE Energie (7 boards, compte crm-oreka) :**

| Board | ID |
|-------|----|
| ATHOME | 2144986053 |
| ALEX | 5002798369 |
| DIZIEN | 2146667697 |
| EKL | 2140187165 |
| JM | 2137662048 |
| SALIH | 5013455904 |
| STELLARS | 5001072451 |

**Ecovolt (1 board, compte alexandredelannays-team) :**

| Board | ID |
|-------|----|
| Velos Cargos General | 9990833105 |

#### Mappings de valeurs (champs avec value mapping special)

Champs avec conversion de valeurs entre Supabase et Monday :
- `statut_commercial` (19 statuts)
- `departement` (Reunion/Martinique/etc. <-> codes INSEE)
- `validation_naf` (PPE: identite, Ecovolt: Fait/Bloque/En cours <-> OUI/NON/A VERIFIER)
- `statut_retina` (3 valeurs)
- `statut_mail` (3 valeurs)
- `statut_anomalie` (8 valeurs)
- `statut_doublon` (3 valeurs)
- `type_livraison` (2 valeurs)
- `type_de_zone` (2 valeurs)

#### Double source de mapping

Le mapping hardcode dans `config.ts` sert de backup/seed. En production, c'est le mapping dynamique dans la table `monday_field_mapping` qui prime. Le hardcode est utilise par `initializeMappingsFromConfig()` pour initialiser la table.

---

### 6.2 Email (dual mode SMTP/Gmail OAuth2)

**Fichier :** `src/lib/email/gmail.ts` (~1140 lignes)

**Choix automatique du transport :**
- Si `SMTP_HOST` existe -> SMTP (Microsoft 365, PPE)
- Sinon -> Gmail OAuth2 (Ecovolt)

| Fonction | Description |
|----------|-------------|
| `sendEmail({to, subject, html, from})` | Envoi generique tenant-aware |
| `sendCodeValidationEmail(...)` | Code ENEMAT (4 chiffres) |
| `sendFormulaireLinkEmail(...)` | Lien formulaire avec token |
| `sendFormulaireRecapEmail(...)` | Recapitulatif apres validation |
| `sendUserInvitationEmail(...)` | Invitation admin (identifiants) |
| `sendFormulaireLivraisonEmail(...)` | Formulaire livraison (code ENEMAT) |
| `sendMailLivraisonEmail(...)` | Notification mise en livraison |
| `sendMailPlanningEmail(...)` | Notification planning (creneau) |
| `sendConfirmationCreneauEmail(...)` | Confirmation creneau |
| `sendTourneeConfirmationEmail(...)` | Confirmation tournee |
| `sendBonLivraisonEmail(...)` | Bon de livraison PDF |

**Env vars SMTP :** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`
**Env vars Gmail :** `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

---

### 6.3 Geocodage (api-adresse.data.gouv.fr)

**Fichier :** `src/lib/geo/utils.ts` (392 lignes)

**API :** `https://api-adresse.data.gouv.fr/search/` (gouvernementale, gratuit, sans cle)

**Strategie de geocodage en 3 passes :**
1. Adresse complete (score >= 0.4)
2. Fallback CP + ville (score plafonne a 0.5)
3. Fallback CP seul via `type=municipality` (score plafonne a 0.3)

**Fonctions :**

| Fonction | Description |
|----------|-------------|
| `calculateHaversineDistance(lat1, lon1, lat2, lon2)` | Distance en km entre 2 points GPS |
| `geocodeAddress(adresse, codePostal, ville, minScore?)` | Geocodage 3 passes |
| `buildClientAddress(client)` | Meilleure adresse (livraison > societe > CP) |
| `findNearestDepot(lat, lng, depots)` | Depot le plus proche (Haversine) |
| `classifyClientZone(lat, lng, depots)` | Zone gratuite / payante / hors_zone |
| `getSimpleZoneStatus(client, depots)` | dans_la_zone / hors_zone |

---

### 6.4 Google Maps (affichage carte)

**Fichier :** `src/lib/google-maps.ts` (10 lignes)

**Librairie :** `@react-google-maps/api`

**Env var :** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

**Usage :** Affichage carte uniquement (page `/admin/map`). Le geocodage utilise api-adresse.data.gouv.fr, PAS Google Maps.

---

### 6.5 Auth (5 roles, permissions, hierarchie)

**Fichiers :** `src/lib/auth/` (types.ts, context.tsx, helpers.ts, server.ts, require-role.ts)

#### Roles et hierarchie

| Role | Niveau | Permissions |
|------|--------|-------------|
| `super_admin` | 100 | 8 permissions (tout) |
| `admin` | 80 | 5 permissions |
| `agent_secteur` | 60 | 4 permissions |
| `livreur` | 20 | 4 permissions |
| `client` | 10 | 4 permissions |

#### Routes par defaut apres login

| Role | Route |
|------|-------|
| super_admin | /admin/dashboard |
| admin | /admin/dashboard |
| agent_secteur | /admin/dashboard |
| livreur | /livraisons |
| client | /client/dashboard |

#### Fonctions helpers

| Fonction | Description |
|----------|-------------|
| `hasPermission(user, permission)` | Verification permission (wildcard) |
| `canManageRole(managerRole, targetRole)` | Hierarchie respectee |
| `creatableRoles(creatorRole)` | Roles creables (strictement inferieurs, exclut client) |
| `canAccessTerritory(user, territory)` | super_admin/admin = tout, sinon territoire propre |
| `canAccessDepot(user, depotId)` | super_admin/admin = tout, sinon depot_ids |
| `requireRole(allowedRoles)` | Middleware API : profil ou 401/403 |

#### Table auth
`users_profile` (pas `auth.users`). Le profil est charge apres chaque auth Supabase. Le champ `depot_ids` (array) controle l'acces par depot.

#### Filtrage agent_secteur par depot_ids (refonte 2026-03-11)

**Principe :** Les routes admin filtrent les agents par `depot_ids` (via `depot_retrait_id` et `depot_logistique_id` des clients) au lieu de `territoire`/`departement`. Un admin avec `territoire='FR'` a acces total (guard `!== 'FR'`).

**Routes concernees :**
- `GET /api/admin/clients` — filtre clients par depot_ids
- `GET /api/admin/clients/[id]` — verifie acces depot avant retour
- `GET /api/admin/map/data` — filtre clients carte par depot_ids
- `GET /api/livraisons` — inner join via `{ referencedTable: 'client' }` (evite limite URL)
- `POST /api/admin/clients/bulk` — filtre clients bulk par depot_ids

**Logique commune :**
```
Si role = agent_secteur ET territoire !== 'FR' :
  → filtrer WHERE depot_retrait_id IN (depot_ids) OR depot_logistique_id IN (depot_ids)
Sinon :
  → acces total
```

---

## 7. Variables d'environnement (19 variables)

| Variable | Fichier(s) | Usage |
|----------|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | supabase/client.ts, server.ts, admin.ts | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | supabase/client.ts, server.ts | Cle anonyme |
| `SUPABASE_SERVICE_ROLE_KEY` | supabase/admin.ts | Cle service (bypass RLS) |
| `MONDAY_API_KEY` | monday/config.ts, monday/api.ts | Token API Monday |
| `MONDAY_BOARD_ID` | monday/config.ts | Board unique (Ecovolt: 9990833105) |
| `MONDAY_BOARD_IDS` | monday/config.ts | Multi-boards PPE (virgule-separe) |
| `SMTP_HOST` | email/gmail.ts | Serveur SMTP (mode 1 — PPE) |
| `SMTP_PORT` | email/gmail.ts | Port SMTP (defaut: 587) |
| `SMTP_SECURE` | email/gmail.ts | TLS (true/false) |
| `SMTP_USER` | email/gmail.ts | User SMTP + From |
| `SMTP_PASSWORD` | email/gmail.ts | Mot de passe SMTP |
| `GMAIL_USER` | email/gmail.ts | Adresse Gmail From (Ecovolt) |
| `GMAIL_CLIENT_ID` | email/gmail.ts | OAuth2 client ID |
| `GMAIL_CLIENT_SECRET` | email/gmail.ts | OAuth2 client secret |
| `GMAIL_REFRESH_TOKEN` | email/gmail.ts | OAuth2 refresh token |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | google-maps.ts | Cle API Google Maps |
| `NEXT_PUBLIC_TENANT_ID` | tenants/index.ts | 'ecovolt' ou 'ppe' |
| `NEXT_PUBLIC_APP_URL` | monday/config.ts, email/gmail.ts | URL de base app |
| `VERCEL_URL` | monday/config.ts | URL Vercel (fallback) |

---

## 8. Flux de donnees

### 8.1 Parcours client complet

```
Import Monday.com (manuel ou sync)
    |
    v
Client cree dans Supabase (statut: controle_valide)
    |
    v
Validation NAF (automatique via naf_codes)
    |  NAF = OUI
    v
Envoi formulaire (email code ENEMAT + lien formulaire)
    |  statut: formulaire_envoye
    v
Client remplit formulaire (6 etapes)
    |  1. Code ENEMAT (3 tentatives max)
    |  2. Informations societe (pre-remplies)
    |  3. Adresse livraison (autocomplete + geocodage)
    |  4. Mode reception (retrait/livraison gratuite/payante)
    |  5. FNUCI (PPE only)
    |  6. Confirmation CGV
    |  statut: formulaire_valide
    v
Livraison creee (statut: en_attente, mode: domicile/point_relais)
    |  statut client: a_livrer
    v
Planification (admin assigne depot + creneau)
    |  statut livraison: programmee
    |  statut client: en_livraison
    v
Confirmation client (email token -> confirmer/refuser)
    |
    v
Tournee (regroupement livraisons par livreur/depot/date)
    |  statut livraison: en_cours
    v
Livraison effective (livreur)
    |  FNUCI scan, signature, photos, attestation PDF
    |  statut livraison: livree
    |  statut client: livre
    v
Bon de livraison envoye par email
```

### 8.2 Sync Monday <-> Supabase

```
DIRECTION Supabase -> Monday (active) :
  PUT /api/admin/clients/{id}
    -> getChangedFields(old, new)
    -> syncClientToMonday(client, changedFields)
    -> loadMappings() (table monday_field_mapping, cache 1 min)
    -> convertValueToMonday() pour chaque champ
    -> updateMondayItem() (GraphQL mutation)
    -> log sync_monday_log

DIRECTION Monday -> Supabase (desactivee) :
  POST /api/webhooks/monday (challenge handler seulement)
  Routes /api/monday/clients, /api/monday/sync-ids : 410 Gone
```

### 8.3 Flux email

```
Admin action (envoyer formulaire, relance, planning, etc.)
    |
    v
Choix transport automatique :
    PPE -> SMTP (Microsoft 365, SMTP_HOST)
    Ecovolt -> Gmail OAuth2 (googleapis)
    |
    v
Template HTML tenant-aware (nom, couleur, contact)
    |
    v
Envoi via nodemailer
    |
    v
Emails types :
  - Code validation ENEMAT
  - Lien formulaire
  - Recap formulaire
  - Notification livraison
  - Confirmation creneau
  - Planning
  - Bon de livraison PDF
  - Invitation utilisateur
  - Relance
  - Demande documents
```

---

## 9. Anomalies identifiees

### 9.1 Critique (securite) — routes sans auth

**13 routes corrigees (2026-03-11) :** depots/simulate, depots/stats, geocoding/batch, clients/stats, clients/commercials, clients/send-form, alerts, monday/columns, monday/schema, monday/create-column, monday/mapping, monday/mapping/init, admin/clients/[id]/sync-monday — toutes protegees par requireRole.

**4 routes encore sans auth :**

| # | Route | Risque |
|---|-------|--------|
| 1 | `GET /api/clients/statuses` | Expose statuts (peu sensible) |
| 2 | `GET /api/clients/departements` | Expose departements (peu sensible) |
| 3 | `GET /api/depots` | Donnees peu sensibles (acceptable) |
| 4 | `GET/POST/DELETE /api/monday/webhooks` | Gere webhooks Monday |
| 5 | `GET /api/sync/monday` | Expose stats |

### 9.2 A corriger

#### ~~Types TS desynchronises (database.ts)~~ — RESOLU (2026-03-11)

database.ts synchronise : 3 tables ajoutees (tournees, livreur_agents, monday_boards), 14 colonnes ajoutees, type aliases NafCode/Tournee/LivreurAgent/MondayBoard crees.

#### ~~RLS roles obsoletes~~ — RESOLU (2026-03-11)

Policies sur `monday_field_mapping` et `monday_boards` corrigees : `admin_general`/`admin_regional` remplaces par `super_admin`/`admin`. Applique sur les 2 instances (PPE + Ecovolt).

#### Doublons colonnes clients

La table `clients` a les deux jeux :
- `contact_nom` / `contact_prenom` (convention actuelle)
- `nom_contact` / `prenom_contact` (legacy)

Les deux coexistent. Le code utilise `contact_nom`/`contact_prenom`.

#### FK manquantes sur livraisons

Les colonnes `livraisons.client_id`, `livraisons.depot_id`, `livraisons.livreur_id` n'ont pas de FK declaree dans les migrations (probablement definies dans le schema initial non versionne).

### 9.3 Cosmetique

#### Roles obsoletes dans velo-details.md

Le fichier `memory/velo-details.md` liste 6 roles (admin_general, admin_regional, commercial, gestionnaire, support, livreur) qui sont **tous obsoletes**. Les roles actuels sont : `super_admin`, `admin`, `agent_secteur`, `livreur`, `client`.

#### Route doublon Monday

`POST /api/monday/columns` et `POST /api/monday/create-column` font la meme chose.

---

## Annexe : Schema de dependances entre modules

```
tenants/config.ts  <--  tenants/index.ts  <--+-- email/gmail.ts
                                              +-- tenants/commercial.ts
                                              +-- constants.ts

supabase/admin.ts  <--  monday/dynamic-mapping.ts  <--  monday/api.ts
                                                          |
monday/config.ts  <---------+------------------------------+

supabase/client.ts  <--  auth/context.tsx
supabase/server.ts  <--  auth/server.ts
                     <--  auth/require-role.ts

auth/types.ts  <--+-- auth/helpers.ts
                   +-- auth/context.tsx
                   +-- auth/server.ts

types/database.ts  <--  (utilise partout)

geo/utils.ts  (autonome, aucune dep interne sauf types)
google-maps.ts  (autonome, config uniquement)
formulaire/types.ts  <--  types/database.ts (Depot)
```

---

## Annexe : Constants applicatives

| Constante | Description |
|-----------|-------------|
| `SUPPORT` | Contact support (dynamique selon tenant) |
| `FORM_VALIDATION` | maxEnemtAttempts=3, codeLength=10, tokenValidity=48h |
| `PAGINATION` | defaultPageSize=20, maxPageSize=500 |
| `MONDAY_SYNC` | syncInterval=5min, maxRetries=3, batchSize=100 |
| `USER_ROLES` | 5 roles avec labels francais |
| `TERRITOIRES` | FR + 5 DOM-TOM |
| `DELIVERY_STATUS` | 5 statuts livraison (en_attente, programmee, en_cours, annulee, livree) |
| `FORM_STATUS` | 5 statuts formulaire |
| `PROCESS_STATUTS` | 10 statuts process (parcours client complet) |
| `STATUT_TRANSITIONS` | Machine a etats autorisee |
| `DELIVERY_ZONES` | gratuit / hors_zone |
| `DELIVERY_MODES` | retrait / livraison |

## Annexe : Types TypeScript custom

| Type | Description |
|------|-------------|
| `UserRole` | 'super_admin' / 'admin' / 'agent_secteur' / 'livreur' / 'client' |
| `Agence` | 'reunion' / 'martinique' / 'guadeloupe' / 'guyane' / 'france_metro' |
| `Departement` | '974' / '972' / '971' / '973' / string |
| `StatutFormulaire` | 'en_attente' / 'formulaire_envoye' / 'formulaire_complete' / 'formulaire_bloque' / 'valide' |
| `ProcessStatut` | 10 valeurs (controle_valide -> anomalie) |
| `StatutCommercial` | ProcessStatut + 12 valeurs legacy Monday |
| `StatutLivraison` | 'en_attente' / 'programmee' / 'en_cours' / 'annulee' / 'livree' |
| `ModeLivraison` | 'domicile' / 'point_relais' |
| `TypeDepot` | 'retrait' / 'logistique' |
| `TenantId` | 'ecovolt' / 'ppe' |
| `NafCode` | Row type pour table naf_codes |
| `Tournee` | Row type pour table tournees |
| `LivreurAgent` | Row type pour table livreur_agents |
| `MondayBoard` | Row type pour table monday_boards |
| `TenantConfig` | Configuration complete du tenant |
