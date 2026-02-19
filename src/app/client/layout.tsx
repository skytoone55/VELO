import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientNav } from '@/components/client/client-nav'
import { ClientUserProvider, ClientUser } from '@/components/client/client-user-provider'

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Le middleware a déjà vérifié que l'utilisateur est connecté
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Utiliser des champs spécifiques au lieu de '*' pour optimiser
  const { data: profile } = await supabase
    .from('users_profile')
    .select('id, nom, prenom, email')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/auth/login')
  }

  const clientUser: ClientUser = {
    id: user.id,
    email: user.email || '',
    nom: profile.nom || '',
    prenom: profile.prenom || '',
  }

  return (
    <ClientUserProvider user={clientUser}>
      <div className="min-h-screen bg-background">
        <ClientNav user={clientUser} />
        <main className="container py-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>
    </ClientUserProvider>
  )
}
