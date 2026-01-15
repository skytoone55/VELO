import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Vérifier si le profil existe
      const { data: profile } = await supabase
        .from('users_profile')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (!profile) {
        // Pas de profil, rediriger vers la création
        return NextResponse.redirect(`${origin}/auth/complete-profile`)
      }

      // Rediriger selon le rôle
      const redirectUrl = profile.role === 'client'
        ? '/client/dashboard'
        : '/admin/dashboard'

      return NextResponse.redirect(`${origin}${next !== '/' ? next : redirectUrl}`)
    }
  }

  // En cas d'erreur, rediriger vers login avec erreur
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_error`)
}
