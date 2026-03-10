import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * PATCH /api/admin/naf/[code]
 * Toggle valide sur un code NAF + bulk update validation_naf des clients
 * Body: { valide: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireRole(['super_admin', 'admin'])
    if (isAuthError(auth)) return auth

    const { code } = await params
    const body = await request.json()
    const { valide } = body as { valide: boolean }

    if (typeof valide !== 'boolean') {
      return NextResponse.json({ error: 'valide (boolean) requis' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Update naf_codes
    const { error: nafErr } = await supabase
      .from('naf_codes')
      .update({ valide, updated_at: new Date().toISOString() })
      .eq('code', code)

    if (nafErr) {
      return NextResponse.json({ error: nafErr.message }, { status: 500 })
    }

    // 2. Bulk update clients with this code_ape
    const newValidationNaf = valide ? 'OUI' : 'NON'

    const { count: clientsUpdated, error: clientErr } = await supabase
      .from('clients')
      .update(
        { validation_naf: newValidationNaf, updated_at: new Date().toISOString() },
        { count: 'exact' }
      )
      .eq('code_ape', code)

    if (clientErr) {
      console.error(`Bulk client update for code ${code} failed:`, clientErr.message)
    }

    return NextResponse.json({
      success: true,
      clients_updated: clientsUpdated || 0,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur PATCH /api/admin/naf/[code]:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
