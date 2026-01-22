# Configuration Webhook Monday.com

## Contexte
- **Board Monday** : `9990833105` (Vélos Cargos - Général)
- **URL Webhook** : `https://velo-fawn.vercel.app/api/webhooks/monday`
- Monday = source de vérité, Supabase = miroir local

---

## Ta mission (Claude Chat avec MCP Monday)

Tu dois configurer un webhook dans Monday.com pour que chaque modification soit envoyée automatiquement à notre API.

### Étape 1 : Créer le webhook via l'API Monday

Utilise ton accès MCP Monday pour exécuter ces mutations GraphQL :

```graphql
# Webhook pour les modifications de colonnes
mutation {
  create_webhook(
    board_id: 9990833105,
    url: "https://velo-fawn.vercel.app/api/webhooks/monday",
    event: change_column_value
  ) {
    id
    board_id
  }
}
```

```graphql
# Webhook pour la création d'items
mutation {
  create_webhook(
    board_id: 9990833105,
    url: "https://velo-fawn.vercel.app/api/webhooks/monday",
    event: create_item
  ) {
    id
    board_id
  }
}
```

```graphql
# Webhook pour le changement de nom
mutation {
  create_webhook(
    board_id: 9990833105,
    url: "https://velo-fawn.vercel.app/api/webhooks/monday",
    event: change_name
  ) {
    id
    board_id
  }
}
```

### Étape 2 : Vérifier les webhooks créés

```graphql
query {
  webhooks(board_id: 9990833105) {
    id
    event
    board_id
  }
}
```

Tu devrais voir 3 webhooks :
- `change_column_value`
- `create_item`
- `change_name`

---

## Ce qui se passe ensuite (fait par John manuellement)

1. **Déployer sur Vercel** avec les variables d'environnement
2. **Lancer la sync initiale** via l'API `/api/sync/monday`
3. **Tester** en modifiant un client dans Monday

---

## Informations techniques

### Events Monday supportés
| Event | Description |
|-------|-------------|
| `change_column_value` | Valeur d'une colonne modifiée |
| `create_item` | Nouvel item créé |
| `change_name` | Nom de l'item modifié |

### Endpoint webhook
- **URL** : `POST /api/webhooks/monday`
- **Challenge** : L'endpoint répond automatiquement au challenge Monday
- **Payload** : Reçoit les events et met à jour Supabase

---

## En cas d'erreur

Si Monday refuse de créer le webhook (URL inaccessible), c'est normal : l'app n'est pas encore déployée. John doit d'abord déployer sur Vercel.
