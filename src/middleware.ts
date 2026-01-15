import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Routes protégées admin
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    // Vérifier le profil utilisateur
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, actif')
      .eq('id', user.id)
      .single()

    if (!profile) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/complete-profile'
      return NextResponse.redirect(url)
    }

    if (!profile.actif) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('error', 'account_disabled')
      return NextResponse.redirect(url)
    }

    // Seuls les non-clients peuvent accéder à /admin
    if (profile.role === 'client') {
      const url = request.nextUrl.clone()
      url.pathname = '/client/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Routes protégées client
  if (pathname.startsWith('/client')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
  }

  // Si connecté et sur login → redirection
  if (user && pathname === '/auth/login') {
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role')
      .eq('id', user.id)
      .single()

    const url = request.nextUrl.clone()
    url.pathname = profile?.role === 'client' ? '/client/dashboard' : '/admin/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/client/:path*',
    '/auth/login',
  ],
}
