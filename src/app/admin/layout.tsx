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

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile, error } = await supabase
    .from('users_profile')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Profile fetch error:', error)
  }

  // Si pas de profil
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

  // Vérifier que l'utilisateur n'est pas un client
  if (profile.role === 'client') {
    redirect('/client/dashboard')
  }

  // Vérifier que le compte est actif
  if (!profile.actif) {
    redirect('/auth/login?error=account_disabled')
  }

  const adminUser = {
    id: profile.id,
    email: profile.email,
    role: profile.role as UserRole,
    nom: profile.nom,
    prenom: profile.prenom,
    territoire: profile.territoire,
    depot_id: profile.depot_id,
    actif: profile.actif ?? true,
  }

  return (
    <AdminUserProvider user={adminUser}>
      <div className="min-h-screen bg-background">
        <AdminNav user={adminUser} />
        <main className="md:pl-64 pt-16 md:pt-0">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </AdminUserProvider>
  )
}
