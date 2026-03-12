import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer le profil pour vérifier les permissions
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, territoire, departement, depot_ids')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role === 'client') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    // Utiliser le client admin pour bypasser RLS
    const adminClient = createAdminClient()

    let query = adminClient
      .from('clients')
      .select('*, livraisons(cq_valide)')
      .order('created_at', { ascending: false })

    // Filtrer par territoire (admin regional) ou depots (agent_secteur)
    if (profile.role === 'admin' && profile.territoire && profile.territoire !== 'FR') {
      query = query.eq('departement', profile.territoire)
    } else if (profile.role === 'agent_secteur') {
      if (!profile.depot_ids?.length) {
        // Agent sans dépôt assigné = aucun client visible
        return NextResponse.json({ clients: [] })
      }
      query = query.or(`depot_retrait_id.in.(${profile.depot_ids.join(',')}),depot_logistique_id.in.(${profile.depot_ids.join(',')})`)
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
