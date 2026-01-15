'use client'

import { useEffect, useState } from 'react'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Building2, Info, ArrowLeft, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function Step2Informations() {
  const { clientId, data, updateData, nextStep, prevStep, setLoading, isLoading } = useFormulaireStore()
  const [localLoading, setLocalLoading] = useState(true)

  useEffect(() => {
    const loadClientData = async () => {
      if (!clientId) return

      const supabase = createClient()
      const { data: client, error } = await supabase
        .from('clients')
        .select('raison_sociale, siret, email, telephone, contact_nom, contact_prenom')
        .eq('id', clientId)
        .single()

      if (!error && client) {
        updateData({
          raisonSociale: client.raison_sociale,
          siret: client.siret,
          email: client.email,
          telephone: client.telephone || '',
          contactNom: client.contact_nom || '',
          contactPrenom: client.contact_prenom || '',
        })
      }

      setLocalLoading(false)
    }

    if (!data.raisonSociale) {
      loadClientData()
    } else {
      setLocalLoading(false)
    }
  }, [clientId, data.raisonSociale, updateData])

  const handleNext = () => {
    // Les infos sont pré-remplies, pas de validation nécessaire
    nextStep()
  }

  if (localLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Building2 className="w-8 h-8 text-primary" />
        </div>
        <CardTitle>Vos informations</CardTitle>
        <CardDescription>
          Vérifiez les informations de votre société
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Ces informations proviennent de votre dossier. Si elles sont incorrectes,
            contactez ECO-VOLT au 07 57 99 11 25.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Raison sociale</Label>
            <Input value={data.raisonSociale || ''} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label>SIRET</Label>
            <Input value={data.siret || ''} disabled className="bg-muted font-mono" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prénom du contact</Label>
              <Input value={data.contactPrenom || '-'} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Nom du contact</Label>
              <Input value={data.contactNom || '-'} disabled className="bg-muted" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={data.email || ''} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label>Téléphone</Label>
            <Input value={data.telephone || '-'} disabled className="bg-muted" />
          </div>
        </div>

        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button onClick={handleNext} className="flex-1">
            Continuer
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
