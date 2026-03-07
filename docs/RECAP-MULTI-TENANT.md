# RÉCAP MULTI-TENANT ECO-VOLT / PPE ÉNERGIE
> Document de transition pour reprise de contexte dans une nouvelle conversation.
> Dernière mise à jour : 17 février 2026

---

## 1. CONTEXTE GÉNÉRAL

**Propriétaire** : Jonathan Malai (malai.jonathan@gmail.com)
**Deux entreprises** qui utilisent le même système de gestion de livraisons de vélos cargo électriques :
- **ECO-VOLT** (existant, opérationnel)
- **PPE Énergie** (nouveau, en cours de configuration)

**Architecture** : Multi-tenant avec un seul codebase (Next.js 15 + Supabase). Chaque entreprise a :
- Son propre projet Supabase (base de données séparée)
- Son propre branding (logo, couleurs, textes)
- Son propre email d'envoi
- Son propre board Monday.com
- Tout est local, rien n'est déployé pour PPE

**Projet** : `/Users/john/JARVIS/velo`

---

## 2. ARCHITECTURE TECHNIQUE

### Stack
- **Framework** : Next.js 15 App Router
- **Base de données** : Supabase (PostgreSQL + Auth + RLS)
- **Emails** : Nodemailer (Gmail OAuth2 pour ECO-VOLT, SMTP Microsoft 365 pour PPE)
- **CRM** : Monday.com
- **UI** : Tailwind CSS + Radix UI + shadcn/ui
- **Déploiement ECO-VOLT** : Vercel (velo-fawn.vercel.app)
- **Déploiement PPE** : Pas encore déployé

### Système multi-tenant
- **Détermination du tenant** : variable d'env `NEXT_PUBLIC_TENANT_ID` ("ecovolt" ou "ppe")
- **Config centralisée** : `src/lib/tenants/config.ts` → contient toutes les infos par entreprise
- **Fonction principale** : `getTenantConfig()` depuis `src/lib/tenants/index.ts`
- **Thème dynamique** : `src/components/tenant-theme.tsx` → injecte les CSS variables (couleurs) au runtime
- **Layout** : `src/app/layout.tsx` inclut `<TenantTheme />`

### Scripts de lancement
```json
"dev:ecovolt": "NEXT_PUBLIC_TENANT_ID=ecovolt next dev"        → port 3000
"dev:ppe": "bash scripts/run-ppe.sh"                            → port 3003
```

Le script `scripts/run-ppe.sh` :
1. Sauvegarde `.env.local` dans `.env.local.bak`
2. Copie `.env.ppe.local` dans `.env.local`
3. Lance `next dev -p 3003`
4. À l'arrêt (Ctrl+C), restaure `.env.local` depuis `.env.local.bak`

---

## 3. FICHIERS D'ENVIRONNEMENT

### ⚠️ ÉTAT ACTUEL AU 17/02/2026 - PROBLÈME À CORRIGER

Le `.env.local` contient actuellement le contenu PPE (sans SMTP) car le script run-ppe.sh l'a remplacé et n'a peut-être pas restauré proprement.

**Action à faire au démarrage de la prochaine session** : restaurer `.env.local` avec le contenu ECO-VOLT :
```bash
cp .env.ecovolt.local .env.local
```

### Fichiers :

| Fichier | Contenu | Rôle |
|---------|---------|------|
| `.env.local` | Devrait contenir ECO-VOLT (voir problème ci-dessus) | Fichier lu par Next.js |
| `.env.ecovolt.local` | Credentials ECO-VOLT (backup) | Sauvegarde ECO-VOLT |
| `.env.ppe.local` | Credentials PPE (avec SMTP) | Config PPE, copiée par run-ppe.sh |

### ECO-VOLT (`.env.ecovolt.local`)
```
NEXT_PUBLIC_TENANT_ID="ecovolt"
NEXT_PUBLIC_SUPABASE_URL="https://irpnllwlxivlylclfjwd.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbG..." (JWT classique)
SUPABASE_SERVICE_ROLE_KEY="REDACTED"
GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN → configurés, fonctionnels
GMAIL_USER="admin@eco-volt.fr"
MONDAY_API_KEY → configuré
MONDAY_BOARD_ID="9990833105"
NEXT_PUBLIC_APP_URL="https://velo-fawn.vercel.app"
```

### PPE (`.env.ppe.local`)
```
NEXT_PUBLIC_TENANT_ID="ppe"
NEXT_PUBLIC_SUPABASE_URL="https://zfpzhhdovxllchlsihcr.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="REDACTED"
SUPABASE_SERVICE_ROLE_KEY="REDACTED"
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="velo-cargo@patrimoine-energie.fr"
SMTP_PASSWORD="REDACTED"
GMAIL_USER="velo-cargo@patrimoine-energie.fr"
MONDAY_API_KEY="TODO_PPE_MONDAY_API_KEY"          ← À CONFIGURER
MONDAY_BOARD_ID="TODO_PPE_MONDAY_BOARD_ID"        ← À CONFIGURER
NEXT_PUBLIC_APP_URL="http://localhost:3003"
```

---

## 4. SUPABASE

### ECO-VOLT
- **Project ID** : `irpnllwlxivlylclfjwd`
- **URL** : https://irpnllwlxivlylclfjwd.supabase.co
- **Compte MCP connecté** : Oui (accessible via les outils MCP Supabase)
- **Status** : Opérationnel, données en production

### PPE
- **Project ID** : `zfpzhhdovxllchlsihcr`
- **URL** : https://zfpzhhdovxllchlsihcr.supabase.co
- **Compte MCP connecté** : Non (compte Supabase différent, pas accessible via MCP)
- **Status** : Base initialisée, structure identique à ECO-VOLT

### Structure de la base (14 tables, identiques sur les deux) :
1. `users_profile` - Profils utilisateurs (rôles, territoires)
2. `depots` - Points de retrait/livraison
3. `clients` - Entreprises clientes (lien Monday)
4. `livraisons` - Suivi des livraisons
5. `codes_enemat` - Codes de validation
6. `user_societes` - Liaison users ↔ clients
7. `distances_cache` - Cache distances client-dépôt
8. `clients_hors_zone` - Clients hors zone de couverture
9. `audit_log` - Journal d'audit
10. `formulaires_log` - Journal des formulaires
11. `email_alerts` - Alertes email
12. `monday_field_mapping` - Mapping champs Monday
13. `sync_monday_log` - Log synchronisation Monday
14. `workflow_transitions` - Transitions de statut

**Fonction helper** : `is_admin()` - vérifie si l'utilisateur a un rôle admin/agent
**RLS** : Toutes les tables ont RLS activé avec des politiques par rôle

### SQL d'initialisation PPE
- Fichier : `/Users/john/JARVIS/velo/supabase/ppe-init.sql`
- Déjà exécuté avec succès sur Supabase PPE
- Bug corrigé : la fonction `is_admin()` doit être APRÈS la table `users_profile`

### Compte admin PPE
- **Email** : malai.jonathan@gmail.com
- **Mot de passe** : @Crm1532
- **Rôle** : admin_general
- **User ID Supabase** : 38700cae-cae1-43dc-87e7-87bab980f86a
- Script de création : `scripts/create-admin-ppe.ts`

### Compte admin ECO-VOLT
- **Email** : malai.jonathan@gmail.com
- **Mot de passe** : @Crm1532
- **Rôle** : admin_general
- **User ID Supabase** : 35bd73da-726e-45fa-865a-a237e18a8396

---

## 5. EMAIL

### ECO-VOLT → Gmail OAuth2 (FONCTIONNEL)
- Adresse : admin@eco-volt.fr
- Méthode : Google OAuth2 via googleapis + nodemailer
- Variables : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

### PPE → Microsoft 365 SMTP (EN ATTENTE)
- Adresse : velo-cargo@patrimoine-energie.fr
- Méthode : SMTP direct via smtp.office365.com:587
- Mot de passe du compte : Roca6140
- **BLOQUÉ** : Erreur 5.7.139 - Le SMTP AUTH est désactivé par la politique de sécurité de l'organisation Microsoft 365

### Action en cours
Jonathan a contacté son service informatique pour faire activer le SMTP AUTH sur le compte `velo-cargo@patrimoine-energie.fr`.

**Ce qu'il faut faire côté Microsoft 365 admin** :
- Centre d'administration Exchange → Destinataires → Boîtes aux lettres
- Sélectionner velo-cargo@patrimoine-energie.fr
- Courrier → Gérer les applications de messagerie → Activer "SMTP authentifié"
- Ou PowerShell : `Set-CASMailbox -Identity "velo-cargo@patrimoine-energie.fr" -SmtpClientAuthenticationDisabled $false`

### Code email
- Fichier : `src/lib/email/gmail.ts`
- La fonction `createTransporter()` détecte automatiquement la méthode :
  - Si `SMTP_HOST` est défini → SMTP direct (Microsoft 365)
  - Sinon → Gmail OAuth2
- Tous les templates email utilisent déjà `getTenantConfig()` pour le branding dynamique

---

## 6. MONDAY.COM

### ECO-VOLT
- Board ID : 9990833105
- API Key : configurée et fonctionnelle

### PPE → À CONFIGURER
- Pas encore de board Monday créé
- Il faut :
  1. Créer un board Monday pour PPE (ou dupliquer celui d'ECO-VOLT)
  2. Récupérer le Board ID
  3. Récupérer/créer une API Key Monday pour PPE
  4. Mettre à jour `.env.ppe.local` avec MONDAY_API_KEY et MONDAY_BOARD_ID
  5. Configurer le mapping des champs via l'interface admin (/admin/monday/mapping)

---

## 7. FICHIERS CLÉS MODIFIÉS

### Architecture multi-tenant
| Fichier | Description |
|---------|-------------|
| `src/lib/tenants/config.ts` | Configs ECO-VOLT et PPE (nom, couleurs, logo, legal, etc.) |
| `src/lib/tenants/index.ts` | getTenantConfig(), getTenantId(), etc. |
| `src/components/tenant-theme.tsx` | Injection dynamique des CSS variables |
| `scripts/run-ppe.sh` | Script de lancement PPE (swap .env.local) |
| `scripts/create-admin-ppe.ts` | Création admin dans Supabase PPE |

### UI dynamique (hardcoded ECO-VOLT → tenant config)
| Fichier | Ce qui a changé |
|---------|-----------------|
| `src/components/admin/admin-nav.tsx` | Logo + nom dynamiques |
| `src/components/client/client-nav.tsx` | Logo + nom dynamiques |
| `src/app/auth/login/page.tsx` | Logo + nom dynamiques |
| `src/app/auth/register/page.tsx` | Logo + nom dynamiques |
| `src/app/api/formulaire/validate-enemat/route.ts` | Message d'erreur dynamique |
| `src/app/admin/depots/page.tsx` | Email placeholder générique |
| `src/app/layout.tsx` | Ajout TenantTheme + metadata dynamique |

### API / Backend
| Fichier | Ce qui a changé |
|---------|-----------------|
| `src/lib/email/gmail.ts` | Support SMTP + Gmail OAuth2 auto-détecté |
| `src/app/api/monday/mapping/route.ts` | Import INTERFACE_FIELDS depuis lib |
| `src/app/api/formulaire/submit/route.ts` | Fix type TypeScript |

### Assets
| Fichier | Description |
|---------|-------------|
| `public/logos/ppe.png` | Logo PPE haute qualité (copié depuis Dropbox) |
| `public/logos/ecovolt.png` | Logo ECO-VOLT (existant) |

---

## 8. PPE - INFOS ENTREPRISE

- **Nom** : PRESERVATION DU PATRIMOINE ENERGIE (PPE)
- **Nom commercial** : PPE Énergie
- **Email** : velo-cargo@patrimoine-energie.fr
- **Téléphone** : 09 74 16 14 00
- **Adresse** : 99 RUE DU MOULIN DES LANDES, 44980 SAINTE-LUCE-SUR-LOIRE
- **Forme juridique** : SAS
- **Capital** : 100 000 €
- **RCS** : Nantes 844518951000018
- **TVA** : FR91844518951
- **APE** : 4321A
- **SIRET** : 84451895100018

---

## 9. CE QUI RESTE À FAIRE

### 🔴 Prioritaire
1. **Restaurer .env.local** avec le contenu ECO-VOLT : `cp .env.ecovolt.local .env.local`
2. **Email PPE** : Attendre que le service informatique active SMTP AUTH, puis retester :
   ```bash
   cd /Users/john/JARVIS/velo && node -e "
   const nodemailer = require('nodemailer');
   const t = nodemailer.createTransport({host:'smtp.office365.com',port:587,secure:false,auth:{user:'velo-cargo@patrimoine-energie.fr',pass:'Roca6140'}});
   t.sendMail({from:'PPE Énergie <velo-cargo@patrimoine-energie.fr>',to:'malai.jonathan@gmail.com',subject:'Test PPE',html:'<p>Test OK</p>'}).then(i=>console.log('OK:',i.messageId)).catch(e=>console.log('ERROR:',e.message));
   "
   ```
3. **Monday.com PPE** : Créer/configurer le board + API key + mapping des champs

### 🟡 À vérifier / améliorer
4. **Qualité logo PPE** : L'utilisateur a signalé que le logo était de mauvaise qualité malgré le remplacement (probable cache navigateur). Vérifier en vidant le cache.
5. **Favicon PPE** : Référencé comme `/favicon-ppe.ico` dans config.ts mais pas sûr qu'il existe.
6. **Tests complets PPE** : Tester tout le parcours (login, dashboard, formulaire client, livraisons) avec la base PPE.

### 🟢 Futur
7. **Déploiement PPE** sur Vercel (ou autre) avec son propre domaine
8. **Configuration email** : Si SMTP reste bloqué, envisager OAuth2 Microsoft (Azure AD App Registration)

---

## 10. INSTRUCTIONS IMPORTANTES DE L'UTILISATEUR

- **"Tout en local, on déploie rien"** → Ne jamais push ni déployer sans demande explicite
- **"On touche pas au système actuel"** → ECO-VOLT ne doit JAMAIS être affecté
- **"Sois soigneux"** → Toujours vérifier les effets de bord
- **"Réfléchis à tout en effet de masse"** → Anticiper les impacts sur tout le codebase
- **"Arrête de me demander de lancer les serveurs"** → Lancer directement les commandes via Terminal/AppleScript, ouvrir le navigateur automatiquement
- **"Ne jamais changer de mot de passe sans demander"** → Incident lors de cette session où les mots de passe ont été changés sans avertissement clair
- **L'utilisateur préfère** qu'on fasse les choses directement plutôt que de lui donner des instructions à exécuter

---

## 11. HIÉRARCHIE DES RÔLES

| Rôle | Niveau | Description |
|------|--------|-------------|
| admin_general | 100 | Accès total |
| admin_regional | 80 | Gestion régionale |
| agent_regional | 60 | Agent régional |
| agent_depot | 40 | Gestion d'un dépôt |
| livreur | 20 | Livreur |
| client | 10 | Client (auto-inscription) |
