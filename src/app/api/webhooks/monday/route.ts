import { NextRequest, NextResponse } from 'next/server'

/**
 * Webhook endpoint Monday.com — DÉSACTIVÉ
 *
 * Supabase est la SOURCE DE VÉRITÉ (SSOT)
 * Le sync Monday → Supabase est désactivé.
 * Seul le push Supabase → Monday est actif (via syncClientToMonday).
 *
 * Le challenge handler est conservé pour que Monday ne signale pas d'erreur.
 */

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    // Challenge handler — Monday envoie ça lors de la config du webhook
    if (payload.challenge) {
      return NextResponse.json({ challenge: payload.challenge })
    }

    // Tous les autres événements : 410 Gone
    return NextResponse.json(
      { status: 'disabled', message: 'Monday → Supabase sync is disabled. Supabase is the source of truth.' },
      { status: 410 }
    )
  } catch {
    return NextResponse.json(
      { status: 'disabled', message: 'Monday → Supabase sync is disabled.' },
      { status: 410 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'disabled',
    endpoint: '/api/webhooks/monday',
    message: 'Monday → Supabase webhook is disabled. Supabase is the source of truth.',
  })
}
