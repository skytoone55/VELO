# Velo — PPE Energie + Ecovolt

> **Ce projet fait partie du workspace JARVIS** (`/Users/john/JARVIS/`)
> Les regles ci-dessous s'appliquent a TOUTE session, meme ouverte dans ce sous-dossier.

## Regles JARVIS (OBLIGATOIRE)

### Identite
- **Owner** : Jonathan Malai (malai.jonathan@gmail.com)
- **Git** : user.name="Jonathan Malai", user.email="malai.jonathan@gmail.com"
- **GitHub** : skytoone55

### Cerveau JARVIS — utiliser AVANT de demander a John
- `cd /Users/john/JARVIS && python3 brain/brain.py lookup "query"` — cherche une info existante
- `cd /Users/john/JARVIS && python3 brain/brain.py remember "description" --type TYPE --project NOM` — memorise une nouvelle info
- **Types** : discovery, decision, action, resolution, milestone, insight

### Regles git (NON NEGOCIABLE)
- **JAMAIS** `--amend` sans demande explicite de John
- **JAMAIS** `--force` ou `--force-with-lease` sans confirmation
- **JAMAIS** `--no-verify` — si un hook echoue, corriger le probleme
- Toujours creer un NOUVEAU commit plutot qu'amender

### Notifications
- WhatsApp apres chaque etape importante : `source ~/.nvm/nvm.sh && cd /Users/john/JARVIS/whatsapp && node send.js --to "120363424578953514@g.us" --message "[JARVIS - NOM_PROJET] message"`
- Ne JAMAIS finir un travail significatif en silence

### Memoire
- Registre outils/connecteurs : `/Users/john/JARVIS/memory/environments.md` (lire via sous-agent)
- Chaque projet a ses connecteurs dans la section Environnement ci-dessous

> **Regles operationnelles : voir /Users/john/JARVIS/CHARTE-OPERATIONNELLE-v1.md**

## Description
- **Societe** : PPE Energie + Ecovolt (multi-tenant)
CRM et gestion commerciale pour velos-cargos electriques. Deux entites : PPE Energie (7 boards Monday.com) et Ecovolt (1 board Monday.com). Integration Monday.com pour suivi clients et validation NAF ENEMAT.

## Stack
- **Framework** : Next.js 15.5.12, React 19.2.3, TypeScript
- **UI** : Radix UI, Tailwind CSS, Lucide React
- **Backend** : Supabase
- **Integration** : Monday.com API (2 comptes distincts)
- **Scripts** : Node.js (seed, migration, validation NAF)

## Monday.com
- **PPE Energie** (compte crm-oreka) : 7 boards
  - ATHOME #2144986053, ALEX #5002798369, DIZIEN #2146667697
  - EKL #2140187165, JM #2137662048, SALIH #5013455904, STELLARS #5001072451
- **Ecovolt** (compte alexandredelannays-team) : 1 board
  - Velos Cargos General #9990833105 (1188 items)
- Mapping colonnes DIFFERENT entre PPE et Ecovolt
- Tokens API dans `~/.claude/projects/-Users-john-JARVIS/memory/velo-details.md`

## Validation NAF ENEMAT (terminee 23/02/2026)
- 377 codes NAF croises avec 8 boards, 3754 items traites
- Resultats : 81.5% eligibles (OUI), 18% non eligibles (NON), 0.5% a verifier
- Colonne "Validation NAF" creee sur chaque board

## Structure cle
```
├── src/app/              # Routes Next.js
├── scripts/
│   ├── seed-ppe-mappings.ts    # Mappings colonnes NAF par board
│   └── naf-enemat-reference.json  # Reference 377 codes NAF
├── docs/
│   └── 171 Naf Validation.xlsx  # Source NAF ENEMAT
└── supabase/
```

## Environnement
- **Supabase** : irpnllwlxivlylclfjwd — MCP `supabase-mz`
- **Vercel** : velo (compte principal)
- **GitHub** : skytoone55
- **Monday** : CRM ENERGIE (ID 4852276) — 2 comptes (crm-oreka 7 boards, alexandredelannays 1 board)
- **Email** : a confirmer
- **Autres** : validation NAF ENEMAT
> Detail complet : voir `memory/environments.md`

## Roadmap
- Dashboard de suivi NAF (visualisation des stats par board)
- Synchronisation automatique Monday → Supabase
- Alertes sur changements de statut NAF
