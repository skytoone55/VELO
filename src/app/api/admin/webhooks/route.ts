import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100'), 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0)
    const status = searchParams.get('status')
    const ref = searchParams.get('ref')?.trim()

    let query = supabase
      .from('webhook_logs')
      .select(`
        id, source, reference_retina, monday_item_id,
        client_id, livraison_id, status, fnuci_codes,
        bike_count, has_pdf, has_id_photo, completed_at,
        error_message, created_at,
        client:clients(raison_sociale, reference_retina)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (ref) {
      query = query.ilike('reference_retina', `%${ref}%`)
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Stats rapides
    const { data: stats } = await supabase.rpc('get_webhook_stats').single()

    return NextResponse.json({
      logs: data || [],
      total: count ?? 0,
      stats: stats || { total: 0, success: 0, error: 0, pending: 0, duplicate: 0 },
    })
  } catch (error) {
    console.error('Erreur GET /api/admin/webhooks:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
