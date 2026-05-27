# Workflow tournée velo PPE — Excel → planning

> **Source de vérité** pour la création d'une tournée velo sur PPE à partir d'un Excel.
> À lire automatiquement en début de session quand John dépose un fichier Excel de tournée.
> Dernière mise à jour : 2026-05-27 (issu de la session marathon velo 25→27/05).

---

## Contexte fixe (à utiliser par défaut, sauf si John dit le contraire)

- **Tenant** : PPE — Supabase `project_id = zfpzhhdovxllchlsihcr` (MCP `supabase-ppe`)
- **Livreur par défaut** : Dizien Pioger — `id = 75305638-f2d1-41a0-a8d8-21116cadd1da` (role `agent_secteur`)
- **Dépôt par défaut** : NANTE LOG — `id = 5c733b3e-a3f2-4c86-8b48-425a8a37ea27`
- **Créneau par défaut** : journée entière (base `00:00–23:59`, mail client `08:00–19:00` grâce au fix `7d542c2`)

## Infos que John fournit à chaque tournée

1. Chemin du fichier Excel (typiquement `/Users/john/Downloads/<ZONE>.xlsx`)
2. Jour de la tournée (mardi, mercredi… ou date directe)
3. **Premier client** (nom ou ref Retina) — OBLIGATOIRE, à respecter ABSOLUMENT
4. (Optionnel) Dernier client imposé, ou choix entre 2 candidats
5. (Optionnel) Livreur ou dépôt différent du défaut

## Format du fichier Excel

- Sheet unique nommée « Zone XXkm »
- Colonnes attendues : `Raison sociale`, `Réf. Retina`, `SIRET`, `Vélos validés`, `Téléphone`, `Latitude`, `Longitude` (et d'autres non utilisées : Validation NAF, Code NAF, Adresse livraison, etc.)

---

## Procédure étape par étape

### Étape 1 — Lecture + algo nearest-neighbour

- Lecture via Python + openpyxl
- Compter les clients ET les vélos totaux (vérifier avec John)
- Algo : nearest-neighbour à partir du premier client imposé, avec attraction Nantes croissante en fin de parcours
- **Nantes** : `lat = 47.2184`, `lng = -1.5536`
- **Score d'un candidat** : `dist_prev + 0.6 × progress × dist_nantes` (progress = position / N total)
- Si John impose une fin : tester les 2 fins candidates et garder celle avec le total km le plus court
- Vérifier que le nombre final de clients matche exactement la taille du fichier

### Étape 2 — Output formaté

Format **strict** (chaque ligne) :
```
N - NOM CLIENT - Ref Retina : XXXXXXXX - X vélo(s) - Tél : +33 XXXXXXXXX - Temps prochain client : ~XX min
```
- Le dernier client se termine par `Temps prochain client : Fin tournée`
- **Temps trajet** : `haversine_km × 60 / 50` (50 km/h moyenne), minimum 4 min
- Téléphone normalisé `+33 X XXXXXXXX` (enlever espaces/points/tirets, gérer le `0` initial)

Présenter à John : tournée + total clients + total vélos + alertes (trajets > 60 min).
**DEMANDER VALIDATION** avant de pousser en base.

### Étape 3 — Vérifications avant push (silencieuses si OK)

- Toutes les refs Retina existent dans `clients` PPE (sinon : signale les manquantes, ne pas inventer)
- Aucune n'a déjà une livraison active sur une autre tournée
- Le livreur existe (table `users_profile`)
- Le dépôt existe (table `depots`)

### Étape 4 — Push transactionnel (CTE SQL atomique)

```sql
WITH new_tournee AS (
  INSERT INTO tournees (date, livreur_id, depot_id, creneau_debut, creneau_fin, notes, created_at)
  VALUES ('<YYYY-MM-DD>', '<livreur_id>', '<depot_id>', '00:00', '23:59',
          'Tournée <Livreur> <jour> - <ZONE>', now())
  RETURNING id
),
ordered AS (
  SELECT * FROM (VALUES
    ('ref1', 1), ('ref2', 2), …
  ) AS t(ref, pos)
),
upd AS (
  UPDATE livraisons l
  SET creneau_date = '<YYYY-MM-DD>', creneau_heure_debut = '00:00:00', creneau_heure_fin = '23:59:00',
      livreur_id = '<livreur_id>', depot_id = '<depot_id>',
      tournee_id = (SELECT id FROM new_tournee), tournee_position = o.pos, updated_at = now()
  FROM ordered o JOIN clients c ON c.reference_retina = o.ref
  WHERE l.client_id = c.id AND l.statut = 'a_livrer' AND l.creneau_date IS NULL
  RETURNING l.id
),
ins AS (
  INSERT INTO livraisons (client_id, mode_livraison, statut, creneau_date, creneau_heure_debut, creneau_heure_fin,
                          livreur_id, depot_id, tournee_id, tournee_position,
                          adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville,
                          created_at, updated_at)
  SELECT c.id, 'livraison', 'en_livraison', '<YYYY-MM-DD>', '00:00:00', '23:59:00',
         '<livreur_id>', '<depot_id>',
         (SELECT id FROM new_tournee), o.pos,
         c.adresse_societe_ligne1, c.adresse_societe_cp, c.adresse_societe_ville,
         now(), now()
  FROM ordered o JOIN clients c ON c.reference_retina = o.ref
  WHERE NOT EXISTS (SELECT 1 FROM livraisons l WHERE l.client_id=c.id AND l.statut='a_livrer' AND l.creneau_date IS NULL)
  RETURNING id
),
sync AS (
  UPDATE clients SET statut_commercial = 'en_livraison', updated_at = now()
  WHERE id IN (SELECT c.id FROM ordered o JOIN clients c ON c.reference_retina = o.ref)
    AND statut_commercial IN ('a_livrer','formulaire_envoye')
  RETURNING id
)
SELECT (SELECT id FROM new_tournee) AS tournee_id,
       (SELECT COUNT(*) FROM upd) AS updated,
       (SELECT COUNT(*) FROM ins) AS inserted,
       (SELECT COUNT(*) FROM sync) AS statut_clients_sync;
```

**Effets automatiques** :
- Le trigger `sync_livraison_statut_on_creneau` promeut auto `a_livrer → en_livraison` quand `creneau_date` est set.
- L'index UNIQUE partiel `livraisons_client_actif_unique` empêche les doublons : si 2 jours différents pour le même client, c'est interdit, signaler à John.

### Étape 5 — Vérification post-push

- `updated + inserted = taille de la tournée` (sinon : alerte)
- `statut_clients_sync` doit matcher au moins le nombre de clients qui n'étaient pas déjà en `en_livraison`
- Donner le `tournee_id` à John

### Étape 6 — Notif Telegram DEV (1 ligne)

```bash
bash /Users/john/JARVIS/whatsapp/send-telegram-dev.sh "[JARVIS - velo] Tournée <JOUR> <ZONE> pushée : <N>c / <V>v, livreur <LIVREUR>, dépôt <DEPOT>."
```

---

## Règles métier (à respecter absolument)

1. **`velo_valide ≤ velo_devis`** toujours. Le devis est le plafond ENEMAT. Si Excel ENEMAT remonte plus, capper au devis. NE PAS aligner velo_devis vers le haut.
   → Mémoire : `feedback_velo_valide_capped_by_devis.md`

2. **`clients.statut_commercial` DOIT suivre `livraisons.statut`**. Quand une livraison passe à `en_livraison`, le statut_commercial doit suivre, peu importe `statut_formulaire`. La carte/filtres lisent uniquement `statut_commercial`.
   → Mémoire : `feedback_velo_statut_commercial_suit_livraison.md`

3. **Créneau « Journée entière »** = `00:00–23:59` en base, mail client = `08:00–19:00`. La conversion est gérée dans `send-mail-planning/route.ts`.

4. **Ne JAMAIS inventer de client ou de ref**. Si une ref n'existe pas en base : STOP et demander à John (probablement faute de frappe, mauvais export, ou client à créer).

5. **Ne JAMAIS planifier un client NAF=NON** : il devrait déjà être en `data_clients` (statut HS).

## Cas d'erreur classiques

| Erreur | Action |
|---|---|
| Refs introuvables dans `clients` PPE | Demander à John si à créer ou à skipper. Vérifier d'abord dans `data_clients` PPE (et Ecovolt). |
| Doublons mardi/mercredi (même client 2 jours) | Demander à John quel jour garder (contrainte UNIQUE bloquera sinon) |
| Téléphone manquant en base | Laisser vide dans l'output, ne pas bloquer |
| Lat/lng manquant en base | Calculer la tournée sans, signaler à John pour qu'il vérifie |
| Total vélos ≠ celui annoncé par John | Recomter ligne par ligne et présenter la différence |

## Référence — sessions précédentes

- **Semaine 26-30/05/2026 Dizien Pioger** : 5 tournées, 116 clients, 156 vélos. Tournée IDs dans `memory/sessions/2026-05-27.md` (section « Session marathon VELO PPE »).
- Doctrine NAF : `projets/velo/docs/argumentaire-naf-enemat 17-03-2026.xlsx`
- Doctrine bénévoles : `/Users/john/JARVIS/CLAUDE/velo-attestations-benevoles-localisation-2026-05-04.md`
