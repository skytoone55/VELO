# PLAN DE REFONTE - Synchronisation Monday

## Principe fondamental
**MONDAY = SOURCE DE VÉRITÉ UNIQUE**

- Les clients sont créés UNIQUEMENT dans Monday
- Supabase = cache/miroir pour l'interface rapide
- Toute modification dans l'interface → sync vers Monday
- Webhook Monday → mise à jour Supabase

---

## PHASE 1: Nettoyer le code mort ✅

### Fichiers à supprimer
- [x] `/src/lib/monday/sync.ts` - Obsolète, remplacé par `api.ts` ✅ SUPPRIMÉ

### Fichiers à nettoyer
- [ ] Supprimer les logs de debug une fois que tout fonctionne

---

## PHASE 2: Unifier la synchronisation

### Architecture cible
```
lib/monday/
├── api.ts              ← Fonctions API Monday (lecture/écriture)
├── config.ts           ← Configuration et mappings statiques (fallback)
├── dynamic-mapping.ts  ← Mappings depuis la DB (prioritaire)
└── types.ts            ← Types TypeScript
```

### Points de sync unifiés
1. **Monday → Supabase**: `/api/webhooks/monday` (webhook)
2. **Supabase → Monday**: `syncClientToMonday()` dans `api.ts`

---

## PHASE 3: Refactorer l'interface ✅

### `/admin/clients/page.tsx`

#### Supprimer
- [x] Bouton "Nouveau client" ✅ SUPPRIMÉ
- [x] Dialog "Nouveau client" ✅ SUPPRIMÉ
- [x] State `showNewClientDialog`, `newClient`, `creatingClient` ✅ SUPPRIMÉ
- [x] Fonction `handleCreateClient` ✅ SUPPRIMÉ

#### Corriger
- [x] Dialog "Modifier" - utiliser `statut_commercial` au lieu de `statut_formulaire` ✅
- [x] Dialog "Modifier" - remplacer les statuts par les vrais statuts Monday ✅
- [x] Barre d'actions groupées - remplacer les statuts obsolètes ✅

### Statuts Monday à utiliser
```typescript
const STATUTS_MONDAY = [
  { value: 'dossier_complet', label: 'DOSSIER COMPLET' },
  { value: 'devis_signe', label: 'DEVIS SIGNÉ' },
  { value: 'devis_cree', label: 'DEVIS CREE' },
  { value: 'controle_valide', label: 'CONTROLE VALIDÉ' },
  { value: 'controle_a_regulariser', label: 'CONTROLE A REGULARISER' },
  { value: 'controle_a_jour', label: 'CONTROLE A JOUR' },
  { value: 'client_contacte', label: 'CLIENT CONTACTÉ' },
  { value: 'client_injoignable', label: 'CLIENT INJOIGNABLE' },
  { value: 'client_hs', label: 'CLIENT HS' },
  { value: 'ah_signee', label: 'AH SIGNÉE' },
  { value: 'livre', label: 'LIVRÉ' },
  { value: 'paye', label: 'PAYÉ' },
  { value: 'doublon', label: 'DOUBLON' },
  { value: 'franck', label: 'FRANCK' },
  { value: 'code_envoye', label: 'CODE ENVOYÉ' },
  { value: 'formulaire_envoye', label: 'FORMULAIRE ENVOYÉ' },
  { value: 'formulaire_valide', label: 'FORMULAIRE VALIDÉ' },
  { value: 'inconnu', label: 'Inconnu' },
]
```

---

## PHASE 4: Supprimer création locale ✅

### API à supprimer/modifier
- [x] `/api/admin/clients/create` - ✅ SUPPRIMÉ

### Message utilisateur
Quand l'utilisateur veut créer un client:
> "Les clients doivent être créés dans Monday. Ils apparaîtront automatiquement ici après synchronisation."

---

## PHASE 5: Validation

### Code prêt pour les tests manuels
- [x] API PUT `/api/admin/clients/[id]` synchronise vers Monday ✅
- [x] API bulk `/api/admin/clients/bulk` utilise `statut_commercial` ✅
- [x] Dialog "Modifier" envoie `statut_commercial` ✅

### Tests à effectuer manuellement
1. [ ] Modifier un statut dans l'interface → vérifier dans Monday
2. [ ] Modifier un champ texte → vérifier dans Monday
3. [ ] Créer un client dans Monday → vérifier apparition dans l'interface
4. [ ] Modifier un client dans Monday → vérifier mise à jour dans l'interface
5. [ ] Actions groupées (envoi code, envoi formulaire, changement statut)

---

## Ordre d'exécution

1. **Supprimer `sync.ts`** - Éliminer la confusion
2. **Corriger le dialog Modifier** - Statuts + champ correct
3. **Corriger la barre d'actions** - Statuts Monday
4. **Supprimer le bouton Nouveau client** - Monday = seule source
5. **Tester la sync bidirectionnelle**
6. **Nettoyer les logs de debug**

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `lib/monday/sync.ts` | ✅ SUPPRIMÉ |
| `lib/monday/api.ts` | ✅ Source de vérité pour sync |
| `app/admin/clients/page.tsx` | ✅ Refactoré (statuts + suppr création) |
| `app/api/admin/clients/create/route.ts` | ✅ SUPPRIMÉ |
| `app/api/admin/clients/[id]/route.ts` | ✅ Imports vérifiés |
| `app/api/admin/clients/bulk/route.ts` | ✅ Imports + statuts vérifiés |
