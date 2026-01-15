import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create admin Supabase client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: List alerts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const statut = searchParams.get('statut') || 'pending'
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabaseAdmin
      .from('email_alerts')
      .select(`
        *,
        client:clients (
          id,
          raison_sociale,
          email,
          telephone,
          departement
        )
      `)
      .eq('statut', statut)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type) {
      query = query.eq('type', type)
    }

    const { data: alerts, error } = await query

    if (error) throw error

    // Get counts by type
    const { data: counts } = await supabaseAdmin
      .from('email_alerts')
      .select('type, statut')

    const stats = {
      total: counts?.length || 0,
      pending: counts?.filter((c) => c.statut === 'pending').length || 0,
      sent: counts?.filter((c) => c.statut === 'sent').length || 0,
      byType: {} as Record<string, number>,
    }

    counts?.forEach((c) => {
      if (c.statut === 'pending') {
        stats.byType[c.type] = (stats.byType[c.type] || 0) + 1
      }
    })

    return NextResponse.json({ alerts, stats })
  } catch (error: any) {
    console.error('Error fetching alerts:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur lors du chargement des alertes' },
      { status: 500 }
    )
  }
}

// POST: Create alert or send email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'send') {
      // Mark alert as sent (actual email sending would be handled by a service)
      const { alertId } = body

      const { error } = await supabaseAdmin
        .from('email_alerts')
        .update({
          statut: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', alertId)

      if (error) throw error

      return NextResponse.json({ success: true })
    }

    if (action === 'create') {
      // Create new alert
      const { type, client_id, message, details } = body

      const { data, error } = await supabaseAdmin
        .from('email_alerts')
        .insert({
          type,
          client_id,
          message,
          details,
          statut: 'pending',
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ success: true, alert: data })
    }

    if (action === 'dismiss') {
      // Dismiss/archive alert
      const { alertId } = body

      const { error } = await supabaseAdmin
        .from('email_alerts')
        .update({
          statut: 'dismissed',
        })
        .eq('id', alertId)

      if (error) throw error

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 })
  } catch (error: any) {
    console.error('Error processing alert:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur lors du traitement' },
      { status: 500 }
    )
  }
}
