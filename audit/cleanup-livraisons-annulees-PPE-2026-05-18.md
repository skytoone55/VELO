# Nettoyage livraisons annulées remplacées — PPE

**Date** : 2026-05-18 15:03 UTC
**Projet Supabase** : `zfpzhhdovxllchlsihcr` (PPE-VELO-CARGO)
**Demandé par** : John

## Contexte

Le tableau `/admin/livraisons` affichait des "doublons" apparents pour un même client : 1 ligne `annulee` + 1 ligne `livree`/`en_livraison`/`a_livrer`. C'est le pattern "annuler + re-créer une nouvelle livraison" plutôt que modifier la ligne existante. Les anciennes versions annulées polluent la vue.

## Critère de suppression

Une livraison `annulee` est **remplaçable** si elle a un successeur pour le même `client_id` avec un statut différent de `annulee`. La règle SQL :

```sql
DELETE FROM livraisons a
WHERE a.statut = 'annulee'
  AND EXISTS (
    SELECT 1 FROM livraisons l
    WHERE l.client_id = a.client_id
      AND l.statut <> 'annulee'
      AND l.id <> a.id
  );
```

## Décompte avant DELETE

| Catégorie | Nombre |
|---|---|
| Total livraisons `annulee` | 141 |
| Avec successeur (à supprimer) | **129** |
| └─ remplacées par `livree` | 46 |
| └─ remplacées par `en_livraison` | 81 |
| └─ remplacées par `a_livrer` | 3 |
| Orphelines (à conserver) | 12 |

## Sécurité

- **Aucune dépendance FK reverse** : la seule table qui pointe vers `livraisons` est `fnuci.livraison_id`. Sur les 129 candidates, **0 a un FNUCI rattaché**.
- Contraintes unicité `clients` toujours actives (siret, reference_retina, monday_item_id).

## Exemples (échantillon)

- AR36 (`5787e715`) — annulee `4a4ddcc9...` du 15/04 → remplacée par livraison `livree` du 18/05
- 24 autres clients livrés récemment avec ancienne annulée pendante (vu dans audit JSON capturé en session)

## Résultat attendu

- `SELECT COUNT(*) FROM livraisons WHERE statut='annulee'` doit passer de **141 → 12**
- Aucun impact sur clients (fiches inchangées)
- Aucun impact sur FNUCI
