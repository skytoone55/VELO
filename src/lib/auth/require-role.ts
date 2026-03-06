import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UserRole } from '@/lib/types/database'

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
  territoire: string | null
  depot_ids: string[] | null
}

/**
 * Vérifie que l'utilisateur authentifié a l'un des rôles autorisés.
 * Retourne le profil utilisateur ou une réponse 401/403.
 */
export async function requireRole(
  allowedRoles: UserRole[]
): Promise<AuthenticatedUser | NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Non authentifié' },
      { status: 401 }
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('users_profile')
    .select('id, email, role, territoire, depot_ids')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'Profil non trouvé' },
      { status: 401 }
    )
  }

  if (!allowedRoles.includes(profile.role as UserRole)) {
    return NextResponse.json(
      { error: 'Accès refusé' },
      { status: 403 }
    )
  }

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role as UserRole,
    territoire: profile.territoire,
    depot_ids: profile.depot_ids,
  }
}

/**
 * Helper : vérifie si le résultat est une erreur HTTP
 */
export function isAuthError(result: AuthenticatedUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
