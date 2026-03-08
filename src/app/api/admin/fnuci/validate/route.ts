import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/admin/fnuci/validate
 * Valide un code FNUCI unique
 * Body: { reference: "BCxxxxxxxx" }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const { reference } = body

    if (!reference || typeof reference !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Référence FNUCI requise' },
        { status: 400 }
      )
    }

    const code = reference.trim().toUpperCase()

    if (code.length < 6) {
      return NextResponse.json(
        { valid: false, error: 'Code FNUCI trop court (minimum 6 caractères)' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: fnuci, error } = await supabase
      .from('fnuci')
      .select('*')
      .eq('reference', code)
      .single()

    if (error || !fnuci) {
      return NextResponse.json(
        { valid: false, error: 'Code FNUCI introuvable' },
        { status: 200 }
      )
    }

    // Un code attribué ou bloqué n'est pas disponible
    if (fnuci.statut === 'attribue') {
      return NextResponse.json(
        { valid: false, error: 'Ce code FNUCI est déjà attribué à un autre client', fnuci },
        { status: 200 }
      )
    }

    if (fnuci.statut === 'bloque') {
      return NextResponse.json(
        { valid: false, error: 'Ce code FNUCI est bloqué', fnuci },
        { status: 200 }
      )
    }

    // Code valide (disponible ou distribué)
    return NextResponse.json(
      { valid: true, fnuci },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/fnuci/validate:', message)
    return NextResponse.json(
      { valid: false, error: message },
      { status: 500 }
    )
  }
}
