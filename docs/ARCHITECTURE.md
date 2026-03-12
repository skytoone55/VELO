# ARCHITECTURE VELO — Source de Verite Unique

> Derniere mise a jour : 2026-03-12
> Ce fichier est la SEULE source de verite du systeme Velo.
> Il DOIT etre mis a jour a chaque modification du code.
> Toute information absente de ce fichier est consideree comme inexistante.

---

## 1. Vue d'ensemble

Multi-tenant CRM for electric cargo bikes. Two entities: PPE Energie (metropolitan France) + Ecovolt (DOM-TOM).
- Framework: Next.js 15.5.12, React 19.2.3, TypeScript
- UI: Radix UI, Tailwind CSS, Lucide React
- Backend: Supabase (2 separate projects)
- Integration: Monday.com API (2 accounts)
- Email: Gmail OAuth2 (nodemailer)
- PDF: jsPDF
- QR: html5-qrcode
- Forms: react-hook-form + zod
- State: zustand (formulaire multi-step)
- Excel: xlsx
- Deploy: Vercel (via GitHub skytoone55/VELO)

### Supabase Projects
| Tenant | Project ID | Region | MCP |
|--------|-----------|--------|-----|
| PPE | zfpzhhdovxllchlsihcr | eu-west-1 | supabase-ppe |
| Ecovolt | irpnllwlxivlylclfjwd | eu-west-3 | supabase-mz |

### Monday.com
- PPE (crm-oreka): 7 boards — ATHOME #2144986053, ALEX #5002798369, DIZIEN #2146667697, EKL #2140187165, JM #2137662048, SALIH #5013455904, STELLARS #5001072451
- Ecovolt (alexandredelannays-team): 1 board — Velos Cargos General #9990833105

---

## 2. Roles et Permissions (RBAC)

5 roles, hierarchy by weight:

| Role | Weight | Scope | Default Route |
|------|--------|-------|---------------|
| super_admin | 100 | All data, all tenants, manage users/depots, Monday sync, impersonate | /admin/dashboard |
| admin | 80 | All data in assigned region, manage users | /admin/dashboard |
| agent_secteur | 60 | Filtered by depot_ids + departement | /admin/clients |
| livreur | 20 | Only own assigned livraisons (livreur_id) | /admin/livraisons |
| client | 10 | Own data only | /client/dashboard |

### Access Control Implementation
- Server-side: `requireRole()` in `/lib/auth/require-role.ts` — checks auth + users_profile role
- Client-side: `useAdminUser()` hook from `admin-user-provider.tsx` — fetches profile from session
- API routes use `createAdminClient()` (bypasses RLS) — NEVER use `createClient()` in API routes (RLS blocks silently)

### Role Permissions (from types.ts)
| Role | Permissions |
|------|------------|
| super_admin | view:all, edit:all, delete:all, manage:users, manage:depots, view:all_territories, sync:monday, export:data |
| admin | view:all, edit:all, manage:users, view:all_territories, export:data |
| agent_secteur | view:territory, edit:clients:territory, manage:livraisons:territory, view:reports:territory |
| livreur | view:livraisons:assigned, edit:livraisons:assigned, upload:photos, collect:signature |
| client | view:own_data, edit:own_profile, submit:form, view:livraisons:own |

### Protected Routes (from types.ts)
| Path | Min Role |
|------|----------|
| /admin | livreur |
| /admin/users | admin |
| /admin/depots | super_admin |
| /admin/settings | super_admin |
| /admin/sync | super_admin |
| /client | client |

### Role Filtering in API Routes
- **agent_secteur**: `query.in('depot_id', user.depot_ids)` — sees only clients/livraisons in their depots
- **livreur**: `query.eq('livreur_id', user.id)` — sees only assigned deliveries
- **admin/super_admin**: No filtering

---

## 3. Database Schema (15 tables)

### Table: clients (main CRM data)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| raison_sociale | text NOT NULL | |
| siret | text NOT NULL | nullable in practice, not unique |
| contact_nom | text | |
| contact_prenom | text | |
| nom_contact | text | legacy alias |
| prenom_contact | text | legacy alias |
| email | text NOT NULL | |
| email_beneficiaire | text | |
| telephone | text | |
| contact_fonction | text | |
| adresse_societe_ligne1 | text NOT NULL | |
| adresse_societe_ligne2 | text | |
| adresse_societe_cp | text NOT NULL | |
| adresse_societe_ville | text NOT NULL | |
| adresse_livraison_ligne1 | text | |
| adresse_livraison_ligne2 | text | |
| adresse_livraison_cp | text | |
| adresse_livraison_ville | text | |
| departement | text NOT NULL | |
| latitude | float | |
| longitude | float | |
| type_de_zone | text | zone_gratuite / hors_zone |
| statut_commercial | text | ProcessStatut enum (see section 8) |
| statut_formulaire | text | |
| statut_mail | text | |
| statut_anomalie | text | |
| statut_doublon | text | |
| statut_make | text | |
| statut_retina | text | |
| velo_valide | int | |
| velo_devis | int NOT NULL | |
| code_ape | text | |
| code_enemat_saisi | text | |
| code_enemat_valide | bool | |
| code_enemat_bloque | bool | |
| code_enemat_tentatives | int | |
| code_validation_hash | text | |
| code_validation_envoye_at | timestamp | |
| depot_retrait_id | uuid FK depots | |
| depot_logistique_id | uuid FK depots | |
| monday_board_id | text | |
| monday_item_id | bigint | |
| monday_sync_status | text | |
| monday_synced_at | timestamp | |
| reference_retina | varchar | unique where not null |
| reference_dossier | text | |
| commercial_assigne | text | |
| validation_naf | text | |
| bypass_formulaire | bool NOT NULL | |
| bypass_formulaire_par | text | |
| bypass_formulaire_at | timestamp | |
| documents_demandes | jsonb | |
| token_documents | text | |
| token_formulaire | text | |
| attestation_urssaf_url | text | |
| attestation_dsn_url | text | |
| declaration_benevoles_url | text | |
| piece_identite_url | text | |
| preferences_livraison | text | |
| fnuci_ids | jsonb | |
| agence | text | |
| equipe_ids | text | |
| format_juridique | text | |
| nb_salaries | int | |
| numero_devis | text | |
| numero_facture | text | |
| devis_pdf_url | text | |
| date_envoi_formulaire | timestamp | |
| date_signature_devis | timestamp | |
| date_validation_code | timestamp | |
| date_visite_prealable | timestamp | |
| date_statut | timestamp | |
| notes_internes | text | |
| created_at | timestamp NOT NULL | |
| updated_at | timestamp NOT NULL | |

### Table: livraisons (delivery tracking)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid FK clients | |
| depot_id | uuid FK depots | |
| livreur_id | uuid FK users_profile | |
| statut | text | a_livrer, programmee, en_livraison, livree, echouee, annulee... |
| mode_livraison | text NOT NULL | retrait / livraison |
| adresse_livraison_ligne1 | text | |
| adresse_livraison_ligne2 | text | |
| adresse_livraison_cp | text | |
| adresse_livraison_ville | text | |
| complement_adresse | text | |
| creneau_date | text | |
| creneau_heure_debut | text | |
| creneau_heure_fin | text | |
| creneau_debut | text | legacy |
| creneau_fin | text | legacy |
| heure_precise | text | |
| date_programmation | timestamp | |
| date_livraison | timestamp | |
| date_livraison_effective | timestamp | |
| date_validation_code | timestamp | |
| tournee_id | uuid FK tournees | |
| signature_client | text | base64 |
| document_identite_url | text | |
| document_identite_type | text | |
| document_identite_nom_fichier | text | |
| photos_livraison | jsonb | |
| nb_velos_livres | int | |
| pdf_livraison_url | text | |
| attestation_pdf_url | text | |
| code_enemat_saisi | text | |
| code_enemat_valide | bool | |
| assignation_manuelle | bool | |
| token_livraison | text | unique where not null |
| confirmation_statut | text | |
| confirmation_commentaire | text | |
| confirmation_date | timestamp | |
| notes_admin | text | |
| notes_internes | text | |
| raison_annulation | text | |
| cq_piece_identite | bool NOT NULL | default false |
| cq_photo_enemat | bool NOT NULL | default false |
| cq_signature_installateur | bool NOT NULL | default false |
| cq_signature_client | bool NOT NULL | default false |
| cq_fnuci | bool NOT NULL | default false |
| cq_velo | bool NOT NULL | default false |
| cq_valide | bool NOT NULL | default false |
| cq_valide_par | uuid | |
| cq_valide_at | timestamp | |
| cq_en_cours | bool NOT NULL | default false |
| cq_commentaire | text | |
| cq_pris_par | uuid | lock owner |
| cq_pris_at | timestamp | lock timestamp |
| created_at | timestamp NOT NULL | |
| updated_at | timestamp NOT NULL | |

### Table: depots (warehouses)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| nom | text NOT NULL | |
| adresse | text NOT NULL | |
| code_postal | text NOT NULL | |
| ville | text NOT NULL | |
| departement | text | |
| agence | text NOT NULL | |
| type | text | retrait / logistique |
| latitude | float NOT NULL | |
| longitude | float NOT NULL | |
| rayon_couverture_km | float NOT NULL | |
| rayon_livraison_payant_km | float | |
| prix_livraison_payante | float | |
| jours_ouverture | text[] | |
| capacite_velos_jour | int | |
| creneau_duree_minutes | int | |
| creneaux | jsonb | |
| email | text | |
| telephone | text | |
| actif | bool | |
| created_at | timestamp | |
| updated_at | timestamp | |

### Table: users_profile (user accounts)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK (FK auth.users) | |
| email | text UNIQUE NOT NULL | |
| nom | text | |
| prenom | text | |
| role | text NOT NULL | super_admin/admin/agent_secteur/livreur/client |
| is_super_admin | bool NOT NULL | unique constraint — only 1 allowed |
| territoire | text | |
| departement | text | |
| depot_id | uuid | legacy single-depot |
| depot_ids | uuid[] | multi-depot assignment |
| est_aussi_livreur | bool | default true for agents |
| telephone | text | |
| preferences | jsonb | |
| actif | bool | |
| created_at | timestamp | |
| updated_at | timestamp | |

### Table: tournees (delivery tours)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| date | text NOT NULL | |
| livreur_id | uuid FK users_profile | |
| depot_id | uuid FK depots | |
| creneau_debut | text | |
| creneau_fin | text | |
| notes | text | |
| created_by | uuid FK users_profile | |
| created_at | timestamp | |

### Table: naf_codes (NAF validation reference)
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| code | text UNIQUE NOT NULL | |
| label | text NOT NULL | |
| valide | bool | |
| created_at | timestamp | |
| updated_at | timestamp | |

### Table: monday_boards (Monday.com board registry)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| board_id | text UNIQUE NOT NULL | |
| board_name | text NOT NULL | |
| commercial_name | text | |
| is_active | bool | |
| items_count | int | |
| last_synced_at | timestamp | |
| created_at | timestamp | |
| updated_at | timestamp | |

### Table: monday_field_mapping (dynamic column mapping — NOT in database.ts)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| interface_field | text NOT NULL | |
| interface_label | text | |
| interface_type | text | |
| interface_section | text | |
| board_id | text | nullable for shared mappings |
| monday_column_id | text | |
| monday_column_title | text | |
| monday_column_type | text | |
| value_mapping | jsonb | |
| is_synced | bool | |
| is_required | bool | |
| Unique constraint | | (interface_field, COALESCE(board_id, '__null__')) |

### Table: livreur_agents (junction)
| Column | Type | Notes |
|--------|------|-------|
| livreur_id | uuid FK users_profile | PK composite |
| agent_id | uuid FK users_profile | PK composite |
| created_at | timestamp | |

### Table: workflow_transitions (audit trail)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| entity_type | text NOT NULL | |
| entity_id | text NOT NULL | |
| statut_avant | text | |
| statut_apres | text NOT NULL | |
| effectue_par | text | |
| user_id | uuid FK users_profile | |
| raison | text | |
| created_at | timestamp | |

### Table: audit_log
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK users_profile | |
| entity_type | text NOT NULL | |
| entity_id | text | |
| action | text NOT NULL | |
| details | jsonb | |
| ip_address | text | |
| created_at | timestamp | |

### Table: sync_monday_log
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid | |
| monday_item_id | bigint | |
| direction | text NOT NULL | |
| action | text NOT NULL | |
| statut | text NOT NULL | |
| donnees_avant | jsonb | |
| donnees_apres | jsonb | |
| message_erreur | text | |
| created_at | timestamp | |

### Table: formulaires_log
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid | |
| etape_numero | int NOT NULL | |
| etape_nom | text NOT NULL | |
| donnees_saisies | jsonb | |
| created_at | timestamp | |

### Table: email_alerts
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid | |
| type | text NOT NULL | |
| message | text NOT NULL | |
| envoye | bool | |
| date_envoi | timestamp | |
| details | jsonb | |
| created_at | timestamp | |

### Table: distances_cache
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid | |
| depot_id | uuid | |
| distance_km | float NOT NULL | |
| calculated_at | timestamp | |

### Table: clients_hors_zone
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid | |
| depot_plus_proche_id | uuid | |
| distance_depot_plus_proche_km | float | |
| statut | text | |
| resolu_par | text | |
| date_resolution | timestamp | |
| created_at | timestamp | |

### Table: user_societes
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | |
| client_id | uuid | |
| is_primary | bool | |
| created_at | timestamp | |

---

## 4. API Routes (81 route files)

### 4.1 Admin — Clients (11 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/clients | GET | auth (inline) | Liste paginee clients avec filtres |
| /api/admin/clients/[id] | GET, PUT, DELETE | auth (inline) | CRUD fiche client |
| /api/admin/clients/[id]/sync-monday | POST | super_admin, admin | Sync client vers Monday |
| /api/admin/clients/bulk | POST | auth (inline) | Actions bulk (statut, email) |
| /api/admin/clients/bypass-livraison | POST | super_admin, admin, agent_secteur, livreur | Bypass formulaire, cree livraison |
| /api/admin/clients/request-documents | POST | super_admin, admin, agent_secteur | Demande documents client |
| /api/admin/clients/resend-code | POST | auth (inline) | Renvoyer code validation |
| /api/admin/clients/reset-formulaire | POST | auth (inline) | Reset formulaire client |
| /api/admin/clients/send-formulaire | POST | super_admin, admin, agent_secteur | Envoyer formulaire ENEMAT |
| /api/admin/clients/send-formulaire-livraison | POST | super_admin, admin, agent_secteur | Envoyer formulaire livraison |
| /api/admin/clients/send-relance | POST | super_admin, admin, agent_secteur | Envoyer email relance |

### 4.2 Admin — Livraisons (8 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/livraisons | GET | super_admin, admin, agent_secteur, livreur | Liste livraisons (filtrage role-based) |
| /api/admin/livraisons/[id] | GET, PATCH | GET: all 4 admin roles / PATCH: super_admin, admin, agent_secteur | Fiche livraison + maj |
| /api/admin/livraisons/[id]/deliver | POST | super_admin, admin, agent_secteur, livreur | Valider livraison (photos, signatures, PDF) |
| /api/admin/livraisons/[id]/send-bon | POST | super_admin, admin, agent_secteur, livreur | Envoyer bon de livraison par email |
| /api/admin/livraisons/[id]/status | PATCH | super_admin, admin, agent_secteur, livreur | Changer statut livraison |
| /api/admin/livraisons/send-confirmation-creneau | POST | super_admin, admin, agent_secteur, livreur | Email confirmation creneau |
| /api/admin/livraisons/send-mail-livraison | POST | super_admin, admin, agent_secteur, livreur | Email info livraison |
| /api/admin/livraisons/send-mail-planning | POST | super_admin, admin, agent_secteur, livreur | Email planning livraison |

### 4.3 Admin — Controle Qualite (4 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/controle | GET | super_admin, admin | Liste livraisons a controler |
| /api/admin/controle/[livraisonId]/check | PATCH | super_admin, admin | MAJ checklist CQ (6 points). REQUIERT lock prealable (sauf super_admin). |
| /api/admin/controle/[livraisonId]/lock | POST | super_admin, admin | Verrouiller livraison pour CQ (obligatoire avant modification) |
| /api/admin/controle/[livraisonId]/validate | POST | super_admin, admin | Valider CQ complet |

### 4.4 Admin — Planning (4 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/planning | GET | super_admin, admin, agent_secteur | Calendrier planning livraisons |
| /api/admin/planning/search | GET | super_admin, admin, agent_secteur, livreur | Recherche clients pour placement (adminClient) |
| /api/admin/planning/unschedule | POST | super_admin, admin, agent_secteur, livreur | Deprogrammer livraison (adminClient) |
| /api/admin/planning/anomalies | POST | super_admin, admin | Detecter anomalies planning |

### 4.5 Admin — Depots (4 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/depots | GET | super_admin, admin, agent_secteur, livreur | Liste depots |
| /api/admin/depots/stats | GET | super_admin, admin, agent_secteur | Stats depots |
| /api/admin/depots/simulate | POST | super_admin, admin | Simuler assignation depot |
| /api/admin/depots/reassign-clients | POST | auth (inline) | Reassigner clients a un depot |

### 4.6 Admin — Users (4 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/users/create | POST | super_admin, admin, agent_secteur | Creer utilisateur |
| /api/admin/users/[id] | PATCH, PUT, DELETE | super_admin, admin, agent_secteur | MAJ/supprimer utilisateur |
| /api/admin/users/[id]/impersonate | POST | super_admin | Impersonation |
| /api/admin/users/agents | GET | super_admin, admin, agent_secteur | Liste agents |

### 4.7 Admin — Tournees (1 route)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/tournees | GET, POST | GET: all 4 admin roles / POST: super_admin, admin | Liste + creer tournees |

### 4.8 Admin — NAF + FNUCI (4 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/naf | GET | super_admin, admin, agent_secteur | Liste codes NAF |
| /api/admin/naf/[code] | PATCH | super_admin, admin | MAJ validation NAF |
| /api/admin/fnuci | GET, PATCH | GET: all 4 admin roles / PATCH: super_admin, admin | Gestion FNUCI |
| /api/admin/fnuci/validate | POST | super_admin, admin, agent_secteur, livreur | Valider FNUCI |

### 4.9 Admin — Autres (3 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/admin/geocoding/batch | GET, POST | super_admin, admin | Geocodage batch |
| /api/admin/map/data | GET | auth (inline) | Donnees carte |
| /api/alerts | GET, POST | super_admin, admin | Gestion alertes |

### 4.10 Public/Client — Formulaire (9 routes)
| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| /api/formulaire/validate-token | POST | Token | Valider token formulaire |
| /api/formulaire/validate-enemat | POST | Token | Valider code ENEMAT |
| /api/formulaire/submit | POST | Token | Soumettre formulaire (preferences_livraison inclus) |
| /api/formulaire/resend-code | POST | Token | Renvoyer code validation |
| /api/formulaire/client-address | POST | Token | Recuperer adresse client |
| /api/formulaire/save-address | POST | Token | Sauvegarder adresse modifiee |
| /api/formulaire-livraison/validate-token | GET | Token | Valider token formulaire livraison |
| /api/formulaire-livraison/submit | POST | Token | Soumettre formulaire livraison |
| /api/documents/validate-token | POST | Token | Valider token documents |

### 4.11 Public/Client — Livraisons + Documents (5 routes)
| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| /api/livraisons | GET | super_admin, admin, agent_secteur, livreur | Liste paginee livraisons (page admin alt.) |
| /api/livraisons/confirm-creneau | GET | Token | Confirmer creneau livraison |
| /api/livraisons/cancel-creneau | GET | Token | Annuler creneau |
| /api/livraisons/info-creneau | GET | Token | Info creneau |
| /api/documents/upload | POST | Token | Upload document |

### 4.12 Client Data (7 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/clients | GET | super_admin, admin, agent_secteur | Liste clients paginee |
| /api/clients/stats | GET | super_admin, admin, agent_secteur | Stats clients |
| /api/clients/statuses | GET | super_admin, admin, agent_secteur | Liste statuts distincts |
| /api/clients/commercials | GET | super_admin, admin, agent_secteur | Liste commerciaux |
| /api/clients/departements | GET | super_admin, admin, agent_secteur | Liste departements |
| /api/clients/send-form | POST | super_admin, admin, agent_secteur | Envoyer formulaire |
| /api/depots | GET | super_admin, admin, agent_secteur, livreur | Liste depots (public pour UI) |

### 4.13 Monday.com Integration (11 routes)
| Route | Methods | Roles | Description |
|-------|---------|-------|-------------|
| /api/monday/clients | GET | no requireRole | Liste clients Monday |
| /api/monday/clients/[id] | GET, PUT | no requireRole | Fiche client Monday |
| /api/monday/clients/stats | GET | no requireRole | Stats Monday |
| /api/monday/columns | POST | super_admin, admin | Liste colonnes board |
| /api/monday/create-column | POST | super_admin, admin | Creer colonne |
| /api/monday/mapping | GET, POST, DELETE | super_admin, admin | CRUD mapping champs |
| /api/monday/mapping/init | POST, GET | super_admin, admin | Init mappings |
| /api/monday/schema | GET | super_admin, admin | Schema board |
| /api/monday/statuts | GET | no requireRole | Statuts Monday |
| /api/monday/sync-ids | GET, POST | no requireRole | Sync IDs Monday |
| /api/monday/webhooks | GET, POST, DELETE | super_admin | Gestion webhooks |

### 4.14 Other (6 routes)
| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| /api/auth/login | POST | Public | Login |
| /api/address/search | GET | Public | Recherche adresse (geocoding) |
| /api/relance | POST, PUT | no requireRole | Relance client |
| /api/sync/monday | POST, GET | no requireRole | Sync Monday |
| /api/tournee/confirm | POST, GET | no requireRole | Confirmation tournee |
| /api/webhooks/monday | POST, GET | Public | Webhook Monday entrant |

---

## 5. Pages (34 pages)

### 5.1 Admin (17 pages)
| Page | Path | Description |
|------|------|-------------|
| Dashboard | /admin/dashboard | Vue d'ensemble stats |
| Clients | /admin/clients | Liste clients avec filtres multi-select |
| Fiche Client | /admin/clients/[id] | Detail client + actions |
| Livraisons | /admin/livraisons | Liste livraisons avec filtres pin + pagination |
| Fiche Livraison | /admin/livraisons/[id] | Detail livraison |
| Module Livraison | /admin/livraisons/deliver | Module plein ecran pour agents/livreurs (photos, signatures, PDF) |
| Dashboard Livreur | /admin/livraisons/livreur | Vue livreur (aujourd'hui + demain) |
| Planning | /admin/planning | Calendrier drag-drop livraisons |
| Carte | /admin/map | Carte Google Maps clients + depots |
| Depots | /admin/depots | Gestion depots |
| Utilisateurs | /admin/users | Gestion users + roles |
| Alertes / CQ | /admin/alertes | Controle Qualite post-livraison |
| Sync Monday | /admin/sync | Synchronisation Monday |
| Settings | /admin/settings | Parametres generaux |
| Settings Monday | /admin/settings/monday | Config Monday mapping |
| Settings NAF | /admin/settings/naf | Validation NAF |
| Settings FNUCI | /admin/settings/fnuci | Registre FNUCI |

### 5.2 Auth (7 pages)
| Page | Path | Description |
|------|------|-------------|
| Login | /auth/login | Connexion |
| Register | /auth/register | Inscription |
| Forgot Password | /auth/forgot-password | Mot de passe oublie |
| Reset Password | /auth/reset-password | Reset mot de passe |
| Complete Profile | /auth/complete-profile | Completer profil |
| Impersonate | /auth/impersonate | Impersonation (super_admin) |
| Select Societe | /auth/select-societe | Choix tenant PPE/Ecovolt |

### 5.3 Client (2 pages)
| Page | Path | Description |
|------|------|-------------|
| Dashboard Client | /client/dashboard | Vue client |
| Livraisons Client | /client/livraisons | Suivi livraisons |

### 5.4 Public (8 pages)
| Page | Path | Description |
|------|------|-------------|
| Accueil | / | Landing page |
| Formulaire ENEMAT | /formulaire | Formulaire multi-step (6 etapes) |
| Formulaire Livraison | /formulaire-livraison | Formulaire livraison client |
| Documents | /documents | Upload documents client |
| Confirmation Creneau | /livraisons/confirm-creneau | Confirmer creneau |
| Annulation Creneau | /livraisons/cancel-creneau/confirme | Confirmer annulation |
| Relance | /relance | Page relance |
| Confirmation Tournee | /tournee/confirmation | Confirmation tournee |

---

## 6. Components (40 fichiers)

### 6.1 Admin Components (4 fichiers)
| Fichier | Description |
|---------|-------------|
| admin-nav.tsx | Navigation admin (menu lateral) |
| admin-user-provider.tsx | Context provider user admin (role, depot_ids) |
| delivery-module.tsx | Module livraison complet (photos, signatures, PDF, CQ checks) |
| pin-filters.tsx | Filtres epingles localStorage par user. Toutes les pages qui utilisent pin-filters ont un guard `filtersReady` pour eviter la race condition (fetch avant chargement des filtres figes). Pages concernees : livraisons, clients, alertes. |

### 6.2 Client Components (2 fichiers)
| Fichier | Description |
|---------|-------------|
| client-nav.tsx | Navigation client |
| client-user-provider.tsx | Context provider user client |

### 6.3 Formulaire Components (7 fichiers)
| Fichier | Description |
|---------|-------------|
| Step1CodeEnemat.tsx | Saisie code ENEMAT |
| Step2Informations.tsx | Infos client |
| Step3Adresse.tsx | Adresse (avec autocomplete) |
| Step4Preference.tsx | Preferences livraison |
| Step5Fnuci.tsx | Enregistrement FNUCI |
| Step6Confirmation.tsx | Confirmation finale |
| StepIndicator.tsx | Indicateur d'etapes |

### 6.4 Theme (2 fichiers)
| Fichier | Description |
|---------|-------------|
| tenant-theme.tsx | Theme multi-tenant (PPE vert / Ecovolt jaune) |
| theme-provider.tsx | Dark/light mode (next-themes) |

### 6.5 UI Components (25 fichiers — Radix/shadcn)
address-autocomplete, alert-dialog, alert, avatar, badge, button, card, checkbox, command, dialog, dropdown-menu, form, input, label, mini-map, popover, radio-group, select, separator, sheet, slider, sonner, table, tabs, textarea

---

## 7. Lib (26 fichiers)

### 7.1 Auth System (6 fichiers)
| Fichier | Description |
|---------|-------------|
| auth/require-role.ts | Verification role cote serveur (requireRole, isAuthError, isSuperAdmin) |
| auth/types.ts | ROLE_PERMISSIONS, ROLE_HIERARCHY, DEFAULT_ROUTES, PROTECTED_ROUTES |
| auth/helpers.ts | canAccessDepot(), hasPermission() |
| auth/server.ts | createClient() server-side (cookies) |
| auth/context.tsx | React context AdminUser |
| auth/index.ts | Re-exports |

### 7.2 Supabase (3 fichiers)
| Fichier | Description |
|---------|-------------|
| supabase/admin.ts | createAdminClient() — service_role, bypass RLS |
| supabase/client.ts | createClient() — browser, soumis RLS |
| supabase/server.ts | createClient() — server-side cookies |

### 7.3 Email (1 fichier)
| Fichier | Description |
|---------|-------------|
| email/gmail.ts | Gmail OAuth2 + nodemailer. Timeout 10s getAccessToken, 15s SMTP |

### 7.4 Monday.com (5 fichiers)
| Fichier | Description |
|---------|-------------|
| monday/api.ts | Client API Monday (GraphQL) |
| monday/config.ts | Config boards, tokens |
| monday/dynamic-mapping.ts | Mapping dynamique champs |
| monday/interface-fields.ts | Champs interface standard |
| monday/types.ts | Types Monday |

### 7.5 Tenants (3 fichiers)
| Fichier | Description |
|---------|-------------|
| tenants/config.ts | Config PPE + Ecovolt (branding, legal, contact, phone) |
| tenants/commercial.ts | Commerciaux par tenant |
| tenants/index.ts | getTenantId() — reads NEXT_PUBLIC_TENANT_ID |

### 7.6 Formulaire (2 fichiers)
| Fichier | Description |
|---------|-------------|
| formulaire/store.ts | Zustand store formulaire multi-step |
| formulaire/types.ts | Types formulaire |

### 7.7 Other (6 fichiers)
| Fichier | Description |
|---------|-------------|
| constants.ts | PROCESS_STATUTS (10), DELIVERY_STATUS (5), FORM_STATUS (5), USER_ROLES (5), CQ_CHECKS (6), STATUT_TRANSITIONS, STATUT_COLORS, ROLE_COLORS, DELIVERY_ZONES, DELIVERY_MODES, FORM_VALIDATION, PAGINATION, MONDAY_SYNC, TERRITOIRES, validatePagination() |
| types/database.ts | Types TypeScript de toutes les tables DB (15 tables) + type aliases |
| geo/utils.ts | Calcul distances, classification zone (zone_gratuite/hors_zone) |
| google-maps.ts | Google Maps API loader |
| api-response.ts | Helpers reponse API |
| utils.ts | Utilitaires generaux (cn, etc.) |

---

## 8. Workflow Client (Statuts)

```
controle_valide -> formulaire_envoye -> formulaire_valide -> a_livrer -> en_livraison -> livre
                                                                     \-> probleme_livraison -> a_relivrer
                                                                     \-> retractation
                                                                     \-> anomalie
```

### PROCESS_STATUTS (10 statuts)
| # | Statut | Label | Couleur |
|---|--------|-------|---------|
| 1 | controle_valide | Controle valide | blue |
| 2 | formulaire_envoye | Formulaire envoye | cyan |
| 3 | formulaire_valide | Formulaire valide | emerald |
| 4 | a_livrer | A livrer | amber |
| 5 | en_livraison | En livraison | orange |
| 6 | livre | Livre | green |
| 7 | probleme_livraison | Probleme de livraison | red |
| 8 | a_relivrer | A relivrer | pink |
| 9 | retractation | Retractation | gray |
| 10 | anomalie | Anomalie | rose |

### Transitions autorisees (STATUT_TRANSITIONS)
| Depuis | Vers |
|--------|------|
| controle_valide | formulaire_envoye, retractation, anomalie |
| formulaire_envoye | formulaire_valide, retractation, anomalie |
| formulaire_valide | a_livrer, retractation, anomalie |
| a_livrer | en_livraison, retractation, anomalie |
| en_livraison | livre, probleme_livraison, retractation, anomalie |
| livre | retractation, anomalie |
| probleme_livraison | a_relivrer, retractation, anomalie |
| a_relivrer | en_livraison, retractation, anomalie |
| retractation | (terminal) |
| anomalie | (terminal) |

### Livraison Status Transitions (from livraisons/[id]/status)
| Depuis | Vers |
|--------|------|
| en_attente | programmee, en_cours, annulee |
| programmee | en_cours, annulee |
| en_cours | livree, probleme, annulee |
| livree | (terminal) |
| annulee | (terminal) |
| probleme | en_cours, annulee |

### Livraison -> Client statut mapping
| Livraison statut | Client statut_commercial |
|-----------------|-------------------------|
| en_cours | en_livraison |
| livree | livre |
| probleme | probleme_livraison |

### CQ_CHECKS (6 points controle qualite)
| Key | Label | Description |
|-----|-------|-------------|
| cq_piece_identite | Piece d'identite | Piece d'identite du beneficiaire verifiee |
| cq_photo_enemat | Photo ENEMAT | Photo de la plaque ENEMAT presente |
| cq_signature_installateur | Signature installateur | Signature de l'installateur presente |
| cq_signature_client | Signature client | Signature du client/beneficiaire presente |
| cq_fnuci | N FNUCI | Enregistrement FNUCI effectue |
| cq_velo | NB velo | Etat du velo verifie conforme |

---

## 9. Migrations SQL (24 fichiers)

| Fichier | Description |
|---------|-------------|
| 20260114_add_depot_columns | Colonnes depot_retrait_id, depot_logistique_id sur clients |
| 20260115_add_code_enemat_saisi_to_clients | Code ENEMAT saisi par client |
| 20260115_add_code_validation | Hash code validation email |
| 20260122_add_perimetre_livraison_payant | Rayon livraison payante sur depots |
| 20260122_add_prix_livraison_payante | Prix livraison payante sur depots |
| 20260123_create_monday_field_mapping | Table monday_field_mapping + RLS |
| 20260123_fix_rls_infinite_recursion | Fix RLS recursion infinie |
| 20260123_make_siret_tolerant | SIRET nullable + non-unique |
| 20260208_add_type_livraison_mapping | Mapping type livraison dans monday_field_mapping |
| 20260209_fix_type_livraison_value_mapping | Fix value mapping uppercase |
| 20260217_add_multi_board_support | Multi-board Monday + table monday_boards + board_id sur mapping |
| 20260306_add_depot_ids_array | depot_ids[] sur users_profile |
| 20260307_user_roles_overhaul | Renommage roles + is_super_admin + livreur_agents + departement |
| 20260308_client_documents | Documents client (attestations, tokens, urls) |
| 20260308_delivery_tournees | Table tournees + confirmation livraison + token_livraison |
| 20260308_process_client_schema | reference_retina, naf_codes table, jours_ouverture depots |
| 20260310_agent_aussi_livreur | est_aussi_livreur flag sur users_profile |
| 20260310_attestation_pdf_url | URL PDF attestation sur livraisons |
| 20260310_heure_precise | Heure precise livraison |
| 20260311_fix_agent_rls_depot_ids | Fix RLS agent depot_ids |
| 20260311_fix_rls_obsolete_roles | Fix RLS roles obsoletes |
| 20260311_naf_codes_complete | 199 codes NAF complets dans naf_codes |
| 20260312_controle_qualite | CQ module (cq_checks booleans, cq_valide, cq_en_cours, cq_commentaire) |
| 20260312_controle_qualite_lock | CQ lock (cq_pris_par, cq_pris_at) |

---

## 10. Env Variables

| Variable | Usage |
|----------|-------|
| NEXT_PUBLIC_SUPABASE_URL | URL Supabase tenant |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Cle anon Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Cle service_role (admin, bypass RLS) |
| NEXT_PUBLIC_TENANT_ID | "ppe" ou "ecovolt" |
| MONDAY_API_TOKEN | Token API Monday |
| GMAIL_CLIENT_ID | OAuth2 Gmail |
| GMAIL_CLIENT_SECRET | OAuth2 Gmail |
| GMAIL_REFRESH_TOKEN | OAuth2 Gmail |
| GMAIL_USER | Email expediteur |
| NEXT_PUBLIC_GOOGLE_MAPS_KEY | Cle Google Maps |
| NEXT_PUBLIC_BASE_URL | URL base app |

---

## 11. Changelog

| Date | Modifications |
|------|---------------|
| 2026-03-12 (v4) | Fix pin filters race condition (3 pages: livraisons, clients, alertes) — ajout filtersReady pour empecher le fetch avant chargement des filtres figes. Fix CQ lock obligatoire : API check refuse les modifications si dossier non pris (sauf super_admin). UI desactive les checkboxes tant que le dossier n'est pas pris. Fix bypass-livraison ajoute depot_id + fix 403 agents sur livraisons sans depot. Data fix CYKA PLOMBERIE. |
| 2026-03-12 (v3) | REWRITE COMPLET ARCHITECTURE.md depuis le code reel (81 routes, 34 pages, 40 composants, 26 lib, 24 migrations, 15 tables). |
| 2026-03-12 (v2) | Routes CQ, planning search/unschedule bypass RLS, email timeouts, bypass-livraison |
| 2026-03-12 | Audit complet + module CQ + pin-filters + auth guards |
| 2026-03-11 | Auth guards 13 routes, filtrage role-based, RLS fixes, FNUCI/NAF, agent depot_ids |

---

## 12. Regles de mise a jour

**A chaque modification du code, mettre a jour la section concernee :**
- Nouvelle route API -> Section 4
- Nouvelle page -> Section 5
- Nouveau composant -> Section 6
- Nouvelle lib -> Section 7
- Migration SQL -> Section 3 + Section 9
- Modification auth/roles -> Section 2
- Nouvelle env variable -> Section 10
- Ajouter une ligne au Changelog (Section 11)

**Ce fichier est la SEULE source de verite. Si une information n'est pas ici, elle n'existe pas.**
