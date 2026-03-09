import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

export async function GET(request: Request) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    // Utiliser le client admin pour bypasser RLS
    const adminClient = createAdminClient()

    let query = adminClient
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    // Filtrer par territoire/département
    if (authResult.role === 'admin' && authResult.territoire) {
      query = query.eq('departement', authResult.territoire)
    } else if (authResult.role === 'agent_secteur') {
      const dept = authResult.departement || authResult.territoire
      if (dept) query = query.eq('departement', dept)
    }

    const { data, error } = await query

    if (error) {
      console.error('Erreur Supabase:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ clients: data || [] })
  } catch (error: any) {
    console.error('Erreur API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
