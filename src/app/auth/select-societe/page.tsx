'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Building2, AlertCircle, Check } from 'lucide-react'
import { Client, UserSociete } from '@/lib/types/database'

interface SocieteWithClient extends UserSociete {
  client: Client | null
}

export default function SelectSocietePage() {
  const router = useRouter()

  const [societes, setSocietes] = useState<SocieteWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSocietes = async () => {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      // Récupérer les sociétés liées à l'utilisateur
      const { data, error: fetchError } = await supabase
        .from('user_societes')
        .select(`
          *,
          client:clients(*)
        `)
        .eq('user_id', user.id)

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      if (!data || data.length === 0) {
        // Pas de sociétés, rediriger vers le dashboard
        router.push('/client/dashboard')
        return
      }

      if (data.length === 1) {
        // Une seule société, la sélectionner automatiquement
        await selectSociete(data[0].client_id!, true)
        return
      }

      setSocietes(data as SocieteWithClient[])
      setLoading(false)
    }

    fetchSocietes()
  }, [router])

  const selectSociete = async (clientId: string, skipLoading = false) => {
    if (!skipLoading) {
      setSelecting(clientId)
    }

    // Stocker la société sélectionnée dans localStorage pour cette session
    localStorage.setItem('selected_societe_id', clientId)

    // Rediriger vers le dashboard client
    router.push('/client/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Sélectionner une société</CardTitle>
          <CardDescription>
            Vous êtes associé à plusieurs sociétés. Choisissez celle avec laquelle vous souhaitez travailler.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {societes.map((societe) => (
            <Button
              key={societe.id}
              variant="outline"
              className="w-full justify-between h-auto p-4"
              onClick={() => societe.client_id && selectSociete(societe.client_id)}
              disabled={!!selecting}
            >
              <div className="text-left">
                <div className="font-medium">
                  {societe.client?.raison_sociale || 'Société inconnue'}
                </div>
                <div className="text-sm text-muted-foreground">
                  SIRET: {societe.client?.siret || 'N/A'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {societe.is_primary && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    Principal
                  </span>
                )}
                {selecting === societe.client_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 opacity-0 group-hover:opacity-100" />
                )}
              </div>
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
