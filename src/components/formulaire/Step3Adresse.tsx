'use client'

import { useState, useEffect } from 'react'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, MapPin, ArrowLeft, ArrowRight, AlertCircle, Info, CheckCircle, Truck, Store } from 'lucide-react'
import { Depot } from '@/lib/types/database'

type ViewState = 'address_confirm' | 'result'

interface ValidationResult {
  modeLivraison: 'domicile' | 'retrait'
  zoneLivraison: 'gratuite' | 'payante' | 'hors_zone'
  depotType: 'retrait' | 'logistique'
  depotRetrait?: Depot & { distance: number }
  depotLogistique?: Depot & { distance: number }
  prixLivraisonPayante?: number
  horsZone: boolean
}

export function Step3Adresse() {
  const { clientId, data, updateData, nextStep, prevStep, setHorsZone } = useFormulaireStore()

  const [viewState, setViewState] = useState<ViewState>('address_confirm')
  const [facturationAddress, setFacturationAddress] = useState<{
    ligne1: string
    ligne2: string
    codePostal: string
    ville: string
  } | null>(null)

  const [complementAdresse, setComplementAdresse] = useState(data.complementAdresse || '')

  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)

  // Charger l'adresse de facturation via API
  useEffect(() => {
    const loadClientAddress = async () => {
      if (!clientId) return

      try {
        const response = await fetch('/api/formulaire/client-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        })

        const result = await response.json()

        if (response.ok) {
          setFacturationAddress(result.address)
        }
      } catch (err) {
        console.error('Erreur chargement adresse:', err)
      } finally {
        setLoading(false)
      }
    }

    loadClientAddress()
  }, [clientId])

  const validateAddress = async () => {
    setValidating(true)
    setError(null)

    try {
      const response = await fetch('/api/formulaire/save-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          useSocieteAddress: true,
          address: null,
          complementAdresse: complementAdresse.trim() || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Erreur lors de la sauvegarde')
        setValidating(false)
        return
      }

      // Stocker le r\u00e9sultat
      setValidationResult({
        modeLivraison: result.modeLivraison,
        zoneLivraison: result.zoneLivraison,
        depotType: result.depotType,
        depotRetrait: result.depotRetrait,
        depotLogistique: result.depotLogistique,
        prixLivraisonPayante: result.prixLivraisonPayante,
        horsZone: result.horsZone,
      })

      // Mettre \u00e0 jour le store avec l'adresse, le mode et les infos de zone
      updateData({
        adresseLivraison: facturationAddress!,
        complementAdresse: complementAdresse.trim() || undefined,
        modeLivraison: result.modeLivraison,
        zoneLivraison: result.zoneLivraison,
        depotType: result.depotType,
        depotRetrait: result.depotRetrait,
        depotLogistique: result.depotLogistique,
        prixLivraisonPayante: result.prixLivraisonPayante,
      })

      setHorsZone(result.horsZone)

      // Passer directement \u00e0 l'\u00e9tape suivante (pr\u00e9f\u00e9rence de r\u00e9ception)
      nextStep()
      return
    } catch (err) {
      console.error('Erreur validation adresse:', err)
      setError('Une erreur est survenue. R\u00e9essayez.')
    } finally {
      setValidating(false)
    }
  }

  const handleBack = () => {
    if (viewState === 'result') {
      setViewState('address_confirm')
      setValidationResult(null)
    } else {
      prevStep()
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // Vue r\u00e9sultat : affiche o\u00f9 le client doit r\u00e9cup\u00e9rer/recevoir son v\u00e9lo
  if (viewState === 'result' && validationResult) {
    const { modeLivraison, depotRetrait, depotLogistique, horsZone } = validationResult
    const finalAddress = data.adresseLivraison

    // Si hors zone
    if (horsZone) {
      return (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Truck className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>Livraison \u00e0 votre adresse</CardTitle>
            <CardDescription>
              Votre v\u00e9lo cargo sera livr\u00e9 directement chez vous
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Votre adresse a bien \u00e9t\u00e9 enregistr\u00e9e. Notre \u00e9quipe vous contactera pour programmer la livraison.
              </AlertDescription>
            </Alert>

            <div className="bg-muted/50 rounded-lg p-4 border">
              <p className="text-sm font-medium text-muted-foreground mb-2">Adresse de livraison finale :</p>
              <p className="font-medium">{finalAddress?.ligne1}</p>
              {(finalAddress?.ligne2 || data.complementAdresse) && (
                <p className="text-sm text-muted-foreground">{data.complementAdresse || finalAddress?.ligne2}</p>
              )}
              <p>{finalAddress?.codePostal} {finalAddress?.ville}</p>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Modifier
              </Button>
              <Button onClick={nextStep} className="flex-1 bg-green-600 hover:bg-green-700">
                Continuer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Retrait en point relais (obligatoire)
    if (modeLivraison === 'retrait' && depotRetrait) {
      return (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Store className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>Point de retrait assign\u00e9</CardTitle>
            <CardDescription>
              Vous r\u00e9cup\u00e9rerez votre v\u00e9lo cargo \u00e0 ce point relais
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Bonne nouvelle ! Vous \u00eates \u00e0 seulement {depotRetrait.distance} km d'un de nos points de retrait.
              </AlertDescription>
            </Alert>

            <div className="bg-muted/50 rounded-lg p-4 border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                  <Store className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{depotRetrait.nom}</p>
                  <p className="text-muted-foreground">{depotRetrait.adresse}</p>
                  <p className="text-muted-foreground">{depotRetrait.code_postal} {depotRetrait.ville}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Distance : {depotRetrait.distance} km de votre adresse
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Modifier l'adresse
              </Button>
              <Button onClick={nextStep} className="flex-1 bg-green-600 hover:bg-green-700">
                Continuer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Livraison \u00e0 domicile
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Truck className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle>Livraison \u00e0 domicile confirm\u00e9e</CardTitle>
          <CardDescription>
            Votre v\u00e9lo cargo sera livr\u00e9 \u00e0 l'adresse indiqu\u00e9e
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Votre adresse est \u00e9ligible \u00e0 la livraison gratuite \u00e0 domicile.
            </AlertDescription>
          </Alert>

          <div className="bg-muted/50 rounded-lg p-4 border">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="font-semibold">Adresse de livraison finale</p>
                <p className="text-muted-foreground">{finalAddress?.ligne1}</p>
                {(finalAddress?.ligne2 || data.complementAdresse) && (
                  <p className="text-muted-foreground">{data.complementAdresse || finalAddress?.ligne2}</p>
                )}
                <p className="text-muted-foreground">{finalAddress?.codePostal} {finalAddress?.ville}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button variant="outline" onClick={handleBack} className="flex-1">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Modifier l'adresse
            </Button>
            <Button onClick={nextStep} className="flex-1 bg-green-600 hover:bg-green-700">
              Continuer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Vue confirmation d'adresse \u2014 toujours l'adresse soci\u00e9t\u00e9
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <MapPin className="w-8 h-8 text-foreground" />
        </div>
        <CardTitle>Adresse de livraison</CardTitle>
        <CardDescription>
          V\u00e9rifiez l'adresse de livraison de votre v\u00e9lo cargo
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Votre adresse sera utilis\u00e9e pour d\u00e9terminer automatiquement
            le mode de livraison de votre v\u00e9lo cargo.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Adresse soci\u00e9t\u00e9 (non modifiable) */}
        {facturationAddress && facturationAddress.ligne1 ? (
          <div className="bg-muted/30 rounded-xl p-6 space-y-4 border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <MapPin className="h-4 w-4" />
              Adresse de votre entreprise
            </div>
            <div>
              <p className="text-lg font-medium">{facturationAddress.ligne1}</p>
              {facturationAddress.ligne2 && (
                <p className="text-muted-foreground">{facturationAddress.ligne2}</p>
              )}
              <p className="text-muted-foreground">{facturationAddress.codePostal} {facturationAddress.ville}</p>
            </div>
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Aucune adresse trouv\u00e9e dans votre dossier. Veuillez contacter votre conseiller.
            </AlertDescription>
          </Alert>
        )}

        {/* Compl\u00e9ment d'adresse */}
        <div className="space-y-2">
          <Label htmlFor="complement">Compl\u00e9ment d'adresse (optionnel)</Label>
          <Input
            id="complement"
            placeholder="B\u00e2timent, \u00e9tage, digicode, interphone..."
            value={complementAdresse}
            onChange={(e) => setComplementAdresse(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Pr\u00e9cisez les informations utiles pour le livreur
          </p>
        </div>

        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button
            onClick={validateAddress}
            disabled={validating || !facturationAddress?.ligne1}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {validating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                V\u00e9rification...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Je confirme cette adresse
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
