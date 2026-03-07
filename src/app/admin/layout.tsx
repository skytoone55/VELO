import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminNav } from '@/components/admin/admin-nav'
import { AdminUserProvider } from '@/components/admin/admin-user-provider'
import { UserRole } from '@/lib/types/database'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Le middleware a déjà vérifié que l'utilisateur est connecté
  // On récupère juste le profil ici (une seule requête)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Utiliser des champs spécifiques au lieu de '*' pour optimiser
  const { data: profile, error } = await supabase
    .from('users_profile')
    .select('id, email, role, is_super_admin, nom, prenom, territoire, departement, depot_ids, actif')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Profile fetch error:', error)
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold mb-4">Profil non trouvé</h1>
          <p className="text-muted-foreground mb-4">
            Votre compte existe mais votre profil utilisateur n&apos;a pas été créé.
          </p>
          <p className="text-sm text-muted-foreground">
            Contactez l&apos;administrateur pour créer votre profil.
          </p>
        </div>
      </div>
    )
  }

  if (profile.role === 'client') {
    redirect('/client/dashboard')
  }

  if (!profile.actif) {
    redirect('/auth/login?error=account_disabled')
  }

  const adminUser = {
    id: profile.id,
    email: profile.email,
    role: profile.role as UserRole,
    is_super_admin: profile.is_super_admin ?? false,
    nom: profile.nom,
    prenom: profile.prenom,
    territoire: profile.territoire,
    departement: profile.departement ?? null,
    depot_ids: profile.depot_ids ?? [],
    actif: profile.actif ?? true,
  }

  return (
    <AdminUserProvider user={adminUser}>
      <div className="min-h-screen bg-background">
        <AdminNav user={adminUser} />
        <main className="pt-16 md:pt-0 sidebar-offset">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </AdminUserProvider>
  )
}
