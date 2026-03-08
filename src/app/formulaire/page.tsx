'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { StepIndicator } from '@/components/formulaire/StepIndicator'
import { Step1CodeEnemat } from '@/components/formulaire/Step1CodeEnemat'
import { Step2Informations } from '@/components/formulaire/Step2Informations'
import { Step3Adresse } from '@/components/formulaire/Step3Adresse'
import { Step4Preference } from '@/components/formulaire/Step4Preference'
import { Step5Fnuci } from '@/components/formulaire/Step5Fnuci'
import { Step6Confirmation } from '@/components/formulaire/Step6Confirmation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2, Bike } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { getTenantConfig } from '@/lib/tenants'

function FormulaireContent() {
  const tenant = getTenantConfig()
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const {
    currentStep,
    completedSteps,
    clientId,
    setClientId,
    updateData,
    setDepotsDisponibles,
    isBlocked,
    reset,
  } = useFormulaireStore()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invalidToken, setInvalidToken] = useState(false)

  // Charger les données du client au montage
  useEffect(() => {
    const loadClientData = async () => {
      // Si pas de token dans l'URL
      if (!token) {
        // Si on a un clientId en mémoire, continuer avec celui-ci
        if (clientId) {
          setLoading(false)
          return
        }
        // Sinon, erreur - pas de token et pas de session
        setInvalidToken(true)
        setLoading(false)
        return
      }

      // On a un token dans l'URL - toujours valider
      try {
        const response = await fetch('/api/formulaire/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const data = await response.json()

        if (!response.ok || !data.valid) {
          if (data.status === 'completed') {
            setError('Ce formulaire a déjà été complété.')
          } else if (data.status === 'blocked') {
            setError('Votre accès au formulaire a été bloqué. Contactez le support.')
          } else {
            setInvalidToken(true)
          }
          setLoading(false)
          return
        }

        const client = data.client

        // Si le clientId est différent de celui en mémoire, ou si le formulaire a été réinitialisé
        // par l'admin (needsReset = code_enemat non validé), repartir à zéro
        if ((clientId && clientId !== client.id) || data.needsReset) {
          reset()
        }

        // Stocker le clientId
        setClientId(client.id)

        // Pré-remplir les données du formulaire
        updateData({
          raisonSociale: client.raison_sociale,
          siret: client.siret,
          email: client.email_beneficiaire || client.email,
          telephone: client.telephone,
          contactNom: client.contact_nom,
          contactPrenom: client.contact_prenom,
          adresseLivraison: client.adresse_livraison_ligne1
            ? {
                ligne1: client.adresse_livraison_ligne1,
                ligne2: client.adresse_livraison_ligne2 || '',
                codePostal: client.adresse_livraison_cp || '',
                ville: client.adresse_livraison_ville || '',
              }
            : undefined,
        })

        // Stocker les dépôts disponibles
        if (data.depots) {
          setDepotsDisponibles(data.depots)
        }
      } catch (err: any) {
        setError('Erreur lors du chargement. Réessayez plus tard.')
        console.error('Formulaire loading error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadClientData()
  }, [token, clientId, setClientId, updateData, setDepotsDisponibles, reset])

  // Affichage loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Chargement du formulaire...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Token invalide
  if (invalidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold mb-2">Lien invalide ou expiré</h2>
            <p className="text-muted-foreground mb-6">
              Le lien que vous avez utilisé n'est pas valide ou a expiré.
              Veuillez contacter l'équipe {tenant.name} pour obtenir un nouveau lien.
            </p>
            <Button asChild>
              <Link href="/">Retour à l'accueil</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Erreur générale
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold mb-2">Erreur</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button asChild>
              <Link href="/">Retour à l'accueil</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Formulaire bloqué (3 tentatives ENEMAT)
  if (isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold mb-2">Accès temporairement bloqué</h2>
            <p className="text-muted-foreground mb-6">
              Vous avez atteint le nombre maximum de tentatives pour le code ENEMAT.
              Notre équipe a été notifiée et vous contactera prochainement.
            </p>
            <Button asChild variant="outline">
              <Link href="/">Retour à l'accueil</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Rendu du step actuel (6 étapes: ENEMAT, Infos, Adresse, Préférence, FNUCI, Confirmation)
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1CodeEnemat />
      case 2:
        return <Step2Informations />
      case 3:
        return <Step3Adresse />
      case 4:
        return <Step4Preference />
      case 5:
        return <Step5Fnuci />
      case 6:
        return <Step6Confirmation />
      default:
        return <Step1CodeEnemat />
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Image
              src={tenant.branding.logo}
              alt={tenant.branding.logoAlt}
              width={48}
              height={48}
              className="h-12 w-auto"
            />
            <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
          </div>
          <p className="text-muted-foreground">
            Formulaire de demande de livraison de vélo cargo
          </p>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} completedSteps={completedSteps} totalSteps={6} />

        {/* Current Step Content */}
        {renderStep()}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          En cas de problème, contactez-nous à{' '}
          <a href={`mailto:${tenant.email}`} className="text-foreground font-medium hover:underline">
            {tenant.email}
          </a>
        </p>
      </div>
    </div>
  )
}

export default function FormulairePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-muted/30">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Chargement...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <FormulaireContent />
    </Suspense>
  )
}
