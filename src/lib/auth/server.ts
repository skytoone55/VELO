import { createClient } from '@/lib/supabase/server'
import { AuthUser } from './types'
import { UserRole } from '@/lib/types/database'

/**
 * Récupère l'utilisateur authentifié avec son profil (côté serveur uniquement)
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

  // Récupérer le profil utilisateur
  const { data: profile, error: profileError } = await supabase
    .from('users_profile')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    // Si pas de profil, l'utilisateur existe mais n'est pas configuré
    return null
  }

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role as UserRole,
    is_super_admin: profile.is_super_admin ?? false,
    nom: profile.nom,
    prenom: profile.prenom,
    territoire: profile.territoire as AuthUser['territoire'],
    departement: profile.departement ?? null,
    depot_id: profile.depot_id,
    actif: profile.actif ?? true,
  }
}
