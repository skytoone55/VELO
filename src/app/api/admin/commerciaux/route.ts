import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { getTenantId } from '@/lib/tenants'
import { getCommerciauxFromDB, type CommercialRow } from '@/lib/tenants/commercial'

/**
 * GET /api/admin/commerciaux
 * Retourne la liste des commerciaux actifs pour le tenant courant avec hierarchie.
 *
 * Query params :
 * - tenant (optionnel) : 'ppe' | 'ecovolt' (defaut : getTenantId())
 *
 * Reponse :
 *   {
 *     tenant: 'ppe',
 *     commerciaux: CommercialRow[],       // liste a plat (triee par nom)
 *     parents: Array<CommercialRow & { enfants: CommercialRow[] }>, // hierarchie groupée
 *   }
 *
 * Acces : super_admin, admin, agent_secteur.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const tenantParam = searchParams.get('tenant') || undefined
    const tenant = tenantParam || getTenantId()

    const supabase = createAdminClient()
    const commerciaux = await getCommerciauxFromDB(supabase as any, tenant)

    // Regrouper en hierarchie : parents (parent_code null) + enfants associes
    const byCode = new Map<string, CommercialRow & { enfants: CommercialRow[] }>()
    for (const c of commerciaux) {
      if (!c.parent_code) {
        byCode.set(c.code, { ...c, enfants: [] })
      }
    }
    for (const c of commerciaux) {
      if (c.parent_code) {
        const parent = byCode.get(c.parent_code)
        if (parent) {
          parent.enfants.push(c)
        } else {
          // Parent absent (commercial orphelin) → considere comme racine
          byCode.set(c.code, { ...c, enfants: [] })
        }
      }
    }

    const parents = Array.from(byCode.values()).sort((a, b) => a.nom.localeCompare(b.nom))

    return NextResponse.json({
      tenant,
      commerciaux,
      parents,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur GET /api/admin/commerciaux:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
