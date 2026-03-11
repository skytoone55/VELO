import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/depots
 * Retourne la liste des dépôts actifs.
 * - super_admin / admin : tous les dépôts
 * - agent_secteur : uniquement ses dépôts (depot_ids)
 * - livreur : uniquement les dépôts de ses agents
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const adminClient = createAdminClient()

    // Filtre role-based pour agent_secteur
    let depotFilter: string[] | null = null
    if (user) {
      const { data: profile } = await adminClient
        .from('users_profile')
        .select('role, depot_ids')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'agent_secteur' && profile.depot_ids?.length) {
        depotFilter = profile.depot_ids
      } else if (profile?.role === 'livreur') {
        // Livreur voit les dépôts de ses agents
        const { data: agentLinks } = await adminClient
          .from('livreur_agents')
          .select('agent_id')
          .eq('livreur_id', user.id)

        if (agentLinks?.length) {
          const agentIds = agentLinks.map(l => l.agent_id)
          const { data: agentProfiles } = await adminClient
            .from('users_profile')
            .select('depot_ids')
            .in('id', agentIds)

          const allDepotIds = new Set<string>()
          agentProfiles?.forEach(p => {
            p.depot_ids?.forEach((id: string) => allDepotIds.add(id))
          })
          if (allDepotIds.size > 0) {
            depotFilter = Array.from(allDepotIds)
          }
        }
      }
    }

    let query = adminClient
      .from('depots')
      .select('id, nom, type, actif, latitude, longitude, rayon_couverture_km, agence')
      .eq('actif', true)
      .order('nom')

    if (depotFilter) {
      query = query.in('id', depotFilter)
    }

    const { data: depots, error } = await query

    if (error) throw error

    return NextResponse.json(depots || [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
