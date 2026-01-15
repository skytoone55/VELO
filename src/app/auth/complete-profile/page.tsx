'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Zap, AlertCircle } from 'lucide-react'

export default function CompleteProfilePage() {
  const router = useRouter()

  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setUserId(user.id)
      setEmail(user.email || '')

      // Vérifier si le profil existe déjà
      const { data: profile } = await supabase
        .from('users_profile')
        .select('id')
        .eq('id', user.id)
        .single()

      if (profile) {
        // Profil existe, rediriger
        router.push('/client/dashboard')
      }
    }

    checkUser()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!userId) {
      setError('Erreur: utilisateur non trouvé')
      setLoading(false)
      return
    }

    const supabase = createClient()

    const { error: profileError } = await supabase
      .from('users_profile')
      .insert({
        id: userId,
        email,
        nom,
        prenom,
        telephone,
        role: 'client',
        actif: true,
      })

    if (profileError) {
      // Si erreur de duplication, le profil existe peut-être déjà
      if (profileError.code === '23505') {
        router.push('/client/dashboard')
        return
      }
      setError(profileError.message)
      setLoading(false)
      return
    }

    router.push('/client/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Complétez votre profil</CardTitle>
          <CardDescription>
            Quelques informations pour finaliser votre inscription
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prenom">Prénom</Label>
                <Input
                  id="prenom"
                  placeholder="Jean"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nom">Nom</Label>
                <Input
                  id="nom"
                  placeholder="Dupont"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input
                id="telephone"
                type="tel"
                placeholder="0690 XX XX XX"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
              />
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Terminer l\'inscription'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
