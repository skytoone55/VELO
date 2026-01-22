'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Building2,
  MapPin,
  Truck,
  FileText,
} from 'lucide-react'
import Link from 'next/link'

export function Step6Confirmation() {
  const router = useRouter()
  const { clientId, data, prevStep, reset } = useFormulaireStore()

  const [acceptCGV, setAcceptCGV] = useState(false)
  const [acceptPolitique, setAcceptPolitique] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!acceptCGV || !acceptPolitique) {
      setError('Veuillez accepter les conditions générales et la politique de confidentialité')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // Utiliser l'API pour soumettre le formulaire (bypass RLS)
      const response = await fetch('/api/formulaire/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, data }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la soumission')
      }

      setSuccess(true)

      // Ne pas reset le store immédiatement - laisser l'utilisateur voir le message de succès
      // Le store sera reset quand l'utilisateur cliquera sur un des boutons
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNavigate = (path: string) => {
    reset() // Reset le store avant de naviguer
    router.push(path)
  }

  if (success) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Demande enregistrée !</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Votre demande a été enregistrée avec succès. Notre équipe vous contactera
            prochainement pour programmer la livraison de votre vélo cargo.
          </p>
          <div className="flex gap-4">
            <Button onClick={() => handleNavigate('/')}>
              Retour à l'accueil
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-primary" />
        </div>
        <CardTitle>Récapitulatif</CardTitle>
        <CardDescription>
          Vérifiez vos informations avant de valider
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Récap société */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-primary" />
            Société
          </div>
          <div className="bg-muted rounded-lg p-3 text-sm">
            <div className="font-medium">{data.raisonSociale}</div>
            <div className="text-muted-foreground">SIRET: {data.siret}</div>
          </div>
        </div>

        <Separator />

        {/* Récap livraison */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {data.modeLivraison === 'domicile' ? (
              <Truck className="h-4 w-4 text-primary" />
            ) : (
              <MapPin className="h-4 w-4 text-primary" />
            )}
            Mode de livraison
          </div>
          <div className="bg-muted rounded-lg p-3 text-sm">
            {data.modeLivraison === 'domicile' ? (
              <>
                <div className="font-medium">Livraison à domicile</div>
                {data.adresseLivraison && (
                  <div className="text-muted-foreground mt-1">
                    {data.adresseLivraison.ligne1}<br />
                    {data.adresseLivraison.ligne2 && <>{data.adresseLivraison.ligne2}<br /></>}
                    {data.adresseLivraison.codePostal} {data.adresseLivraison.ville}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="font-medium">Retrait en point relais</div>
                {data.depotRetrait && (
                  <div className="text-muted-foreground mt-1">
                    {data.depotRetrait.nom}<br />
                    {data.depotRetrait.adresse}<br />
                    {data.depotRetrait.code_postal} {data.depotRetrait.ville}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Récap document */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-primary" />
            Document d'identité
          </div>
          <div className="bg-muted rounded-lg p-3 text-sm">
            <div className="font-medium capitalize">
              {data.documentIdentite?.type?.replace('_', ' ')}
            </div>
            <div className="text-muted-foreground">
              {data.documentIdentite?.nomFichier}
            </div>
          </div>
        </div>

        <Separator />

        {/* Acceptations */}
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="cgv"
              checked={acceptCGV}
              onCheckedChange={(checked) => setAcceptCGV(checked as boolean)}
            />
            <Label htmlFor="cgv" className="text-sm cursor-pointer leading-relaxed">
              J'accepte les{' '}
              <Link href="/conditions" className="text-primary hover:underline">
                conditions générales de vente
              </Link>{' '}
              *
            </Label>
          </div>
          <div className="flex items-start space-x-3">
            <Checkbox
              id="politique"
              checked={acceptPolitique}
              onCheckedChange={(checked) => setAcceptPolitique(checked as boolean)}
            />
            <Label htmlFor="politique" className="text-sm cursor-pointer leading-relaxed">
              J'accepte la{' '}
              <Link href="/confidentialite" className="text-primary hover:underline">
                politique de confidentialité
              </Link>{' '}
              et le traitement de mes données *
            </Label>
          </div>
        </div>

        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1" disabled={submitting}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1"
            disabled={submitting || !acceptCGV || !acceptPolitique}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validation...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Valider ma demande
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
