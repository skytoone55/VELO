import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MONDAY_CONFIG, isMondayConfigured } from '@/lib/monday/config'

/**
 * API de synchronisation — DÉSACTIVÉE (Monday → Supabase)
 *
 * Supabase est la SOURCE DE VÉRITÉ (SSOT)
 * Le batch sync Monday → Supabase est désactivé.
 * Seul le push Supabase → Monday est actif.
 *
 * POST /api/sync/monday - DÉSACTIVÉ (410 Gone)
 * GET /api/sync/monday - Stats Supabase uniquement
 */

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Monday → Supabase batch sync is disabled. Supabase is the source of truth.' },
    { status: 410 }
  )
}

export async function GET() {
  try {
    const configured = isMondayConfigured()
    const adminClient = createAdminClient()

    const { count: totalClients } = await adminClient
      .from('clients')
      .select('id', { count: 'exact', head: true })

    return NextResponse.json({
      configured,
      sourceOfTruth: 'supabase',
      syncDirection: 'supabase_to_monday_only',
      isMultiBoard: MONDAY_CONFIG.isMultiBoard,
      boardCount: MONDAY_CONFIG.allBoardIds.length,
      stats: {
        totalClients: totalClients || 0,
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      configured: isMondayConfigured(),
      sourceOfTruth: 'supabase',
      syncDirection: 'supabase_to_monday_only',
      stats: { totalClients: 0 },
    })
  }
}
