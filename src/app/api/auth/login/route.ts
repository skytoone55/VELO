import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // Authentifier via l'API admin
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 401 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 401 }
      )
    }

    // Récupérer le profil
    const { data: profile, error: profileError } = await supabase
      .from('users_profile')
      .select('role, actif')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({
        user: authData.user,
        session: authData.session,
        profile: null,
        redirect: '/auth/complete-profile'
      })
    }

    if (!profile.actif) {
      return NextResponse.json(
        { error: 'Votre compte a été désactivé.' },
        { status: 403 }
      )
    }

    const defaultRoute = profile.role === 'client' ? '/client/dashboard' : '/admin/dashboard'

    return NextResponse.json({
      user: authData.user,
      session: authData.session,
      profile,
      redirect: defaultRoute
    })

  } catch (error: any) {
    console.error('Login API error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
