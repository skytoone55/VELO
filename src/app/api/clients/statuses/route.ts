import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/clients/statuses
 * Returns distinct statut_commercial values from the clients table.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('clients')
      .select('statut_commercial')
      .not('monday_sync_status', 'eq', 'deleted')
      .limit(5000)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const statuses = [...new Set(data.map(d => d.statut_commercial))]
      .filter(Boolean)
      .sort()

    // Ajouter "Non défini" si des clients ont un statut NULL
    const hasNull = data.some(d => !d.statut_commercial)
    if (hasNull) {
      statuses.push('__null__')
    }

    return NextResponse.json(statuses)
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
