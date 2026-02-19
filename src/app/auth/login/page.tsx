'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Zap, AlertCircle } from 'lucide-react'
import { getTenantConfig } from '@/lib/tenants'

function LoginForm() {
  const tenant = getTenantConfig()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    errorParam === 'account_disabled' ? 'Votre compte a été désactivé.' :
    errorParam === 'auth_callback_error' ? 'Erreur d\'authentification.' : null
  )

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Email ou mot de passe incorrect'
        : authError.message
      )
      setLoading(false)
      return
    }

    if (data.user) {
      // Vérifier le profil et le rôle
      const { data: profile } = await supabase
        .from('users_profile')
        .select('role, actif')
        .eq('id', data.user.id)
        .single()

      if (!profile) {
        router.push('/auth/complete-profile')
        return
      }

      if (!profile.actif) {
        await supabase.auth.signOut()
        setError('Votre compte a été désactivé.')
        setLoading(false)
        return
      }

      // Rediriger selon le rôle ou le redirect demandé
      const defaultRoute = profile.role === 'client' ? '/client/dashboard' : '/admin/dashboard'
      // Ignorer les redirects vers des pages de login (boucle infinie) ou invalides
      const safeRedirect = redirect && !redirect.includes('/login') ? redirect : null
      router.push(safeRedirect || defaultRoute)
      router.refresh()
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4">
          <Image
            src={tenant.branding.logo}
            alt={tenant.branding.logoAlt}
            width={64}
            height={64}
            className="h-16 w-auto mx-auto"
          />
        </div>
        <CardTitle className="text-2xl font-bold">{tenant.name}</CardTitle>
        <CardDescription>
          Connectez-vous à votre espace
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleLogin}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mot de passe</Label>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 pt-6">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connexion...
              </>
            ) : (
              'Se connecter'
            )}
          </Button>

          <p className="text-sm text-muted-foreground text-center">
            Pas encore de compte ?{' '}
            <Link href="/auth/register" className="text-emerald-600 hover:text-emerald-700 hover:underline font-medium">
              S'inscrire
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Suspense fallback={
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      }>
        <LoginForm />
      </Suspense>
    </div>
  )
}
