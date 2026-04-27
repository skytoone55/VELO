# VELO — Architecture (PPE + Ecovolt)

> Source de vérité technique du projet `velo` (multi-tenant PPE Energie + Ecovolt). Doc vivante.
> Axe parent : A — Projets business (`/Users/john/JARVIS/projets/ARCHITECTURE.md`).
> Densité cible : 1500-3000 lignes (projet le plus complexe de l'écosystème). **John préfère TOUJOURS plus de détail que moins** (`memory/feedback_detail_complet.md`).
> Dernière harmonisation : 2026-04-27 (gabarit canon §3 du `docs/GABARITS-ARCHITECTURE.md` v1.0).

---

## 1. Vision

### Problème métier

Le projet `velo` est un **CRM multi-tenant de gestion de flottes de vélos-cargos électriques** opéré par deux sociétés distinctes : **PPE Energie** (métropole) et **Ecovolt** (DOM-TOM, principalement Martinique/Guadeloupe). Le besoin opérationnel : suivre **bout-en-bout** un client de la **prospection commerciale** (board Monday) jusqu'à la **livraison physique d'un vélo-cargo** au siège du bénéficiaire (TPE/PME éligibles via la prime ENEMAT).

Les contraintes métier sont **denses et imbriquées** :
- **Validation NAF ENEMAT** : seulement certains codes NAF sont éligibles à la prime énergie ENEMAT (377 codes NAF référencés, 81.5 % OUI / 18 % NON / 0.5 % à vérifier après audit 2026-02-23).
- **Workflow client à 10 statuts** (controle_valide → formulaire_envoye → formulaire_valide → a_livrer → en_livraison → livre, avec branches probleme_livraison, retractation, anomalie).
- **Formulaire ENEMAT 6 étapes** rempli par le client (code ENEMAT, infos, adresse, préférences, FNUCI, confirmation).
- **Module livraison plein écran** pour les livreurs sur le terrain (photos, signatures électroniques, PDF généré, checklist 6 points de **Contrôle Qualité**).
- **2 comptes Monday distincts** avec mappings de colonnes différents par board (PPE = 7 boards historiques par commercial, Ecovolt = 1 board général).
- **Webhook retrait Ecovolt** : process spécifique de récupération du vélo en dépôt avec capture FNUCI + carte d'identité + génération PDF d'attestation (pas applicable PPE).
- **Réf RETINA** : identifiant client externe à mentionner systématiquement dans toute communication métier (`memory/feedback_velo_retina.md`).

Aucun outil du marché ne combine multi-tenant DOM-TOM/métropole + intégration Monday bidirectionnelle + validation NAF + module livraison terrain + signature électronique + multi-rôles (super_admin/admin/agent_secteur/livreur/client). D'où le développement custom.

### Valeur ajoutée

- **Multi-tenant strict** : 1 base Supabase par société (zéro fuite de données entre PPE et Ecovolt), branding différencié (vert PPE / jaune Ecovolt) via `tenant-theme.tsx`, sélection au login.
- **Validation NAF automatisée** : 199 codes NAF en table de référence, croisés avec les boards Monday, badge OUI/NON/À vérifier sur chaque fiche.
- **Module livraison terrain** : 1 livreur peut traiter une livraison de bout-en-bout depuis son téléphone (photos vélo + ENEMAT + signatures + PDF + envoi email automatique + MAJ statut).
- **Contrôle Qualité post-livraison** avec lock dossier (un agent CQ verrouille un dossier pour éviter les doubles modifications).
- **Pin filters** par utilisateur (filtres figés en localStorage) sur les pages clients/livraisons/alertes pour reprendre exactement où on en était.
- **Drag-and-drop planning** : calendrier avec drag-drop des livraisons sur créneaux dépôt.
- **Géocodage automatique** (Google Maps) + classification zone gratuite / hors zone par dépôt (rayon de couverture).

### KPIs business

| KPI | Cible | Mesure |
|-----|-------|--------|
| Taux conversion ENEMAT (devis → livré) | > 60 % | `count(statut=livre) / count(statut!=null)` sur 30j |
| Délai moyen formulaire → livraison | < 21 jours | `date_livraison_effective - date_envoi_formulaire` médiane |
| Taux validation NAF OUI | > 80 % | proportion `validation_naf=OUI` à l'import |
| Taux CQ validé sans anomalie | > 95 % | `count(cq_valide=true AND statut_anomalie=null) / count(livre)` |
| Erreurs webhook Monday | 0/jour | `sync_monday_log` où `statut=erreur` |

### Identité

- **Société propriétaire** : **PPE Energie** (SIRET à confirmer dans `~/.claude/projects/-Users-john-JARVIS/memory/velo-details.md`) + **Ecovolt** (DOM-TOM) — multi-tenant strict.
- **URL Vercel prod PPE** : `https://velo-ppe.vercel.app` (ou domaine custom selon config Vercel)
- **URL Vercel prod Ecovolt** : `https://velo-ecovolt.vercel.app` (ou domaine custom)
- **Repo GitHub** : `skytoone55/VELO` (casse exacte, **majuscules**)
- **Branche prod** : `main`
- **Statut** : **prod active** (PPE et Ecovolt en exploitation, dernière refonte fixes Ecovolt 2026-03-13)
- **CLAUDE.md projet** : `/Users/john/JARVIS/projets/velo/CLAUDE.md`
- **Mémoires dédiées** :
  - `~/.claude/projects/-Users-john-JARVIS/memory/velo-details.md` (boards Monday, tokens, env vars Vercel)
  - `~/.claude/projects/-Users-john-JARVIS/memory/velo-codebase-map.md` (carte technique fichiers, patterns auth, state machine, pièges)
  - `~/.claude/projects/-Users-john-JARVIS/memory/ecovolt-chantier.md` (plan remise en état Ecovolt)
  - `~/.claude/projects/-Users-john-JARVIS/memory/feedback_charlotte.md` (Charlotte Pochet = Charlotte PPE)
  - `~/.claude/projects/-Users-john-JARVIS/memory/feedback_velo_retina.md` (toujours mentionner Réf RETINA)

---

## 2. Stack

### Versions exactes (verrouillées)

- **Next.js** : **15.5.12** (App Router, pas de Turbopack en prod, build webpack)
- **React** : **19.2.3** (Server Components, useTransition, useOptimistic)
- **TypeScript** : **5.x** (strict mode activé)
- **Tailwind CSS** : **3.x** + plugins (forms, typography)
- **Radix UI** : composants primitifs (alert-dialog, dialog, dropdown-menu, popover, select, tabs, etc.)
- **shadcn/ui** : 25 composants UI (`src/components/ui/`)
- **Lucide React** : icônes
- **Supabase JS** : `@supabase/supabase-js` (clients : browser, server, admin)
- **Monday API** : appels GraphQL via `lib/monday/api.ts` (pas de SDK officiel)
- **Gmail OAuth2** : `googleapis` + `nodemailer` pour envois mails (timeouts 10s getAccessToken / 15s SMTP)
- **jsPDF** : génération PDF bons de livraison + attestations
- **html5-qrcode** : scan QR code FNUCI (livreur sur terrain)
- **react-hook-form + zod** : formulaires avec validation
- **zustand** : store formulaire multi-step (6 étapes)
- **xlsx** : import/export Excel (NAF reference)
- **next-themes** : light/dark mode

### Justifications techniques

| Choix | Pourquoi | Alternative écartée | Raison du rejet |
|-------|----------|---------------------|-----------------|
| Next.js 15 App Router | Server components + RSC streaming + middleware roles | Pages Router | Migration coût élevé, pas de RSC |
| Supabase | RLS native + Realtime + Auth + Storage + 2 projets distincts pour multi-tenant strict | Firebase / RDS | Pas de RLS native + courbe SQL |
| 2 Supabase distincts (PPE + Ecovolt) | Silo parfait, zéro fuite de données entre tenants, RLS simplifiée | 1 Supabase + colonne `tenant_id` | Fuite possible via bug RLS, complexité audit |
| zustand pour formulaire | Léger, persist localStorage, pas de re-render parasites | Redux | Trop verbeux pour 6 steps |
| Monday API GraphQL custom | Mappings différents par board, pas de SDK supportant ça | n8n / Zapier | Coût + perte contrôle des mappings |
| Gmail OAuth2 (vs SMTP simple) | Délivrabilité supérieure + DKIM auto + quota 1000/j | Resend / Sendgrid | Licence + ajout dépendance externe |
| jsPDF côté serveur | PDF généré et stocké dans Supabase Storage | Puppeteer | Trop lourd (Chromium en serverless) |

### Conventions de nommage projet

- **Routes API** : `/api/<domaine>/<action>` (ex: `/api/admin/clients/[id]/sync-monday`, `/api/formulaire/submit`).
- **Composants React** : PascalCase (`<DeliveryModule>.tsx`, `<PinFilters>.tsx`, `<Step1CodeEnemat>.tsx`).
- **Tables Supabase** : snake_case pluriel (`clients`, `livraisons`, `monday_field_mapping`).
- **Migrations** : `YYYYMMDD_description_courte.sql` (ex: `20260312_controle_qualite.sql`, `20260312_controle_qualite_lock.sql`).
- **Env vars** : SCREAMING_SNAKE_CASE (`NEXT_PUBLIC_TENANT_ID`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Hooks** : `use<Nom>` (`useAdminUser`, `useTenantTheme`).
- **Pas d'accents** dans les noms de fichiers techniques (sources, scripts).
- **kebab-case** pour les URLs publiques (`/livraisons/confirm-creneau`, `/formulaire-livraison`).

### Particularités d'environnement

- **Mode local** : `npm run dev` (port 3000 par défaut, 3001 si occupé). Variable `NEXT_PUBLIC_TENANT_ID` à fixer manuellement (`ppe` ou `ecovolt`).
- **Build** : `npm run build` — webpack (pas Turbopack en prod).
- **Test** : `npm run lint` (eslint) + `npm run typecheck` (tsc --noEmit). **Pas de tests unitaires automatisés actuellement** (chantier P2 : ajouter tests Vitest).
- **Deploy** : pipeline Vercel auto-déclenché par webhook GitHub sur `main`. **2 projets Vercel distincts** (un par tenant) avec env vars différentes.
- **Branche déploiement** : `main` exclusivement. Pas de preview deploys utilisés en prod (mais auto sur PR).

---

## 3. Sources de données

### 3.1 Bases Supabase (2 projets distincts — multi-tenant)

| Tenant | Project ID Supabase | Région | MCP Claude | Branding |
|--------|--------------------|---------|------------|----------|
| **PPE** | `zfpzhhdovxllchlsihcr` | `eu-west-1` | `supabase-ppe` | Vert PPE Energie |
| **Ecovolt** | `irpnllwlxivlylclfjwd` | `eu-west-3` | `supabase-mz` | Jaune Ecovolt |

**Règle silo absolue** : aucun JOIN, aucune query cross-tenant. Le client Supabase utilisé est sélectionné via `NEXT_PUBLIC_TENANT_ID` lu dans `lib/tenants/index.ts` → `getTenantId()`. La build Vercel injecte la bonne env var par projet.

### 3.2 Tables Supabase (15 tables)

Détail complet des 15 tables (colonnes, contraintes, RLS, index) déplacé dans [`db-schema.md`](./db-schema.md).

**Index** : clients (PPE+Ecovolt), commandes, livraisons, contrôles_qualité, fnuci, depots, depots_retrait, factures, profiles, audit_log, presta_calendar, env_settings, retina_refs, dossiers_enemat, doc_uploads.

### 3.3 Fonctions RPC atomiques

- **Aucune RPC custom utilisée actuellement** (tout passe par requêtes JS côté API). Chantier P2 : envisager RPCs pour transitions atomiques de statut (race conditions sur CQ lock).

### 3.4 Sources externes

| Source | Type | Accès | Utilité |
|--------|------|-------|---------|
| **Monday PPE** (compte `crm-oreka`) | API GraphQL v2 | `MONDAY_API_TOKEN` (env Vercel projet PPE) | 7 boards par commercial |
| **Monday Ecovolt** (compte `alexandredelannays-team`) | API GraphQL v2 | Token séparé en env Vercel projet Ecovolt | 1 board général #9990833105 (1188 items) |
| **Gmail OAuth2** | OAuth2 + nodemailer | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER` | Envoi emails formulaire/relance/livraison |
| **Google Maps API** | REST + JS SDK | `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Géocodage adresses + carte admin |
| **NAF reference (Excel)** | Fichier statique | `docs/171 Naf Validation.xlsx` | Source 377 codes NAF ENEMAT |

### 3.5 Storage / fichiers

- **Supabase Storage PPE** (bucket `documents`) : attestations URSSAF, DSN, pièce identité, déclaration bénévoles, devis PDF, photos livraison, signatures, attestations livraison.
- **Supabase Storage Ecovolt** (bucket idem) : idem + spécifique webhook retrait (CI + FNUCI + PDF attestation).
- **Disque local (dev seul)** : aucun (pas de cache fichier serveur).

### 3.6 Boards Monday (détail)

**PPE Energie** (compte `crm-oreka`, 7 boards) :
| Board ID | Nom | Commercial |
|----------|-----|-----------|
| 2144986053 | ATHOME | équipe AtHome |
| 5002798369 | ALEX | Alex |
| 2146667697 | DIZIEN | Dizien |
| 2140187165 | EKL | EKL |
| 2137662048 | JM | JM |
| 5013455904 | SALIH | Salih |
| 5001072451 | STELLARS | Stellars |

**Ecovolt** (compte `alexandredelannays-team`, 1 board) :
| Board ID | Nom |
|----------|-----|
| 9990833105 | Velos Cargos General (1188 items) |

**Workspace Monday principal** : `CRM ENERGIE` (ID `4852276`, compte John).

> Détail tokens et URLs dans `~/.claude/projects/-Users-john-JARVIS/memory/velo-details.md`.

---

## 4. Schéma KG du projet

### 4.1 Entités principales

| Label | Slug pattern | Props clés | Source |
|-------|--------------|-----------|--------|
| `Projet` | `velo-ppe` | `stack, statut, deadline, repo, supabase_ref, vercel_url, silo` | ARCH (ce fichier) |
| `Projet` | `velo-ecovolt` | idem (ref Supabase distincte) | ARCH (ce fichier) |
| `Societe` | `ppe-energie` | `naf, role_user, statut` | KG seed |
| `Societe` | `ecovolt` | `naf, role_user, statut` | KG seed |
| `Personne` | `charlotte-ppe` | `role, societe` | mémoire `feedback_charlotte.md` |
| `Personne` | `<beneficiaire-slug>` | `role=client, naf, departement` | extraction Gmail/Monday |
| `Outil` | `monday-board-<id>` | `account, items_count, commercial` | KG seed |
| `Outil` | `supabase-ppe` / `supabase-mz` | `mcp, project_ref, region` | KG seed |
| `Document` | `velo-arch-architecture` | `format=md, path` | mémoire docs-registry |
| `Concept` | `velo-multi-tenant` | `description` | doctrine |
| `Concept` | `validation-naf-enemat` | `description` | doctrine |

### 4.2 Relations cross-axe

| Sujet | Prédicat | Objet | Justification |
|-------|----------|-------|---------------|
| `Projet:velo-ppe` | `PART_OF` | `Concept:axe-a-projets` | Appartenance axe A |
| `Projet:velo-ecovolt` | `PART_OF` | `Concept:axe-a-projets` | Appartenance axe A |
| `Projet:velo-ppe` | `OWNED_BY` | `Societe:ppe-energie` | Propriété |
| `Projet:velo-ecovolt` | `OWNED_BY` | `Societe:ecovolt` | Propriété |
| `Projet:velo-ppe` | `RELATED_TO` | `Projet:velo-ecovolt` | Codebase commune, multi-tenant |
| `Projet:velo-ppe` | `USES_TECH` | `Technologie:next-js, Technologie:supabase, Technologie:monday, Technologie:gmail` | Stack |
| `Projet:velo-ecovolt` | `USES_TECH` | idem | Stack identique |
| `Projet:velo-ppe` | `LINKED_TO` | `Outil:supabase-ppe`, `Outil:monday-board-2144986053` (×7) | Connecteurs |
| `Projet:velo-ecovolt` | `LINKED_TO` | `Outil:supabase-mz`, `Outil:monday-board-9990833105` | Connecteurs |
| `Personne:charlotte-ppe` | `WORKS_FOR` | `Societe:ppe-energie` | Contact |
| `Document:velo-arch-architecture` | `DESCRIBES` | `Projet:velo-ppe` | Doc vivante |

### 4.3 Props attendues sur le nœud `Projet:velo-ppe`

```json
{
  "stack": ["next.js@15.5.12", "react@19.2.3", "supabase", "tailwind", "monday-graphql", "gmail-oauth2"],
  "statut": "prod",
  "deadline": null,
  "repo": "skytoone55/VELO",
  "vercel_project": "velo-ppe",
  "vercel_url": "https://velo-ppe.vercel.app",
  "supabase_ref": "zfpzhhdovxllchlsihcr",
  "supabase_mcp": "supabase-ppe",
  "silo": "pro",
  "tenant": "ppe",
  "version": "v4-2026-03-12",
  "monday_account": "crm-oreka",
  "monday_boards": ["2144986053", "5002798369", "2146667697", "2140187165", "2137662048", "5013455904", "5001072451"]
}
```

### 4.4 Props attendues sur le nœud `Projet:velo-ecovolt`

```json
{
  "stack": ["next.js@15.5.12", "react@19.2.3", "supabase", "tailwind", "monday-graphql", "gmail-oauth2"],
  "statut": "prod",
  "deadline": null,
  "repo": "skytoone55/VELO",
  "vercel_project": "velo-ecovolt",
  "vercel_url": "https://velo-ecovolt.vercel.app",
  "supabase_ref": "irpnllwlxivlylclfjwd",
  "supabase_mcp": "supabase-mz",
  "silo": "pro",
  "tenant": "ecovolt",
  "version": "v4-2026-03-13-fixes",
  "monday_account": "alexandredelannays-team",
  "monday_boards": ["9990833105"],
  "specifique": ["webhook_retrait_fnuci", "ci_capture", "pdf_attestation"]
}
```

### 4.5 Queries Cypher d'exemple (READ-ONLY)

```cypher
// Q1 — Liste des 2 tenants velo + leur Supabase ref
MATCH (p:Projet)
WHERE p.slug IN ['velo-ppe', 'velo-ecovolt']
RETURN p.slug, p.props.tenant, p.props.supabase_ref, p.props.vercel_url;

// Q2 — Tous les boards Monday liés à velo
MATCH (p:Projet)-[:LINKED_TO]->(o:Outil)
WHERE p.slug IN ['velo-ppe', 'velo-ecovolt']
  AND o.slug STARTS WITH 'monday-board-'
RETURN p.slug AS tenant, collect(o.slug) AS boards;

// Q3 — Trouver Charlotte Pochet (PPE)
MATCH (p:Personne {slug: 'charlotte-ppe'})-[:WORKS_FOR]->(s:Societe)
RETURN p.slug, p.fn, s.slug, s.fn;

// Q4 — Vérifier que les 2 tenants velo partagent la même stack
MATCH (p:Projet)-[:USES_TECH]->(t:Technologie)
WHERE p.slug IN ['velo-ppe', 'velo-ecovolt']
RETURN p.slug, collect(t.slug) AS stack
ORDER BY p.slug;

// Q5 — Documents qui décrivent velo
MATCH (d:Document)-[:DESCRIBES]->(p:Projet)
WHERE p.slug IN ['velo-ppe', 'velo-ecovolt']
RETURN d.slug, d.props.format, d.props.path, p.slug;

// Q6 — Détecter dérive silo (velo = pro uniquement)
MATCH (p:Projet)
WHERE p.slug IN ['velo-ppe', 'velo-ecovolt']
  AND p.props.silo <> 'pro'
RETURN p.slug, p.props.silo;
```

### 4.6 Conformité KG-SCHEMA.md

- **Labels utilisés** : `Projet`, `Societe`, `Personne`, `Outil`, `Document`, `Concept`, `Technologie` — tous parmi les 13 labels autorisés.
- **Prédicats utilisés** : `PART_OF`, `OWNED_BY`, `RELATED_TO`, `USES_TECH`, `LINKED_TO`, `WORKS_FOR`, `DESCRIBES` — tous parmi les 14 prédicats autorisés.
- **Slugs** : tous en kebab-case, uniques par label (constraint `(slug, type)`).
- **Props.silo** : strictement `"pro"` pour les 2 tenants velo (jamais `"perso"`, jamais `null`).

---

## 5. Intégrations

### 5.1 Connecteurs MCP

| MCP | Scope | Project ref | Variables env requises (`~/.claude/settings.json`) |
|-----|-------|-------------|----------------------------------------------------|
| **`supabase-ppe`** | Supabase prod PPE | `zfpzhhdovxllchlsihcr` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF=zfpzhhdovxllchlsihcr` |
| **`supabase-mz`** | Supabase prod Ecovolt | `irpnllwlxivlylclfjwd` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF=irpnllwlxivlylclfjwd` |
| **`monday`** | API Monday (compte John = PPE par défaut) | Workspace `CRM ENERGIE` 4852276 | `MONDAY_API_TOKEN` |
| **`github`** | GitHub repo | `skytoone55/VELO` | `GITHUB_PERSONAL_ACCESS_TOKEN` |

> ⚠️ **Le compte Monday Ecovolt** (`alexandredelannays-team`) n'est **pas** dans le MCP par défaut — accès via curl direct à l'API Monday avec le token Ecovolt (board `9990833105`).

### 5.2 Boards Monday détail

| Board ID | Nom | Tenant | Commercial / Compte | Webhook |
|----------|-----|--------|---------------------|---------|
| 2144986053 | ATHOME | PPE | crm-oreka / AtHome | non |
| 5002798369 | ALEX | PPE | crm-oreka / Alex | non |
| 2146667697 | DIZIEN | PPE | crm-oreka / Dizien | non |
| 2140187165 | EKL | PPE | crm-oreka / EKL | non |
| 2137662048 | JM | PPE | crm-oreka / JM | non |
| 5013455904 | SALIH | PPE | crm-oreka / Salih | non |
| 5001072451 | STELLARS | PPE | crm-oreka / Stellars | non |
| 9990833105 | Velos Cargos General | Ecovolt | alexandredelannays-team | **OUI** (`/api/webhooks/monday`) |

### 5.3 Gmail OAuth2

- **Compte expéditeur** : à confirmer dans `velo-details.md` (probablement compte dédié PPE / Ecovolt distinct).
- **Refresh token** : dans `.env` Vercel sous `GMAIL_REFRESH_TOKEN`.
- **Scopes** : `https://www.googleapis.com/auth/gmail.send`.
- **Watcher push** : non (envoi unidirectionnel uniquement).
- **Timeouts** : 10s `getAccessToken`, 15s SMTP envoi (`lib/email/gmail.ts`).

### 5.4 Webhooks

| Endpoint | Trigger | Sécurité |
|----------|---------|----------|
| `/api/webhooks/monday` (POST) | Monday item update (Ecovolt board uniquement) | Challenge handshake Monday + payload validation par item ID |
| `/api/livraisons/confirm-creneau` (GET) | Lien email client | `token_livraison` (UUID unique) en query string |
| `/api/livraisons/cancel-creneau` (GET) | Lien email client | idem |
| `/api/formulaire/validate-token` (POST) | Submit formulaire | `token_formulaire` |
| `/api/documents/validate-token` (POST) | Upload documents | `token_documents` |

> ⚠️ **Webhook retrait Ecovolt (commit `73df69f`, 2026-03-13)** : le webhook **force `mode_livraison='retrait'`** (jamais domicile), priorise `depot_retrait_id`. 8 livraisons existantes ont été corrigées en DB lors de la migration. Cf. piège §6 G-7.

### 5.5 Variables d'environnement critiques

**`.env.local` (NE PAS COMMITER)** — variables par tenant (à dupliquer dans Vercel) :

| Variable | Usage | Diffère par tenant ? |
|----------|-------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase tenant | **OUI** (PPE vs Ecovolt) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon | **OUI** |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (bypass RLS, server-only) | **OUI** |
| **`NEXT_PUBLIC_TENANT_ID`** | `"ppe"` ou `"ecovolt"` | **OUI** (sélecteur) |
| `MONDAY_API_TOKEN` | Token API Monday | **OUI** (2 comptes) |
| `GMAIL_CLIENT_ID` | OAuth2 Gmail | éventuellement OUI |
| `GMAIL_CLIENT_SECRET` | OAuth2 Gmail | idem |
| `GMAIL_REFRESH_TOKEN` | OAuth2 Gmail | idem |
| `GMAIL_USER` | Email expéditeur | OUI |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Clé Google Maps | non (commune) |
| `NEXT_PUBLIC_BASE_URL` | URL base app | OUI |

**`.env.example` versionné** : contient les NOMS sans valeurs.

#### Variables d'environnement Vercel — détail par tenant

**Vercel `velo-ecovolt`** (12 vars, toutes "All Environments", corrigées 2026-03-04) :

| Variable | Valeur (résumé) |
|----------|-----------------|
| `NEXT_PUBLIC_TENANT_ID` | `ecovolt` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://irpnllwlxivlylclfjwd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_Ll_6Ha1lwUqKYyx0Nt51wA_*` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_lpvxlHGLu_tuB4YABASg9Q_*` (service_role, server only) |
| `NEXT_PUBLIC_APP_URL` | `https://velo-ecovolt.vercel.app` |
| `MONDAY_API_KEY` | JWT Monday compte alexandredelannays |
| `MONDAY_BOARD_ID` | `9990833105` |
| `GMAIL_USER` | `admin@eco-volt.fr` |
| `GMAIL_CLIENT_ID` | `978639136402-...` |
| `GMAIL_CLIENT_SECRET` | `GOCSPX-...` |
| `GMAIL_REFRESH_TOKEN` | `1//04o10R4K...` |
| `RESEND_API_KEY` | `re_b8R4wTp3_...` |
| `ECOVOLT_RETRAIT_WEBHOOK_SECRET` | secret partagé avec l'app `ecovolt-retrait.vercel.app` |

**Vercel `velo-ppe`** (à compléter — il manque `MONDAY_API_KEY` + `MONDAY_BOARD_IDS` côté Vercel selon notes 2026-03-04) :

| Variable | Valeur (résumé) |
|----------|-----------------|
| `NEXT_PUBLIC_TENANT_ID` | `ppe` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zfpzhhdovxllchlsihcr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_-eV40xJPpPxRA308jeoGzQ_*` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_JvgUBGsqRlCU--Dom9MQXA_*` |
| `NEXT_PUBLIC_APP_URL` | `https://velo-ppe.vercel.app` |
| `SMTP_HOST` | `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `velo-cargo@patrimoine-energie.fr` |
| `SMTP_SECURE` | `false` (STARTTLS) |
| `SMTP_PASS` | (à remplir) |
| `MONDAY_API_KEY` | (à ajouter) — compte crm-oreka |
| `MONDAY_BOARD_IDS` | (à ajouter) — array 7 IDs |

> ⚠️ **Token Monday access** pour MCP Supabase PPE : `sbp_8ff1c47744c5884e41235f838e16bfad64af0fd7` (org PPE-VELO-CARGO, corrigé 2026-03-06).

#### Procédure rotation env var Vercel

1. Connexion Vercel → projet (PPE ou Ecovolt) → Settings → Environment Variables.
2. Modifier la variable → "All Environments" cochée.
3. Redéployer : `POST /v13/deployments?teamId=team_CllAyX2TDMf5yvHjuuVkLEWv&forceNew=1` avec `deploymentId` du dernier deploy.
4. Smoke test prod après 30s.

### 5.6 Repository GitHub

- **Repo** : `skytoone55/VELO` (**casse exacte**, attention majuscules — différent de `velo` minuscule).
- **Branche prod** : `main`.
- **Méthode push recommandée** : **`git clone` + CLI** (commit signé `skytoone55`). **`mcp__github__push_files` est À ÉVITER pour velo** car les fichiers contiennent des **accents UTF-8** dans les commentaires/labels, et l'API GitHub corrompt l'encodage.
- **Webhook Vercel** : actif sur `main` → déploie les 2 projets Vercel automatiquement (PPE + Ecovolt en parallèle).

### 5.7 Déploiement Vercel

**2 projets Vercel distincts** (1 par tenant) :

| Projet Vercel | Tenant | Domaine prod | Env vars distinctes |
|---------------|--------|--------------|---------------------|
| `velo-ppe` (ou `velo`) | PPE | `https://velo-ppe.vercel.app` (ou domaine custom) | `NEXT_PUBLIC_TENANT_ID=ppe` + clés Supabase PPE + Monday PPE |
| `velo-ecovolt` | Ecovolt | `https://velo-ecovolt.vercel.app` (ou domaine custom) | `NEXT_PUBLIC_TENANT_ID=ecovolt` + clés Supabase Ecovolt + Monday Ecovolt |

- **Build command** : `npm run build`
- **Output directory** : `.next`
- **Install command** : `npm install`
- **Node version** : 20.x (Vercel default)

> ⚠️ **Ordre de déploiement obligatoire** : **PPE d'abord**, **Ecovolt ensuite**. Cf. §6 ordre de déploiement.

---

## 6. Garde-fous

### 6.1 Invariants métier (NE JAMAIS VIOLER)

#### G-1 — Multi-tenant strict : 2 Supabase distincts, AUCUNE query cross-tenant
- **Énoncé** : PPE et Ecovolt sont 2 projets Supabase différents (`zfpzhhdovxllchlsihcr` vs `irpnllwlxivlylclfjwd`). Aucune requête, JOIN ou export ne doit jamais croiser les deux.
- **Pourquoi** : silo de données strict, RGPD, contrats commerciaux distincts, juridictions distinctes (métropole vs DOM-TOM).
- **Comment détecter** : grep code source pour double `createClient` avec 2 URLs en hardcodé. Vérifier `lib/supabase/*` n'expose qu'**un** client par session (sélection via `NEXT_PUBLIC_TENANT_ID`).
- **Comment corriger** : si fuite détectée → blocage déploiement, audit RLS, revue PR obligatoire.

#### G-2 — `NEXT_PUBLIC_TENANT_ID` doit être figé par projet Vercel
- **Énoncé** : la variable `NEXT_PUBLIC_TENANT_ID` (valeurs `"ppe"` ou `"ecovolt"`) est lue par `lib/tenants/index.ts` → `getTenantId()` et **détermine tout le routing data**.
- **Pourquoi** : si elle est `null` ou incorrecte, le mauvais Supabase est interrogé, branding faux, fuite de données.
- **Comment détecter** : check au boot (`if (!process.env.NEXT_PUBLIC_TENANT_ID) throw`) + smoke test post-deploy qui vérifie le branding.
- **Comment corriger** : ajouter check explicite dans `tenants/index.ts`, alerter Vercel build si manquant.

#### G-3 — Toujours mentionner Réf RETINA dans les communications client
- **Énoncé** : à chaque mention d'un client Velo/Ecovolt (mail, WhatsApp, doc), inclure systématiquement **`Réf RETINA: <reference_retina>`**.
- **Pourquoi** : feedback `memory/feedback_velo_retina.md` — c'est l'identifiant externe utilisé par PPE/Ecovolt pour tracer le dossier.
- **Comment détecter** : revue templates email + recherche grep dans `lib/email/*.ts` du pattern "Réf RETINA".
- **Comment corriger** : ajouter le champ dans tous les templates email (formulaire, livraison, relance, confirmation).

#### G-4 — Charlotte Pochet = Charlotte PPE (pas un autre prénom)
- **Énoncé** : quand on parle de "Charlotte" dans le contexte velo, c'est toujours **Charlotte Pochet** (PPE), pas Charlotte autre.
- **Pourquoi** : feedback `memory/feedback_charlotte.md`. Confusion possible avec autres "Charlotte" du KG.
- **Comment détecter** : KG query `MATCH (p:Personne {slug: 'charlotte-ppe'})` → vérifier props `nom='Pochet', societe='ppe-energie'`.
- **Comment corriger** : utiliser slug `charlotte-ppe` systématiquement dans toute ingestion KG ou doc.

#### G-5 — JAMAIS de sync Monday → Supabase automatique (depuis 2026-03-13)
- **Énoncé** : le sync **Monday → Supabase** est **désactivé en automatique** depuis 2026-03-13 (causait des écrasements de données Supabase par Monday obsolète). Seul le sens **Supabase → Monday** est actif.
- **Pourquoi** : Monday avait des champs vieux qui écrasaient des données Supabase fraîchement saisies par les agents.
- **Comment détecter** : grep `direction='monday_to_supabase'` dans `sync_monday_log` doit retourner 0 entrées récentes (sauf manuel super_admin).
- **Comment corriger** : si réactivé par erreur, killer le job + audit `donnees_avant/apres` pour rollback.

#### G-6 — `is_super_admin = true` : 1 seul utilisateur autorisé (réservé à John)
- **Énoncé** : la table `users_profile` a une UNIQUE constraint sur `is_super_admin = true`. **Un seul** profil avec ce flag par base. Réservé à **Jonathan Malai** (`malai.jonathan@gmail.com`).
- **Pourquoi** : éviter les escalades de privilèges. Les autres super_admin (associés) ont `role='super_admin'` mais `is_super_admin=false` — ils ont accès fonctionnel total mais pas aux super-droits cross-tenant.
- **Liste actuelle** (MAJ 2026-04-27) :
  - `malai.jonathan@gmail.com` — Jonathan Malai — **PPE + Ecovolt** — `is_super_admin=true`
  - `oliviermalai@me.com` — Olivier Malai — PPE + Ecovolt — `is_super_admin=false` — `est_aussi_livreur=true`
  - `olivier@eco-volt.fr` — Olivier Fontaine — **Ecovolt UNIQUEMENT** — `is_super_admin=false` (créé 2026-04-27)
- **Comment détecter** : `SELECT count(*) FROM users_profile WHERE is_super_admin = true` doit retourner ≤ 1 par base.
- **Comment corriger** : DB constraint déjà en place (cf. migration `20260307_user_roles_overhaul`).

#### G-7 — Webhook retrait Ecovolt : `mode_livraison` forcé à `'retrait'`
- **Énoncé** : le webhook Monday → Supabase Ecovolt **force** `mode_livraison='retrait'` (jamais `'domicile'`), même si l'agent commercial a coché autre chose dans Monday.
- **Pourquoi** : Ecovolt fait du retrait au dépôt en DOM-TOM, pas de livraison domicile (commit `73df69f`, 2026-03-13).
- **Comment détecter** : `SELECT count(*) FROM livraisons WHERE mode_livraison = 'domicile'` sur projet Ecovolt doit être 0 sauf cas exceptionnels manuels.
- **Comment corriger** : check dans le handler webhook (`/api/webhooks/monday`), surécriture systématique pour Ecovolt.

#### G-8 — CQ lock obligatoire avant modification (sauf super_admin)
- **Énoncé** : pour modifier les checkboxes CQ d'une livraison (`cq_*`), un agent doit d'abord prendre le lock (`POST /api/admin/controle/[id]/lock`). Le super_admin peut bypass.
- **Pourquoi** : éviter les modifications concurrentes. Commit `ba1476d` (2026-03-12).
- **Comment détecter** : tester PATCH sans lock préalable → doit renvoyer 423 Locked.
- **Comment corriger** : middleware sur `/api/admin/controle/[id]/check` qui vérifie `cq_pris_par = user.id` ou role super_admin.

#### G-9 — `date_livraison_effective` : timezone-naive, ajouter 'Z' avant `new Date()`
- **Énoncé** : la colonne `date_livraison_effective` est `timestamp WITHOUT time zone`. PostgreSQL renvoie sans 'Z'. Le navigateur l'interprète en heure locale → décalage.
- **Pourquoi** : commit `958e2dd` (2026-03-13). Ajout 'Z' manuel avant `new Date()` si absent.
- **Comment détecter** : tests E2E qui comparent date affichée vs date stockée.
- **Comment corriger** :
  ```typescript
  const dateStr = livraison.date_livraison_effective;
  const dateObj = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  ```

#### G-10 — `pin-filters` race condition : guard `filtersReady`
- **Énoncé** : les pages utilisant `pin-filters.tsx` (livraisons, clients, alertes) doivent attendre `filtersReady=true` avant de fetch, sinon fetch initial avec mauvais filtres.
- **Pourquoi** : commit du 2026-03-12 (v4) — sinon, fetch lance avant chargement localStorage des filtres figés.
- **Comment détecter** : tests E2E sur pages avec pin-filters.
- **Comment corriger** : pattern `if (!filtersReady) return null;` avant le `useEffect(fetch)`.

#### G-11 — API routes : `createAdminClient()` obligatoire (jamais `createClient()`)
- **Énoncé** : dans les routes `/api/admin/*` et `/api/*` qui doivent bypasser la RLS, utiliser **uniquement** `createAdminClient()` (`lib/supabase/admin.ts`, service_role). `createClient()` côté API renvoie un client soumis à RLS et **bloque silencieusement** les requêtes.
- **Pourquoi** : `service_role` bypass RLS, mais `anon_key` est filtré sans erreur explicite.
- **Comment détecter** : grep `createClient()` dans `app/api/**/*.ts` → doit être absent (sauf cas client public auth).
- **Comment corriger** : remplacer par `createAdminClient()` + retirer le check RLS implicite.

#### G-12 — RLS active sur toutes les tables (pas de fallback DENY ALL contourné)
- **Énoncé** : toutes les tables Supabase ont **RLS activée** par défaut (DENY ALL). Les politiques permissives sont écrites pour chaque rôle.
- **Pourquoi** : sécurité défense en profondeur. Cas migration `20260123_fix_rls_infinite_recursion` + `20260311_fix_agent_rls_depot_ids`.
- **Comment détecter** : `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'` → toutes à `true`.
- **Comment corriger** : ne **jamais** désactiver RLS sur une table (utiliser `service_role` côté API si bypass nécessaire).

#### G-13 — Ordre déploiement : PPE d'abord, Ecovolt ensuite
- **Énoncé** : lors d'un déploiement multi-tenant (push `main`), les 2 projets Vercel se déclenchent en parallèle, **mais la validation manuelle se fait PPE en premier** (smoke test), Ecovolt ensuite.
- **Pourquoi** : PPE = volume principal, Ecovolt = correctifs spécifiques fragiles (webhook retrait, FNUCI). Si PPE casse, on rollback les 2.
- **Comment détecter** : convention humaine. Notification WhatsApp obligatoire après chaque deploy avec smoke OK.

### 6.2 Ordre de déploiement (procédure stricte)

1. **Pré-flight** : `npm run lint` + `npm run typecheck` en local → 0 erreur.
2. **Migrations Supabase** : `supabase migration up` sur **PPE puis Ecovolt** (séquentiel, jamais en parallèle pour debug). MCP : `mcp__supabase-ppe__apply_migration` puis `mcp__supabase-mz__apply_migration`.
3. **Smoke test local** : `npm run dev` avec `NEXT_PUBLIC_TENANT_ID=ppe` puis `=ecovolt`. Login + 1 fiche client + 1 livraison → OK.
4. **Push GitHub** : `git push origin main` (CLI, **pas** `mcp__github__push_files` à cause des accents UTF-8 — cf. `MEMORY.md`).
5. **Vercel build** : surveiller les 2 dashboards (`velo-ppe` + `velo-ecovolt`) jusqu'à `Ready`.
6. **Smoke test prod PPE en premier** : `https://velo-ppe.vercel.app` → login + 1 fiche client. Si KO → rollback.
7. **Smoke test prod Ecovolt** : `https://velo-ecovolt.vercel.app` → login + webhook retrait test.
8. **Notification** : `[JARVIS - velo] Déploiement PPE+Ecovolt OK. Commit <sha>. Smoke test PASS.` via WhatsApp + email résumé.

### 6.3 RLS (Row Level Security)

- **Politique par défaut** : DENY ALL sur toutes les tables.
- **Tables avec RLS active** : 100 % (clients, livraisons, depots, users_profile, tournees, naf_codes, monday_*, livreur_agents, workflow_transitions, audit_log, sync_monday_log, formulaires_log, email_alerts, distances_cache, clients_hors_zone, user_societes).
- **Politiques critiques** :
  - `clients` : `super_admin/admin` lecture+écriture totale ; `agent_secteur` filtré par `depot_id IN auth.user.depot_ids[]` ; `livreur` lecture seule + own livraisons.
  - `livraisons` : idem + `livreur` ne voit que `livreur_id = auth.uid()`.
  - `users_profile` : self-read + admin-only update.
  - `monday_field_mapping` : super_admin/admin uniquement.
- **Service role** : utilisé exclusivement dans `app/api/admin/*` et `app/api/*` server-side via `createAdminClient()`. **JAMAIS côté client (browser)**.

### 6.4 Pièges connus (détectés en production)

- **Piège 1 — `mcp__github__push_files` corrompt les accents UTF-8** : utiliser `git clone + push` CLI uniquement. Symptôme : labels avec `é è à` deviennent `Ã©`. Fix : commit en CLI.
- **Piège 2 — `cookies()` sync vs async dans Next 15** : `lib/supabase/server.ts` doit utiliser `await cookies()` (async dans App Router 15+). Sinon, build break.
- **Piège 3 — RLS recursion infinie** : si politique `users_profile` fait référence à `users_profile` → recursion. Fix migration `20260123_fix_rls_infinite_recursion`. Toujours utiliser `auth.uid()` direct, pas de subquery sur `users_profile`.
- **Piège 4 — agent_secteur ne voit pas livraisons sans `depot_id`** : il fallait ajouter `depot_id` dans `bypass-livraison`. Commit `ba1476d` (2026-03-12). Fix : forcer `depot_id` à la création.
- **Piège 5 — FNUCI double verrou (retiré 2026-03-13)** : avant, le webhook retrait empêchait modif si FNUCI déjà saisi. Retiré (commit `ba1476d`) — maintenant CI stockée sur livraison + 7 livraisons migrées.
- **Piège 6 — `uploadToStorage` invalidait fichiers < 100 octets** : photos vides accidentellement uploadées. Fix : validation taille minimum + accepter URL/data URI/base64.
- **Piège 7 — `date_livraison_effective` timezone** (cf. G-9). Reproduit régulièrement si dev oublie le 'Z'.
- **Piège 8 — pin-filters race** (cf. G-10). Page liste clients/livraisons/alertes affiche ALL avant de filtrer.

### 6.5 Tests obligatoires

- **Lint** : `npm run lint` (eslint + Next.js rules) → 0 erreur.
- **Typecheck** : `npm run typecheck` (tsc --noEmit) → 0 erreur.
- **Tests unitaires** : **non implémentés actuellement** (chantier P2 backlog).
- **Tests E2E** : **non implémentés** (chantier P2, cible Playwright).
- **Smoke test prod** :
  - PPE : `curl -I https://velo-ppe.vercel.app/api/health` → 200 (à créer si absent).
  - Ecovolt : idem.
  - Login + 1 fiche client + 1 livraison test sur les 2 tenants après chaque deploy.

### 6.5.bis Différences techniques PPE vs Ecovolt — synthèse opérationnelle

| Aspect | PPE | Ecovolt |
|--------|-----|---------|
| **Supabase project_ref** | `zfpzhhdovxllchlsihcr` | `irpnllwlxivlylclfjwd` |
| **MCP Claude** | `supabase-ppe` | `supabase-mz` |
| **Région Supabase** | eu-west-1 | eu-west-3 |
| **Compte Monday** | crm-oreka (John) | alexandredelannays-team |
| **Boards Monday** | 7 boards (1 par commercial) | 1 board général #9990833105 |
| **Multi-board support** | OUI (`MONDAY_BOARD_IDS` array) | NON (`MONDAY_BOARD_ID` single) |
| **Mapping Monday ↔ DB** | Dynamique (table `monday_field_mapping`) | Hardcodé (`MONDAY_CONFIG.columns` dans code) |
| **Email outbound** | SMTP Office365 (smtp.office365.com:587) | Gmail OAuth2 (admin@eco-volt.fr) |
| **From email** | velo-cargo@patrimoine-energie.fr | admin@eco-volt.fr |
| **Module livraison** | INTERNE (`/admin/livraisons/deliver`) | EXTERNE (app `ecovolt-retrait.vercel.app`) |
| **Webhook retrait** | NON | OUI (`/api/webhooks/retrait`) |
| **`mode_livraison` par défaut** | livraison (domicile) | **retrait forcé** (G-7) |
| **Territoires** | France métropolitaine | DOM-TOM (971/972/973/974/976) |
| **Branding** | Vert PPE Energie | Jaune Ecovolt |
| **Vercel project** | `velo-ppe` (`prj_aUBDRLrqhLkVi651OVmnbgLDaJ32`) | `velo-ecovolt` (`prj_sJjX167pGtex9Abt5SUHnWBcu6vf`) |
| **Vercel team** | MZ ENERGY (`team_CllAyX2TDMf5yvHjuuVkLEWv`) | idem |
| **URL prod** | `https://velo-ppe.vercel.app` | `https://velo-ecovolt.vercel.app` |
| **Volume clients (avr. 2026)** | ~2750 dossiers PPE | 1184 clients (100 % monday_linked + geocoded + depot_assigned) |
| **Validation NAF labels Monday** | OUI / NON / A VERIFIER (direct) | Fait → OUI, Bloqué → NON, En cours → A VERIFIER |
| **Statut commercial labels** | URSAAF PAS A JOUR, etc. (PPE-spécifiques) | Fait, En cours, Bloqué, etc. (Ecovolt-spécifiques) |
| **Carte interactive** | France métro uniquement | France + 4 DOM-TOM (Guadeloupe, Martinique, Guyane, Réunion) |
| **Dépôts (avr. 2026)** | Multiples métropole | 5 (Guadeloupe 339, Martinique 405, Réunion 296, Guyane 143, Mayotte 1) |
| **Géocodage** | api-adresse.data.gouv.fr (3 passes) | idem (supporte CP 971-976) |
| **Token Monday** | `MONDAY_API_KEY` (.env.local) — compte crm-oreka | `MONDAY_API_KEY` (.env.ecovolt.local) — compte alexandredelannays |
| **Commercial identifié par** | `monday_board_id` | email |
| **Sync Monday→Supabase** | DÉSACTIVÉ depuis 2026-03-13 (G-5) | DÉSACTIVÉ depuis 2026-03-13 (G-5) |
| **Sync Supabase→Monday** | actif (`syncClientToMonday()`) | actif (idem code, board différent) |

> ⚠️ **Règle absolue** : ne JAMAIS confondre les 2 environnements. Toute opération doit explicitement spécifier le tenant (PPE OU Ecovolt) dans les logs, commits, notifications.

### 6.6 Conventions de nommage projet (rappel §2)

- Routes API : `/api/<domaine>/<action>` (ex: `/api/admin/controle/[livraisonId]/lock`).
- Composants : PascalCase.
- Tables : snake_case pluriel.
- Migrations : `YYYYMMDD_description.sql`.
- Pas d'accents dans les noms de fichiers.

### 6.7 RBAC (5 rôles, hiérarchie par poids)

| Rôle | Poids | Scope | Default Route |
|------|-------|-------|---------------|
| `super_admin` | 100 | Tout (data, tenants, users, depots, Monday, impersonate) | `/admin/dashboard` |
| `admin` | 80 | All data dans région assignée, manage users | `/admin/dashboard` |
| `agent_secteur` | 60 | Filtré par `depot_ids[]` + `departement` | `/admin/clients` |
| `livreur` | 20 | Seulement own livraisons (`livreur_id = auth.uid()`) | `/admin/livraisons` |
| `client` | 10 | Own data uniquement | `/client/dashboard` |

**Implémentation access control** :
- Server-side : `requireRole()` (`/lib/auth/require-role.ts`) — auth + check role.
- Client-side : `useAdminUser()` hook (`admin-user-provider.tsx`) — fetch profile depuis session.
- API routes : **toujours** `createAdminClient()` (bypass RLS), JAMAIS `createClient()` (RLS bloque silencieusement).

**Permissions par rôle** (constants `lib/auth/types.ts`) :
- `super_admin` : view:all, edit:all, delete:all, manage:users, manage:depots, view:all_territories, sync:monday, export:data
- `admin` : view:all, edit:all, manage:users, view:all_territories, export:data
- `agent_secteur` : view:territory, edit:clients:territory, manage:livraisons:territory, view:reports:territory
- `livreur` : view:livraisons:assigned, edit:livraisons:assigned, upload:photos, collect:signature
- `client` : view:own_data, edit:own_profile, submit:form, view:livraisons:own

**Filtrage role-based dans API routes** :
- `agent_secteur` : `query.in('depot_id', user.depot_ids)`
- `livreur` : `query.eq('livreur_id', user.id)`
- `admin/super_admin` : aucun filtrage

**Routes protégées** (`PROTECTED_ROUTES`) :
| Path | Min Role |
|------|----------|
| `/admin` | livreur |
| `/admin/users` | admin |
| `/admin/depots` | super_admin |
| `/admin/settings` | super_admin |
| `/admin/sync` | super_admin |
| `/client` | client |

### 6.8 Workflow client (statuts) — PROCESS_STATUTS

```
controle_valide → formulaire_envoye → formulaire_valide → a_livrer → en_livraison → livre
                                                                  ↘ probleme_livraison → a_relivrer
                                                                  ↘ retractation
                                                                  ↘ anomalie
```

**10 statuts** :
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

**Transitions autorisées** (`STATUT_TRANSITIONS` dans `lib/constants.ts`) :
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

**Statuts livraison séparés** (table `livraisons.statut`) :
| Depuis | Vers |
|--------|------|
| en_attente | programmee, en_cours, annulee |
| programmee | en_cours, annulee |
| en_cours | livree, probleme, annulee |
| livree | (terminal) |
| annulee | (terminal) |
| probleme | en_cours, annulee |

**Mapping livraison → client.statut_commercial** :
| Livraison statut | Client statut_commercial |
|------------------|--------------------------|
| en_cours | en_livraison |
| livree | livre |
| probleme | probleme_livraison |

**CQ_CHECKS (6 points contrôle qualité)** :
| Key | Label | Description |
|-----|-------|-------------|
| cq_piece_identite | Pièce d'identité | Pièce d'identité du bénéficiaire vérifiée |
| cq_photo_enemat | Photo ENEMAT | Photo plaque ENEMAT présente |
| cq_signature_installateur | Signature installateur | Signature installateur présente |
| cq_signature_client | Signature client | Signature client/bénéficiaire présente |
| cq_fnuci | N° FNUCI | Enregistrement FNUCI effectué |
| cq_velo | NB vélo | État du vélo vérifié conforme |

### 6.9 API Routes — inventaire (81 routes)

Inventaire complet des 81 routes API (méthodes, rôles, auth) déplacé dans [`api-routes.md`](./api-routes.md).

**Répartition** : Admin Clients (11), Livraisons (8), CQ (4), Planning (4), Dépôts (4), Users (4), Tournées (1), NAF/FNUCI (4), Autres admin (3), Public Formulaire (9), Public Livraisons/Documents (5), Client Data (7), Monday Integration (11), Autres (6).

### 6.10 Pages — 6.12.quater Workflows opérationnels

Inventaire code et workflows opérationnels déplacés dans [`code-inventory.md`](./code-inventory.md).

**Sous-sections présentes dans `code-inventory.md`** :
- **§6.10 Pages (34)** : Admin (17), Auth (7), Client (2), Public (8)
- **§6.11 Composants (40)** : Admin, Client, Formulaire, Theme, UI (Radix/shadcn)
- **§6.12 Lib (26)** : Auth, Supabase, Email, Monday, Tenants, Formulaire, Other
- **§6.12.bis Workflow Contrôle Qualité (CQ)** : 4 étapes (lock → checks → validate → annulation) + cas particuliers
- **§6.12.ter FNUCI State Machine** : disponible → distribue → attribue → installe (+ desassigne, bloque)
- **§6.12.quater Formulaire ENEMAT** : 6 étapes Zustand store (Step1CodeEnemat → Step6Confirmation)
### 6.13 Migrations SQL (26 fichiers)

| Fichier | Description |
|---------|-------------|
| 20260114_add_depot_columns | Colonnes depot_retrait_id, depot_logistique_id sur clients |
| 20260115_add_code_enemat_saisi_to_clients | Code ENEMAT saisi par client |
| 20260115_add_code_validation | Hash code validation email |
| 20260122_add_perimetre_livraison_payant | Rayon livraison payante sur depots |
| 20260122_add_prix_livraison_payante | Prix livraison payante sur depots |
| 20260123_create_monday_field_mapping | Table monday_field_mapping + RLS |
| 20260123_fix_rls_infinite_recursion | Fix RLS récursion infinie |
| 20260123_make_siret_tolerant | SIRET nullable + non-unique |
| 20260208_add_type_livraison_mapping | Mapping type livraison dans monday_field_mapping |
| 20260209_fix_type_livraison_value_mapping | Fix value mapping uppercase |
| 20260217_add_multi_board_support | Multi-board Monday + table monday_boards + board_id sur mapping |
| 20260306_add_depot_ids_array | depot_ids[] sur users_profile |
| 20260307_user_roles_overhaul | Renommage rôles + is_super_admin + livreur_agents + departement |
| 20260308_client_documents | Documents client (attestations, tokens, urls) |
| 20260308_delivery_tournees | Table tournees + confirmation livraison + token_livraison |
| 20260308_process_client_schema | reference_retina, naf_codes table, jours_ouverture depots |
| 20260310_agent_aussi_livreur | est_aussi_livreur flag sur users_profile |
| 20260310_attestation_pdf_url | URL PDF attestation sur livraisons |
| 20260310_heure_precise | Heure précise livraison |
| 20260311_fix_agent_rls_depot_ids | Fix RLS agent depot_ids |
| 20260311_fix_rls_obsolete_roles | Fix RLS rôles obsolètes |
| 20260311_naf_codes_complete | 199 codes NAF complets dans naf_codes |
| 20260312_controle_qualite | CQ module (cq_checks booleans, cq_valide, cq_en_cours, cq_commentaire) |
| 20260312_controle_qualite_lock | CQ lock (cq_pris_par, cq_pris_at) |
| 20260316_enemat_module | Module ENEMAT (in_enemat, statut_enemat, dates depot/apf/paye/entree + table enemat_history) |
| 20260420_paiements_module | Module Paiements (commercial_code, paiement_livreur_id, commercial/livreur APF + paye + dates + paiement_notes) |
| 20260427_lot_facture_enemat | **2026-04-27** — `numero_lot_enemat` TEXT + `numero_facture_enemat` TEXT + 2 index partiels (WHERE NOT NULL). Tracage du lot ENEMAT par client + numero de facture emise. Filtres dedies pages enemat + paiements |

---

## 7. Pattern recall agent

### 7.1 Exemples question → requête → réponse

**Q1** : "Quels sont les 2 Supabase de velo ?"
- **Requête** : lecture §3.1 ou `kg_search "velo Supabase" --limit 3`.
- **Réponse type** : "PPE = `zfpzhhdovxllchlsihcr` (eu-west-1, MCP `supabase-ppe`), Ecovolt = `irpnllwlxivlylclfjwd` (eu-west-3, MCP `supabase-mz`). Multi-tenant strict, jamais de query cross."
- **Latence** : <500ms (KG) ou <100ms (lecture ARCH §3.1).

**Q2** : "Quel est le board Monday d'Ecovolt ?"
- **Requête** : lecture §5.2 ou `kg_search "Ecovolt Monday board"`.
- **Réponse type** : "Velos Cargos General #9990833105, compte `alexandredelannays-team`, 1188 items, webhook actif sur `/api/webhooks/monday`."
- **Latence** : <500ms.

**Q3** : "Comment déployer velo (les 2 tenants) ?"
- **Requête** : lecture §6.2 (ordre déploiement).
- **Réponse type** : "1) Lint+typecheck 2) Migrations Supabase PPE puis Ecovolt 3) Smoke local 4) `git push origin main` (CLI, **pas push_files** car accents UTF-8) 5) Vercel build 2 projets en parallèle 6) Smoke prod PPE en premier 7) Smoke Ecovolt 8) WhatsApp `[JARVIS - velo] OK`."
- **Latence** : <100ms.

**Q4** : "Pourquoi `mode_livraison` est-il toujours `retrait` sur Ecovolt ?"
- **Requête** : lecture §6.1 G-7.
- **Réponse type** : "Le webhook Monday → Supabase Ecovolt force `mode_livraison='retrait'` (commit `73df69f`, 2026-03-13). DOM-TOM = retrait au dépôt, pas de domicile. 8 livraisons existantes corrigées en DB."
- **Latence** : <100ms.

**Q5** : "Charlotte = qui exactement ?"
- **Requête** : lecture mémoire `feedback_charlotte.md` ou §6.1 G-4.
- **Réponse type** : "Charlotte Pochet (PPE Energie). Slug KG : `charlotte-ppe`."
- **Latence** : <50ms (mémoire).

**Q6** : "Réf RETINA d'un client ?"
- **Requête** : KG ou Supabase (`SELECT reference_retina FROM clients WHERE id = '<uuid>'`).
- **Réponse type** : "À mentionner SYSTÉMATIQUEMENT dans toute communication client. Format `Réf RETINA: <varchar>`. Cf. `feedback_velo_retina.md` + §6.1 G-3."
- **Latence** : <500ms.

**Q7** : "Pourquoi pin-filters race condition ?"
- **Requête** : lecture §6.4 piège 8 et §6.1 G-10.
- **Réponse type** : "Sans guard `filtersReady`, le fetch lance avant chargement localStorage des filtres figés → liste sans filtre. Fix 2026-03-12 v4 sur 3 pages : livraisons, clients, alertes."
- **Latence** : <100ms.

**Q8** : "Quel rôle peut faire CQ check ?"
- **Requête** : lecture §6.7 RBAC + §6.9.3 CQ routes.
- **Réponse type** : "`super_admin` et `admin` uniquement. Lock obligatoire avant modification (sauf super_admin). Cf. §6.1 G-8."
- **Latence** : <100ms.

**Q9** : "Combien de migrations SQL le projet a ?"
- **Requête** : lecture §6.13 (24 migrations) ou `ls projets/velo/supabase/migrations/`.
- **Réponse type** : "24 migrations entre 2026-01-14 (`add_depot_columns`) et 2026-03-12 (`controle_qualite_lock`). Détail par date dans §6.13."
- **Latence** : <100ms (ARCH) ou <200ms (filesystem).

**Q10** : "Quel est le Token Monday Ecovolt ?"
- **Requête** : lecture `memory/velo-details.md` section "Accès Monday Ecovolt" ou `~/.claude/projects/-Users-john-JARVIS/memory/velo-details.md`.
- **Réponse type** : "Token JWT distinct de PPE (compte alexandredelannays-team). Stocké dans `.env.ecovolt.local` → `MONDAY_API_KEY`. NON accessible via MCP Monday standard (différent workspace) — nécessite curl avec ce token. Détail complet dans `memory/velo-details.md`."
- **Latence** : <100ms (mémoire).

**Q11** : "Comment générer un PDF de livraison ?"
- **Requête** : lecture §2 (jsPDF) + `src/components/admin/delivery-module.tsx`.
- **Réponse type** : "Module `delivery-module.tsx` étape 5 — appelle `jspdf` côté client, upload vers Supabase Storage bucket `documents`, met à jour `livraisons.pdf_livraison_url`. Le bucket est par tenant (PPE OU Ecovolt jamais cross)."
- **Latence** : <500ms (lecture code).

**Q12** : "Les 2 Vercel projects sont sous quel team ?"
- **Requête** : lecture `memory/velo-details.md` section "Deployement Vercel".
- **Réponse type** : "Team MZ ENERGY (`team_CllAyX2TDMf5yvHjuuVkLEWv`). 2 projets : `velo-ppe` (`prj_aUBDRLrqhLkVi651OVmnbgLDaJ32`) et `velo-ecovolt` (`prj_sJjX167pGtex9Abt5SUHnWBcu6vf`). MCP Vercel `mcp__claude_ai_Vercel__*` connecté à cette team."
- **Latence** : <100ms.

### 7.2 Pièges agent recall (cas où l'agent se trompe régulièrement)

- **Piège recall 1** : Confondre les 2 Supabase. Symptôme : agent dit "le Supabase de velo est X". Fix : **toujours préciser PPE OU Ecovolt** + project_ref correspondant.
- **Piège recall 2** : Oublier la Réf RETINA. Symptôme : agent envoie un email sans `Réf RETINA: ...`. Fix : grep template + ajouter avant envoi (cf. G-3).
- **Piège recall 3** : Suggérer `mcp__github__push_files` pour velo. Symptôme : commits cassés à cause des accents. Fix : **toujours `git CLI`** pour velo (cf. §5.6 + MEMORY.md).
- **Piège recall 4** : Penser que sync Monday→Supabase est actif. Symptôme : agent propose de "resync depuis Monday". Fix : **désactivé depuis 2026-03-13** (G-5), ne réactiver que sur demande explicite John + audit.
- **Piège recall 5** : Confondre `mode_livraison` sur Ecovolt. Symptôme : agent dit "livraison à domicile". Fix : Ecovolt = **toujours `retrait`** (G-7).

### 7.3 Performance recall sur ce projet

- **Lecture ARCH** (`docs/ARCHITECTURE.md`, ~2400 lignes après harmonisation) : ~150-300 ms (cache OS).
- **Query KG ciblée projet** (BM25 + vecteur sur slug `velo-ppe`/`velo-ecovolt`) : ~200-500 ms.
- **Lecture mémoires dédiées** (`velo-details.md`, `velo-codebase-map.md`, `ecovolt-chantier.md`) : ~50-150 ms par fichier.
- **Limite scope** : l'agent ne lit JAMAIS `.env` direct, JAMAIS `node_modules`, JAMAIS `.next/`. Toujours via Supabase MCP (`mcp__supabase-ppe__*` ou `mcp__supabase-mz__*`) pour data live, ARCH pour structure.

---

## 8. Évolutions (changelog)

Suivi chronologique des modifications structurelles du projet. À tenir à jour à chaque chantier majeur (refactor, fix prod critique, ajout de tenant, restructuration ARCH).

| Date | Version | Modifications | Commits clés |
|------|---------|---------------|--------------|
| **2026-04-27** | v5.1 | **Module ENEMAT — colonnes lot + facture**. Migration `20260427_lot_facture_enemat.sql` (2 colonnes `numero_lot_enemat` + `numero_facture_enemat` + 2 index partiels) appliquée sur PPE et Ecovolt. **3 fix** : (1) `/api/livraisons` ajoute `statut_enemat`+`numero_lot_enemat`+`numero_facture_enemat` au SELECT du client (export Livraisons → colonne Statut ENEMAT n'était pas remontée côté Ecovolt) ; (2) plafond pagination passe de 200 à 5000 sur `/api/admin/enemat` et `/api/admin/paiements` (export tronqué à 200 même si pageSize=500) ; (3) endpoint export paiements `/api/admin/paiements/export` accepte filtres lot/facture et ajoute 2 colonnes XLSX. Pages `admin/enemat` et `admin/paiements` : 2 colonnes table + 2 popovers filtres (input texte ilike + valeurs spéciales `__any__` / `__none__`) + export. **Compte super_admin Olivier Fontaine** créé sur Ecovolt UNIQUEMENT (associé Ecovolt, mdp `Olivier75`, role super_admin, is_super_admin=false). | (en attente push) |
| 2026-04-27 | v5 | **Harmonisation gabarit canon** v1.0 (`docs/GABARITS-ARCHITECTURE.md`). Restructuration ordre des sections (Vision → Stack → Sources → Schéma KG → Intégrations → Garde-fous → Pattern recall, puis Évolutions/Roadmap/Cascade/Références). Extraction des sections Évolutions et Roadmap hors §6 (qui restait surchargée). Densification explicite multi-tenant : 2 Supabase distincts (PPE `zfpzhhdovxllchlsihcr` MCP `supabase-ppe` vs Ecovolt `irpnllwlxivlylclfjwd` MCP `supabase-mz`), 2 Vercel projects, 2 comptes Monday (crm-oreka 7 boards + alexandredelannays 1 board curl). Préservation invariants G-1 à G-13. Ajout pattern recall agent (Q1-Q8 + 5 pièges recall). | n/a (refonte doc) |
| 2026-03-13 | v4 | **5 fixes Ecovolt prod** : FNUCI double verrou retiré (fetch+display), CI stockée sur livraison + 7 livraisons migrées, `uploadToStorage` robuste (URL/data URI/base64 + validation 100 octets min), webhook retrait force `mode_livraison='retrait'` (8 livraisons corrigées en DB), page Contrôle Qualité améliorée (lien client target=_blank, tooltip FNUCI au survol quantité vélos, `fnuci_ids` ajouté au select), nom société cliquable (Clients + Livraisons), fix timezone `date_livraison_effective` (PostgreSQL renvoie sans 'Z' → ajout manuel avant `new Date()`). Sync Monday→Supabase **DÉSACTIVÉE** définitivement (G-5). | `ba1476d`, `73df69f`, `32ebe18`, `63d98cb`, `958e2dd` |
| 2026-03-12 (v4) | v4 | **Pin filters race condition** fixé sur 3 pages (livraisons, clients, alertes) — guard `filtersReady=true` avant fetch initial. **CQ lock** obligatoire (sauf super_admin) avec `cq_pris_par`/`cq_pris_at`. `bypass-livraison` ajoute `depot_id` + fix 403 pour agent_secteur. Data fix CYKA PLOMBERIE (incohérence dépôt). | (commits multiples 2026-03-12) |
| 2026-03-12 (v3) | v3 | **REWRITE complet** de `ARCHITECTURE.md` depuis le code réel (passage de doc déclarative à doc descriptive miroir codebase). 81 routes recensées, 34 pages, 40 composants, 26 lib, 24 migrations, 15 tables. Première version exhaustive (~2090 lignes). | n/a |
| 2026-03-12 (v2) | v2 | Ajout des routes CQ, planning search/unschedule bypass RLS, email timeouts (10s OAuth + 15s SMTP), `bypass-livraison`. | n/a |
| 2026-03-12 | v1 | Audit complet + introduction module CQ (`controle_qualite` + `controle_qualite_lock`) + `pin-filters.tsx` + auth guards systématiques sur 13 routes API. | migrations `20260312_*.sql` |
| 2026-03-11 | — | Auth guards sur 13 routes admin (passage de auth inline → `requireRole()`), filtrage role-based (`agent_secteur` → `depot_ids`, `livreur` → `livreur_id`), RLS fixes (`fix_rls_obsolete_roles`, `fix_agent_rls_depot_ids`), FNUCI state machine (disponible↔bloqué, distribué→bloqué, attribué→disponible), NAF codes complets (199 codes), `depot_ids[]` array sur `users_profile`. | migrations `20260311_*.sql` |
| 2026-03-08 | — | **Module livraison plein écran** (`/admin/livraisons/deliver?id=X`) : 5 étapes (vélos → FNUCI QR → vérification → signature → PDF). API deliver modifiée (`nb_velos_livres`, checklist). Migrations `nb_velos_livres`, `tournee_id`, `confirmation_statut`, table `tournees`. Deps `html5-qrcode`, `jspdf`. | migrations `20260308_*.sql` |
| 2026-03-07 | — | **User roles overhaul** : 5 rôles canoniques (super_admin/admin/agent_secteur/livreur/client), `is_super_admin` UNIQUE constraint, table `livreur_agents`, ajout `departement` sur users_profile. | migration `20260307_user_roles_overhaul.sql` |
| 2026-03-04 | — | **FIX ECOVOLT** : suppression de 6 vars PPE parasites (SMTP_*, MONDAY_BOARD_IDS) sur Vercel Ecovolt, correction Supabase/tenant/email/Monday vers bonnes valeurs Ecovolt. **NAF bidirectionnel** : ajout `validation_naf TEXT`, mapping Monday↔Supabase, UI badges OUI/NON/À vérifier, sync 2690 clients PPE. Ajout colonnes VELO CONTROL par board PPE. **Chantier Ecovolt 100 % terminé** : 1184 clients monday_linked + geocoded + depot_assigned. | n/a |
| 2026-02-25 | — | Nettoyage sécurité — retrait de 2 tokens JWT Monday.com (PPE + Ecovolt) du repo. Ajout sections Known Gaps + Changelog dans memory. | n/a |
| 2026-02-23 | — | **Validation NAF ENEMAT terminée** : 377 codes NAF croisés avec 8 boards, 3754 items traités, 81.5 % OUI / 18 % NON / 0.5 % à vérifier. Colonne "Validation NAF" créée sur chaque board. Argumentaire NAF refusés Enemat (65 codes : 56 éligibles, 9 NON éligibles). | n/a |
| 2026-02-24 | — | Enrichissement complet de la mémoire `velo-details.md` (tables, rôles, workflow, types, statuts, mappings). | n/a |
| 2026-02-15 | — | Création initiale du module multi-tenant (PPE + Ecovolt) avec branding différencié, 2 Supabase distincts, 2 projets Vercel séparés. | n/a |

**Triggers de bump version** : modification structurelle des invariants G-N, ajout/suppression de tenant, ajout >5 routes API, refonte d'un module entier (CQ, planning, livraison), changement majeur de schema (>2 tables ajoutées/modifiées).

---

## 9. Roadmap

### ✅ Fait

- ✅ **Multi-tenant PPE+Ecovolt en prod** (2026-Q1) — 2 Supabase distincts, 2 Vercel projects, branding séparé, switch via `NEXT_PUBLIC_TENANT_ID`.
- ✅ **Module livraison plein écran** (2026-03-08) — 5 étapes, scan QR FNUCI, signature électronique, PDF généré.
- ✅ **Contrôle Qualité + lock** (2026-03-12) — 6 checks, lock concurrent par agent, validation finale.
- ✅ **Pin filters race fix** (2026-03-12 v4) — guard `filtersReady` sur livraisons/clients/alertes.
- ✅ **Webhook retrait Ecovolt** (2026-03-13) — FNUCI + CI + PDF attestation, `mode_livraison='retrait'` forcé.
- ✅ **Validation NAF 199 codes** (2026-02-23) — référentiel complet, badges OUI/NON/À vérifier sur fiches.
- ✅ **Harmonisation gabarit canon** (2026-04-27) — 7 sections + Évolutions + Roadmap + Cascade + Références.
- ✅ **Désactivation sync Monday→Supabase** (2026-03-13) — Supabase = seule source de vérité.
- ✅ **Auth guards 13 routes API** (2026-03-11) — passage à `requireRole()` systématique.
- ✅ **Stabilisation Ecovolt** (2026-03-04) — 1184 clients 100 % monday_linked + geocoded + depot_assigned, 5 dépôts DOM-TOM.

### 🔄 En cours

- 🔄 **Tests E2E Playwright** (login + 1 fiche + 1 livraison par tenant) — owner : Claude, deadline : 2026-05-15, statut : 0 % (chantier P1 non démarré, déjà mentionné dans `velo-codebase-map.md` Known Gaps).
- 🔄 **Smoke test API `/api/health`** (PPE + Ecovolt) — owner : Claude, deadline : 2026-05-15, statut : 0 % (route à créer).

### ⏳ À faire (priorisé)

**P1 — bloquant** :
- ⏳ **Tests E2E Playwright** par tenant (seul projet du workspace à en avoir, mais pas encore branché). Sans ça, chaque deploy = roulette russe.
- ⏳ **Smoke test `/api/health`** pour CI Vercel : retourne 200 + version + tenant_id pour validation post-deploy.
- ⏳ **Tests unitaires `lib/auth/*`** (require-role, helpers, types) — Vitest, couverture cible 80 %.
- ⏳ **RPC atomique** pour transitions de statut (race conditions CQ lock + workflow_transitions).

**P2 — important** :
- ⏳ **Migration `nom_contact` → `contact_nom`** (deprecation aliases legacy, table `clients`).
- ⏳ **Dashboard NAF** : visualisation stats par board, taux OUI/NON, codes problématiques.
- ⏳ **Export Excel multi-tenant unifié** (super_admin only) : 1 fichier consolidé PPE+Ecovolt avec colonne tenant.
- ⏳ **Dark mode complet** sur module livraison (actuellement light only).
- ⏳ **Pagination KG live** : indexer toutes les fiches client dans Neo4j pour recall agent rapide.

**P3 — confort** :
- ⏳ **Notifications push livreur** (web push) pour nouvelles livraisons assignées.
- ⏳ **Optimisation bundle** : audit `next/bundle-analyzer`, retrait deps inutilisés.
- ⏳ **Refonte UI fiche client** : passage de tabs verticaux → onglets horizontaux + sticky header.
- ⏳ **Migration `documents_demandes` jsonb → table dédiée** (pour requêtes structurées).

### 🔮 Vision long terme

- 🔮 **Synchro Monday → Supabase RÉACTIVÉE** avec stratégie "MAJ partielle non-destructive" (whitelist colonnes safe, audit avant écrasement, dry-run obligatoire). Réversibilité complète.
- 🔮 **App mobile dédiée livreur** (PWA → React Native) pour terrain hors connexion (offline-first + sync au retour réseau).
- 🔮 **Intégration KG complète** : agent JARVIS répond aux questions sur clients/livraisons en lisant `Projet:velo-ppe`/`velo-ecovolt` + relations PART_OF + Personne (bénéficiaires) — sans toucher à Supabase direct (lecture KG uniquement).
- 🔮 **Pricing dynamique livraison payante** : algorithme géocoding + densité + jour de la semaine (actuellement forfaitaire `prix_livraison_payante`).
- 🔮 **Multi-pays** : extension à autres marchés européens (Belgique, Italie) → ajouter `pays text NOT NULL DEFAULT 'FR'` sur clients + dépôts internationaux.
- 🔮 **AI d'aide à la décision NAF** : LLM prend code APE + contexte société → suggestion OUI/NON/À vérifier avec justification (réduit la charge manuelle des 0.5 % à vérifier).

---

## 10. Cascade

Toute modification structurelle du projet `velo` (nouveau tenant, nouveau module, refonte schema, nouveau MCP, etc.) déclenche les MAJ obligatoires suivantes :

### 10.1 Cascade obligatoire (PROTOCOLES.md type 3 — projet)

1. **`projets/velo/CLAUDE.md`** — section Description, Stack, Environnement, Roadmap (si stack/société change).
2. **`projets/ARCHITECTURE.md`** (axe A) — sous-section velo §2, Tableau récap §2 (si changement repo / vercel / société).
3. **`memory/projects-registry.md`** — ligne velo (statut, stack, société).
4. **`memory/docs-registry.md`** — section docs/ velo (si nouveaux docs ajoutés).
5. **`memory/environments.md`** — section velo (MCP, boards Monday, tokens, env vars).
6. **`memory/velo-details.md`** — boards Monday, tokens, env vars Vercel (PPE+Ecovolt), résultats NAF.
7. **`memory/velo-codebase-map.md`** — carte technique fichiers (routes, tables, patterns auth).
8. **`memory/ecovolt-chantier.md`** — si modif spécifique Ecovolt (DOM-TOM, webhook retrait).
9. **`memory/MEMORY.md`** — index si nouvelle mémoire dédiée ajoutée.
10. **Ingestion KG** : `Projet:velo-ppe` et `Projet:velo-ecovolt` MAJ via `ops.ingest` ou `[REGLE domain=velo] <fait>` Telegram (props `stack`, `version`, `vercel_url`, etc.).
11. **Notif Telegram** : `[JARVIS - velo] ARCH MAJ. Stack: <X>. Tenant: PPE/Ecovolt. Commit: <sha>.`

### 10.2 Cascade spécifique multi-tenant

Toute modification touchant à un seul tenant (PPE OU Ecovolt) doit être **tracée explicitement** :

- **Modification PPE seule** → préciser dans le commit message `[PPE]`, dans la notif Telegram `[JARVIS - velo PPE]`, et dans le changelog §8 ligne dédiée `Tenant: PPE`.
- **Modification Ecovolt seule** → idem `[Ecovolt]`, `[JARVIS - velo Ecovolt]`, `Tenant: Ecovolt`.
- **Modification commune** → `[velo]`, `[JARVIS - velo]`, `Tenant: PPE+Ecovolt`.

Les modifications **commune par défaut** (pas de tag) sont acceptables mais **risquées** (oubli d'env var sur 1 des 2 Vercel) — préférer le tag explicite.

### 10.3 Cascade spécifique Ecovolt (webhook retrait)

Toute modification de `/api/webhooks/retrait` (Ecovolt UNIQUEMENT) déclenche :

1. **Test FNUCI** : lancer une livraison test avec QR scan → vérifier `cq_fnuci=true` + `fnuci_ids` rempli.
2. **Test CI capture** : photo CI → vérifier upload `documents` bucket Storage Ecovolt + URL stockée sur `livraisons.document_identite_url`.
3. **Test PDF attestation** : génération + upload bucket → URL sur `livraisons.attestation_pdf_url`.
4. **Test mode_livraison forcé** : payload Monday avec `mode_livraison='domicile'` → DB doit avoir `'retrait'` (G-7).
5. **Vérif `ECOVOLT_RETRAIT_WEBHOOK_SECRET`** : présent uniquement sur Vercel Ecovolt (jamais PPE).

### 10.4 Cascade ordre déploiement

Lors de tout `git push origin main` qui déclenche les 2 builds Vercel :

1. **Smoke test PPE** (`https://velo-ppe.vercel.app/api/health` ou route équivalente) — si KO → rollback les 2.
2. **Smoke test Ecovolt** (`https://velo-ecovolt.vercel.app/...`) — si KO mais PPE OK → rollback Ecovolt seul (Vercel "Promote previous deployment").
3. **Notification finale** : `[JARVIS - velo] Déploiement PPE+Ecovolt OK. Commit <sha>. Smoke PASS.` (ou message d'échec partiel).

### 10.5 Anti-cascade (cas où il NE FAUT PAS cascader)

- **Modification d'un test E2E** : pas besoin de toucher CLAUDE.md ni ARCH (les tests sont dans `tests/`, pas dans la doc structurelle).
- **Renommage cosmétique d'une variable interne** (sans changement d'API) : commit + push, pas de cascade doc.
- **Ajout d'un commentaire** : commit seul.
- **Modification de mémoire personnelle** (`feedback_*.md`) : pas de cascade vers ARCH (mémoires = vivantes hors structure).

---

## Références

- **Axe parent** : `/Users/john/JARVIS/projets/ARCHITECTURE.md` (Axe A — Projets business)
- **Matrice mère** : `/Users/john/JARVIS/ARCHITECTURE.md`
- **Gabarit canon** : `/Users/john/JARVIS/docs/GABARITS-ARCHITECTURE.md` v1.0
- **PROTOCOLES** : `/Users/john/JARVIS/PROTOCOLES.md`
- **MANIFESTE** : `/Users/john/JARVIS/MANIFESTE.md` (40 principes)
- **KG schema** : `/Users/john/JARVIS/docs/KG-SCHEMA.md` (13 labels + 14 prédicats)
- **CLAUDE.md projet** : `/Users/john/JARVIS/projets/velo/CLAUDE.md`
- **Mémoires dédiées** :
  - `~/.claude/projects/-Users-john-JARVIS/memory/velo-details.md` (boards Monday, tokens, env vars)
  - `~/.claude/projects/-Users-john-JARVIS/memory/velo-codebase-map.md` (carte technique fichiers, patterns auth, state machine)
  - `~/.claude/projects/-Users-john-JARVIS/memory/ecovolt-chantier.md` (plan remise en état)
  - `~/.claude/projects/-Users-john-JARVIS/memory/feedback_velo_retina.md` (Réf RETINA obligatoire)
  - `~/.claude/projects/-Users-john-JARVIS/memory/feedback_charlotte.md` (Charlotte Pochet = Charlotte PPE)
  - `~/.claude/projects/-Users-john-JARVIS/memory/environments.md` (sections PPE + Ecovolt)
- **Tracker dette** : `/Users/john/JARVIS/audit/ANOMALIES.md` (A-18 = harmonisation 5 ARCH projet)

**Versionning** :
- v5 (2026-04-27) — Harmonisation gabarit canon, 7 sections, densification multi-tenant.
- v4 (2026-03-13) — Fixes Ecovolt + sync désactivé + timezone.
- v3 (2026-03-12) — Rewrite complet depuis code.
- v2 / v1 — versions antérieures.
