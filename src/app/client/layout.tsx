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
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Récupérer le profil utilisateur
  const { data: profile } = await supabase
    .from('users_profile')
    .select('*')
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
