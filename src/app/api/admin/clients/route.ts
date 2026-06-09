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

    // Pagination pour récupérer TOUS les clients (Supabase limite à 1000 par requête)
    // Tri déterministe par id (unique) + dédup par id : created_at n'est pas
    // unique, donc l'ordre des ex-aequo varie entre pages et certaines lignes
    // reviennent sur plusieurs pages (sur-comptage des vélos).
    const clientsById = new Map<string, any>()
    const PAGE_SIZE = 1000
    let offset = 0
    let hasMore = true

    while (hasMore) {
      let query = adminClient
        .from('clients')
        .select('*, livraisons(cq_valide, cq_en_cours, date_livraison_effective)')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      // Filtrer par territoire (admin regional) ou depots (agent_secteur)
      if (profile.role === 'admin' && profile.territoire && profile.territoire !== 'FR') {
        query = query.eq('departement', profile.territoire)
      } else if (profile.role === 'agent_secteur') {
        if (!profile.depot_ids?.length) {
          return NextResponse.json({ clients: [] })
        }
        query = query.or(`depot_retrait_id.in.(${profile.depot_ids.join(',')}),depot_logistique_id.in.(${profile.depot_ids.join(',')})`)
      }

      const { data, error } = await query

      if (error) {
        console.error('Erreur Supabase:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (data && data.length > 0) {
        for (const c of data) clientsById.set(c.id, c)
        offset += PAGE_SIZE
        hasMore = data.length === PAGE_SIZE
      } else {
        hasMore = false
      }
    }

    return NextResponse.json({ clients: Array.from(clientsById.values()) })
  } catch (error: any) {
    console.error('Erreur API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
