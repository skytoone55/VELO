'use client'

import { useState, useEffect } from 'react'
import type { CommercialRow } from '@/lib/tenants/commercial'

/** Commercial parent avec ses enfants (réponse de /api/admin/commerciaux) */
export type CommercialOption = CommercialRow & { enfants: CommercialRow[] }

/**
 * Hook client : charge la liste hiérarchique des commerciaux pour un tenant.
 * Appelle GET /api/admin/commerciaux?tenant=<tenantId>.
 * Retourne :
 *   - parents : tableau des maîtres (ENR/AMR pour Ecovolt, boards pour PPE),
 *               chacun avec .enfants[] peuplé
 *   - flat    : liste complète à plat (parents + enfants)
 *   - loading : indicateur de chargement
 */
export function useCommerciaux(tenantId: string): {
  parents: CommercialOption[]
  flat: CommercialRow[]
  loading: boolean
} {
  const [parents, setParents] = useState<CommercialOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    fetch(`/api/admin/commerciaux?tenant=${encodeURIComponent(tenantId)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data?.parents)) {
          setParents(data.parents)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantId])

  // Liste à plat : parents + tous leurs enfants
  const flat: CommercialRow[] = parents.flatMap(p => [
    p,
    ...(p.enfants ?? []),
  ])

  return { parents, flat, loading }
}
