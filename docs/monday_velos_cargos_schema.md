# Documentation du Tableau Monday.com - Vélos Cargos

## Informations Générales

| Propriété | Valeur |
|-----------|--------|
| **Board ID** | `9990833105` |
| **Nom** | Vélos Cargos - Général |
| **Workspace** | Vélo Cargo (ID: `12213672`) |
| **URL** | https://alexandredelannays-team.monday.com/boards/9990833105 |
| **Nombre d'éléments** | 1213 |
| **Terminologie item** | RAISON SOCIALE |

---

## Colonnes du Tableau Principal

### Tableau récapitulatif

| Column ID | Titre | Type |
|-----------|-------|------|
| `name` | Name | name |
| `subtasks_mkvxgh18` | Sous-éléments | subtasks |
| `multiple_person_mkvd4axb` | Commercial attribué | people |
| `email_mkvfk63f` | EmailAgent_RETINA | email |
| `date_mkvsxn5j` | DATE STATUT | date |
| `color_mkvfws5n` | Statut commercial | status |
| `numeric_mkvfghjq` | vélo devis | numbers |
| `long_text_mkvn5k9w` | Telephonebeneficiaire_RETINA | long_text |
| `text_mkvtxy4q` | format juridique | text |
| `text_mkvfykn9` | SIRET_RETINA | text |
| `numeric_mkvcqm0r` | Vélo confirmé | numbers |
| `file_mkvcc1r0` | URSSAF 2 pages | file |
| `file_mkvnb7yj` | Carte ID | file |
| `file_mkvn9kzj` | DSN (format EDI) | file |
| `color_mkvdkzxh` | Département | status |
| `text_mkvfxbkp` | refinternedeloperation_RETINA | text |
| `date_mkvfqvv1` | Dateengagementdevis_RETINA | date |
| `text_mkvfkr8t` | Nomsignataire_RETINA | text |
| `numeric_mkvcqwxn` | Nb Salarié URSSAF | numbers |
| `text_mkvfjqvv` | Prénomsignataire_RETINA | text |
| `text_mkvfetg2` | adresseopération_RETINA | text |
| `text_mkvfhcn9` | CPoperation_RETINA | text |
| `text_mkvfgh8t` | Villeopération_RETINA | text |
| `text_mkvft2w3` | APE/NAF_RETINA | text |
| `text_mkvf8zp6` | Numerodevis_RETINA | text |
| `text_mkvfqsxv` | devissignépdf_RETINA | text |
| `email_mkvfnv4q` | emailbeneficiaire_RETINA | email |
| `color_mkyqn153` | statut mail | status |
| `color_mkvgsswc` | StatutRETINA | status |
| `color_mkvn1kg0` | doublon_RETINA | status |
| `color_mkvp4dmz` | StatutAnomalie | status |
| `pulse_id_mkvc9y13` | Identifiant de l'élément | item_id |
| `color_mkvdek2g` | Statut Make | status |
| `pulse_log_mkvdtr77` | Journal de création | creation_log |
| `multiple_person_mkve97pm` | Équipe | people |

---

## Détail des Colonnes Status (avec labels)

### 1. Statut commercial (`color_mkvfws5n`)

| Label ID | Label | Couleur | is_done |
|----------|-------|---------|---------|
| `0` | DOSSIER COMPLET | #9cd326 | false |
| `1` | DEVIS SIGNÉ | #00c875 | **true** |
| `2` | CLIENT HS | #df2f4a | false |
| `3` | DEVIS CREE | #007eb5 | false |
| `4` | CONTROLE VALIDÉ | #9d50dd | false |
| `5` | Inconnu | #c4c4c4 | false |
| `6` | CLIENT INJOIGNABLE | #784bd1 | false |
| `7` | DOUBLON | #bb3354 | false |
| `8` | CONTROLE A REGULARISER | #ff5ac4 | false |
| `9` | AH SIGNÉE | #ffcb00 | false |
| `10` | LIVRÉ | #037f4c | false |
| `11` | PAYÈ | #cab641 | false |
| `12` | CONTROLE A JOUR | #ff007f | false |
| `13` | CLIENT CONTACTÉ | #579bfc | false |
| `14` | FRANCK | #333333 | false |

---

### 2. Département (`color_mkvdkzxh`)

| Label ID | Label | Couleur |
|----------|-------|---------|
| `0` | Réunion | #fdab3d |
| `1` | Hors DOM | #00c875 |
| `2` | Mayotte | #df2f4a |
| `3` | Martinique | #007eb5 |
| `4` | Guadeloupe | #9d50dd |
| `6` | Guyane | #037f4c |
| `7` | La Réunion | #579bfc |

---

### 3. statut mail (`color_mkyqn153`)

| Label ID | Label | Couleur |
|----------|-------|---------|
| `0` | mail 2 | #fdab3d |
| `1` | Mail FNUCI | #00c875 |
| `2` | Mail 3 | #df2f4a |

---

### 4. StatutRETINA (`color_mkvgsswc`)

| Label ID | Label | Couleur |
|----------|-------|---------|
| `0` | DEVIS CRÉÉ | #fdab3d |
| `1` | DEVIS SIGNÉ | #00c875 |
| `2` | SUPPRIMÉ | #df2f4a |

---

### 5. doublon_RETINA (`color_mkvn1kg0`)

| Label ID | Label | Couleur |
|----------|-------|---------|
| `0` | DOUBLON A ETUDIER | #fdab3d |
| `1` | DOUBLON A SUPPRIMER | #00c875 |
| `2` | OK - AUTRE DOUBLON SUPPRIME | #df2f4a |

---

### 6. StatutAnomalie (`color_mkvp4dmz`)

| Label ID | Label | Couleur |
|----------|-------|---------|
| `0` | En cours | #fdab3d |
| `1` | Fait | #00c875 |
| `2` | Bloqué | #df2f4a |
| `3` | bonification soumise au pncee | #007eb5 |
| `4` | #REF! | #9d50dd |
| `6` | #N/A | #037f4c |
| `7` | sans bonification | #579bfc |
| `8` | Supprimé de RETINA | #cab641 |

---

### 7. Statut Make (`color_mkvdek2g`)

| Label ID | Label | Couleur |
|----------|-------|---------|
| `0` | En cours | #fdab3d |
| `1` | Fait | #00c875 |
| `2` | Bloqué | #df2f4a |
| `3` | OK | #007eb5 |
| `4` | Entreprise introuvable | #9d50dd |
| `6` - `160` | (imports RETINA divers) | (divers) |

---

## Groupes du Tableau

| Group ID | Nom du Groupe |
|----------|---------------|
| `group_mkvn8ehx` | DEVIS SIGNE |
| `group_mkw98hsb` | Contrôle à Régulariser ⚠️ |
| `group_mkw9v28s` | Contrôle à jour |
| `group_mkw9nxnf` | Dossier complet pour étude |
| `group_mkw9zmr2` | Contrôle validé par le back office |

> **Note:** Le groupe par défaut (top_group) est `group_mkvn8ehx` (DEVIS SIGNE)

---

## Colonnes des Sous-éléments (Subitems)

Board des subitems: `10082173584`

| Column ID | Titre | Type |
|-----------|-------|------|
| `name` | Name | name |
| `person` | Owner | people |
| `status` | Statut | status |
| `date0` | Date | date |

### Statut des Sous-éléments

| Label ID | Label | Couleur | is_done |
|----------|-------|---------|---------|
| `0` | En cours | #fdab3d | false |
| `1` | Fait | #00c875 | **true** |
| `2` | Bloqué | #df2f4a | false |

---

## Guide de Mappage pour l'API

### Format de mise à jour des colonnes

```javascript
// Pour un champ texte
{ "column_id": "valeur" }

// Pour un champ status (utiliser le label)
{ "column_id": { "label": "DEVIS SIGNÉ" } }

// Pour un champ date
{ "column_id": { "date": "2026-01-22" } }

// Pour un champ email
{ "column_id": { "email": "email@example.com", "text": "email@example.com" } }

// Pour un champ people (utiliser les IDs utilisateurs)
{ "column_id": { "personsAndTeams": [{ "id": 12345678, "kind": "person" }] } }

// Pour un champ numbers
{ "column_id": "123" }
```

### Exemple complet de création d'item

```javascript
const columnValues = JSON.stringify({
  "text_mkvfykn9": "12345678901234",                    // SIRET
  "text_mkvfkr8t": "Dupont",                           // Nom signataire
  "text_mkvfjqvv": "Jean",                             // Prénom signataire
  "text_mkvfetg2": "123 rue Example",                  // Adresse
  "text_mkvfhcn9": "75001",                            // Code postal
  "text_mkvfgh8t": "Paris",                            // Ville
  "email_mkvfnv4q": {                                   // Email bénéficiaire
    "email": "jean.dupont@example.com",
    "text": "jean.dupont@example.com"
  },
  "color_mkvfws5n": { "label": "DEVIS CREE" },         // Statut commercial
  "color_mkvdkzxh": { "label": "Hors DOM" },           // Département
  "numeric_mkvfghjq": "2",                             // Nombre vélos devis
  "date_mkvfqvv1": { "date": "2026-01-22" }            // Date engagement devis
});
```

---

## Propriétaires du Tableau

| User ID | Nom |
|---------|-----|
| `67399288` | Alexandre Delannay |
| `68054448` | Dove Uzan |
| `72490555` | Olivier Fontaine |
| `72791840` | Jonathan Sanchez |

**Team Owner:** ADMIN ECOVOLT (ID: `1299803`)

---

## Notes Importantes

1. **Champ Name (`name`)**: C'est la RAISON SOCIALE de l'entreprise
2. **Champs _RETINA**: Ces champs sont synchronisés avec le système RETINA
3. **Filtrage par status**: Utiliser le `label_id` (numérique) avec `any_of` ou le texte avec `contains_terms`
4. **Sous-éléments**: Liés au board `10082173584`, contiennent les tâches de suivi

---

*Document généré le 22 janvier 2026*
