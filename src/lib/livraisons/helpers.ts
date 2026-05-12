type LivraisonLike = {
  statut?: string | null;
  created_at?: string | null;
  cq_valide_at?: string | null;
  [key: string]: unknown;
};

/**
 * Retourne la livraison "officielle" d'un client : la dernière livrée valide.
 * Filtre sur statut='livree' et trie par cq_valide_at desc (fallback created_at desc).
 * Retourne null si aucune livraison livrée. Fallback livraisonsArr[0] à laisser au site d'appel si besoin de continuité.
 */
export function getDerniereLivraisonValide<T extends LivraisonLike>(
  livraisons: T[] | null | undefined
): T | null {
  if (!livraisons || livraisons.length === 0) return null;
  const livrees = livraisons.filter((l) => l.statut === 'livree');
  if (livrees.length === 0) return null;
  return livrees.sort((a, b) => {
    const ka = (a.cq_valide_at as string | null | undefined) || a.created_at || '';
    const kb = (b.cq_valide_at as string | null | undefined) || b.created_at || '';
    return kb.localeCompare(ka);
  })[0];
}
