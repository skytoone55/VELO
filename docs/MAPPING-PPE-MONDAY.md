# MAPPING PPE ÉNERGIE - Monday.com → Supabase

## Contexte
- PPE a **7 boards Monday** (un par régie/commercial)
- Les champs communs utilisent souvent les **mêmes column IDs** ou des IDs proches
- Ce document propose le mapping pour l'interface Paramètres

---

## LÉGENDE
- ✅ = Existe sur tous les 7 boards (même ID)
- ⚠️ = Existe sur tous les boards mais IDs différents → besoin d'un mapping par board
- 🆕 = N'existe PAS sur Monday → à créer sur les 7 boards
- 🚫 = Non pertinent pour PPE (on ne mappe pas)

---

## 1. IDENTIFICATION

| Champ Supabase | Label | Monday Column | Column ID commun | Statut |
|---|---|---|---|---|
| `raison_sociale` | Raison sociale | Name | `name` | ✅ Identique partout |
| `siret` | SIRET | SIRET | Varie* | ⚠️ Voir détail |
| `reference_dossier` | Code Retina | RETINA | Varie* | ⚠️ Voir détail |
| `numero_devis` | Numéro de devis | LIENS DEVIS | Varie* | ⚠️ Voir détail |

**Détail SIRET** :
| Board | Column ID | Type |
|---|---|---|
| ATHOME | `text_mkvqtq36` | text |
| STELLARS | `text_mkvq3yka` | text |
| EKL | `numeric_mkvjym8v` | ⚠️ **numbers** |
| JM | `text_mkvq7s` | text |
| SALIH | `text_mkvq3yka` | text |
| ALEX | `text_mkvq3yka` | text |
| DIZIEN | `text_mkvq3yka` | text |

**Détail RETINA** :
| Board | Column ID |
|---|---|
| ATHOME | `text_mkvm2hb5` |
| STELLARS | `text_mkvmgppx` |
| EKL | `text_mkvmsyz1` |
| JM | `text_mkvm7z5h` |
| SALIH | `text_mkvmgppx` |
| ALEX | `text_mkvmgppx` |
| DIZIEN | `text_mkvmgppx` |

**Détail LIENS DEVIS** :
| Board | Column ID |
|---|---|
| ATHOME | `text_mkvnsxfm` |
| STELLARS | `text_mkvncce0` |
| EKL | _(pas de colonne LIENS DEVIS, il y a LIEN RETINA = `text_mkvyeyzs`)_ |
| JM | `text_mkvqhr0c` |
| SALIH | `text_mkvncce0` |
| ALEX | `text_mkvncce0` |
| DIZIEN | `text_mkvncce0` |

---

## 2. CONTACT

| Champ Supabase | Label | Monday Column | Column ID commun | Statut |
|---|---|---|---|---|
| `email` | Email agent | E-mail | Varie* | ⚠️ Voir détail |
| `email_beneficiaire` | Email client (code/formulaire) | — | — | 🆕 À créer |
| `telephone` | Téléphone | TEL | Varie* | ⚠️ Voir détail |
| `contact_nom` | Nom signataire | NOM | `text_mkvj39h` | ✅ Identique partout |
| `contact_prenom` | Prénom signataire | PRENOM | Varie* | ⚠️ Voir détail |

**Détail E-mail** :
| Board | Column ID |
|---|---|
| ATHOME | `email_mkvjx3jr` |
| STELLARS | `email_mkw56r94` |
| EKL | `email_mkvjx3jr` |
| JM | `email_mkvjx3jr` |
| SALIH | `email_mkvjx3jr` |
| ALEX | `email_mkvjx3jr` |
| DIZIEN | `email_mkvjx3jr` |

**Détail TEL** :
| Board | Column ID |
|---|---|
| ATHOME | `phone_mkvjhbnt` |
| STELLARS | `phone_mkw5e4p2` |
| EKL | `phone_mkvjhbnt` |
| JM | `phone_mkvjhbnt` |
| SALIH | `phone_mkvjhbnt` |
| ALEX | `phone_mkvjhbnt` |
| DIZIEN | `phone_mkvjhbnt` |

**Détail PRENOM** :
| Board | Column ID |
|---|---|
| ATHOME | `text_mkvje9qa` |
| STELLARS | `text_mkw6q1vb` |
| EKL | `text_mkvje9qa` |
| JM | `text_mkvje9qa` |
| SALIH | `text_mkvje9qa` |
| ALEX | `text_mkvje9qa` |
| DIZIEN | `text_mkvje9qa` |

---

## 3. ADRESSE SIÈGE

| Champ Supabase | Label | Monday Column | Column ID commun | Statut |
|---|---|---|---|---|
| `adresse_societe_ligne1` | Adresse siège | ADRESSE | `text_mkvj6f51` | ✅ Identique partout |
| `adresse_societe_cp` | Code postal siège | CODE POSTAL | `numeric_mkvjbazm` | ✅ Identique partout |
| `adresse_societe_ville` | Ville siège | VILLE | `text_mkvjgcp9` | ✅ Identique partout |

---

## 4. ADRESSE LIVRAISON

| Champ Supabase | Label | Monday Column | Statut |
|---|---|---|---|
| `adresse_livraison_ligne1` | Adresse livraison L1 | — | 🆕 À créer |
| `adresse_livraison_ligne2` | Adresse livraison L2 | — | 🆕 À créer |
| `adresse_livraison_cp` | CP livraison | — | 🆕 À créer |
| `adresse_livraison_ville` | Ville livraison | — | 🆕 À créer |

---

## 5. LIVRAISON

| Champ Supabase | Label | Monday Column | Statut |
|---|---|---|---|
| `type_livraison` | Type de livraison | — | 🆕 À créer (status) |

---

## 6. INFORMATIONS ENTREPRISE

| Champ Supabase | Label | Monday Column | Column ID commun | Statut |
|---|---|---|---|---|
| `code_ape` | Code APE/NAF | NAF | Varie* | ⚠️ Voir détail |
| `nb_salaries` | Nb salariés | NB SALARIE | `numeric_mkvjefda` | ✅ Identique partout |

**Détail NAF** :
| Board | Column ID |
|---|---|
| ATHOME | `text_mkvkhf8p` |
| STELLARS | `text_mkvk64jp` |
| EKL | `text_mkvks2a4` |
| JM | `text_mkvkj1mb` |
| SALIH | `text_mkvk64jp` |
| ALEX | `text_mkvk64jp` |
| DIZIEN | `text_mkvk64jp` |

---

## 7. VÉLOS & DEVIS

| Champ Supabase | Label | Monday Column | Column ID commun | Statut |
|---|---|---|---|---|
| `velo_devis` | Vélos devis | VELO VOULU | `numeric_mkvj879j` | ✅ Identique partout |
| `velo_valide` | Vélos validés | VELO VALIDE | `numeric_mkvj6e60` | ✅ Identique partout |

---

## 8. STATUTS

| Champ Supabase | Label | Monday Column | Column ID commun | Statut |
|---|---|---|---|---|
| `statut_commercial` | Statut commercial | Statut | `status` | ✅ Identique partout |

---

## 9. VALIDATION CLIENT (Code ENEMAT)

| Champ Supabase | Label | Monday Column | Statut |
|---|---|---|---|
| `code_enemat_saisi` | Code ENEMAT saisi | — | 🆕 À créer |
| `code_enemat_valide` | Code ENEMAT validé | — | 🆕 À créer (checkbox) |
| `date_validation_code` | Date validation | — | 🆕 À créer (date) |

---

## 10. CHAMP ADDITIONNEL PPE (info)

| Monday Column | Présent sur | Note |
|---|---|---|
| COMMERCIAL (status) | Tous les boards | Nom de la régie/commercial - utile pour identifier le board |
| STATUT SIGNATAIRE | Tous les boards (`text_mkvjtymn`) | Info signataire |
| VELO CONTROL | Tous les boards (IDs différents) | Vélos contrôlés |
| Date | Tous les boards (IDs différents) | Date du dossier |
| DOCUMENT (file) | Tous les boards | Fichiers joints |

---

## RÉSUMÉ : CHAMPS À CRÉER SUR LES 7 BOARDS

| # | Nom colonne Monday | Type Monday | Champ Supabase |
|---|---|---|---|
| 1 | EMAIL BENEFICIAIRE | email | `email_beneficiaire` |
| 2 | ADRESSE LIVRAISON | text | `adresse_livraison_ligne1` |
| 3 | ADRESSE LIVRAISON L2 | text | `adresse_livraison_ligne2` |
| 4 | CP LIVRAISON | text | `adresse_livraison_cp` |
| 5 | VILLE LIVRAISON | text | `adresse_livraison_ville` |
| 6 | TYPE LIVRAISON | status | `type_livraison` |
| 7 | CODE ENEMAT | text | `code_enemat_saisi` |
| 8 | CODE ENEMAT OK | checkbox | `code_enemat_valide` |
| 9 | DATE VALIDATION CODE | date | `date_validation_code` |

---

## ARCHITECTURE MULTI-BOARD

### Approche retenue :
Puisque les champs communs ont des **IDs qui varient** entre boards, le mapping doit être **par board**.

La table `monday_field_mapping` dans Supabase a déjà les colonnes :
- `supabase_field`
- `monday_column_id`

**Il faut ajouter** une colonne `board_id` pour avoir un mapping par board.

Chaque client Supabase aura un `monday_board_id` qui permet de savoir sur quel board il se trouve.

### Workflow :
1. Créer les 9 colonnes manquantes sur les 7 boards (via API Monday)
2. Stocker les 7 board_ids dans la config PPE
3. Pour chaque board, créer le mapping (champ Supabase → column_id du board)
4. Le système sync interroge les 7 boards et utilise le mapping du board correspondant
