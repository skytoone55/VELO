import { NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/livreurs
 * Liste les livreurs + agents secteur actifs (pour filtres multi-select).
 * Retourne : [{ id, nom, prenom }] tries par nom + prenom.
 */
export async function GET() {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(auth)) return auth

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('users_profile')
      .select('id, nom, prenom')
      .in('role', ['livreur', 'agent_secteur'])
      .eq('actif', true)
      .order('nom', { ascending: true })
      .order('prenom', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      livreurs: (data || []).map((u: { id: string; nom: string | null; prenom: string | null }) => ({
        id: u.id,
        nom: u.nom || '',
        prenom: u.prenom || '',
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
