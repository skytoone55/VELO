'use client'

import { useEffect, useState } from 'react'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Building2, Info, ArrowLeft, CheckCircle, Mail, Phone, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getTenantConfig } from '@/lib/tenants'

export function Step2Informations() {
  const tenant = getTenantConfig()
  const { clientId, data, updateData, nextStep, prevStep } = useFormulaireStore()
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

    // Toujours re-fetcher quand clientId change — ignorer le cache Zustand
    loadClientData()
  }, [clientId, updateData])

  const handleValidate = () => {
    nextStep()
  }

  if (localLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Building2 className="w-8 h-8 text-foreground" />
        </div>
        <CardTitle>Vérification de vos informations</CardTitle>
        <CardDescription>
          Veuillez vérifier que les informations ci-dessous sont correctes
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Fiche d'information - Style carte */}
        <div className="bg-muted/30 rounded-xl p-6 space-y-4 border">
          {/* Entreprise */}
          <div className="pb-4 border-b">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Building2 className="h-4 w-4" />
              Entreprise
            </div>
            <p className="text-lg font-semibold">{data.raisonSociale || '-'}</p>
            <p className="text-sm text-muted-foreground font-mono">SIRET : {data.siret || '-'}</p>
          </div>

          {/* Contact */}
          <div className="pb-4 border-b">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <User className="h-4 w-4" />
              Contact
            </div>
            <p className="text-lg font-medium">
              {data.contactPrenom || data.contactNom
                ? `${data.contactPrenom || ''} ${data.contactNom || ''}`.trim()
                : '-'}
            </p>
          </div>

          {/* Email */}
          <div className="pb-4 border-b">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Mail className="h-4 w-4" />
              Email
            </div>
            <p className="text-lg font-medium">{data.email || '-'}</p>
          </div>

          {/* Téléphone */}
          <div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Phone className="h-4 w-4" />
              Téléphone
            </div>
            <p className="text-lg font-medium">{data.telephone || '-'}</p>
          </div>
        </div>

        {/* Message d'information */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Si ces informations sont incorrectes, veuillez contacter {tenant.name} au{' '}
            <a href={`tel:${tenant.phone}`} className="font-semibold hover:underline">{tenant.phoneFormatted}</a>
            {' '}ou par email à{' '}
            <a href={`mailto:${tenant.email}`} className="font-semibold hover:underline">{tenant.email}</a>
            {' '}avant de continuer.
          </AlertDescription>
        </Alert>

        {/* Boutons */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button onClick={handleValidate} className="flex-1 bg-green-600 hover:bg-green-700">
            <CheckCircle className="mr-2 h-4 w-4" />
            Je valide ces informations
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
