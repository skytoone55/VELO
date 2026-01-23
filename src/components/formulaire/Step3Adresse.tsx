'use client'

import { useState, useEffect } from 'react'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { Loader2, MapPin, ArrowLeft, ArrowRight, AlertCircle, Info, Building2, MapPinned, CheckCircle, Truck, Store } from 'lucide-react'
import { Depot } from '@/lib/types/database'

type AddressChoice = 'facturation' | 'autre'
type ViewState = 'address_choice' | 'result'

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

  const [viewState, setViewState] = useState<ViewState>('address_choice')
  const [addressChoice, setAddressChoice] = useState<AddressChoice>('facturation')
  const [showNewAddressForm, setShowNewAddressForm] = useState(false)
  const [facturationAddress, setFacturationAddress] = useState<{
    ligne1: string
    ligne2: string
    codePostal: string
    ville: string
  } | null>(null)

  const [newAdresse, setNewAdresse] = useState({
    ligne1: '',
    ligne2: '',
    codePostal: '',
    ville: '',
    latitude: 0,
    longitude: 0,
  })
  const [addressConfirmed, setAddressConfirmed] = useState(false)

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

  // Gestion du choix d'adresse
  const handleChoiceChange = (value: AddressChoice) => {
    setAddressChoice(value)
    setError(null)
    setShowNewAddressForm(value === 'autre')
  }

  const validateAddress = async () => {
    // Si nouvelle adresse, valider les champs
    if (addressChoice === 'autre') {
      if (!newAdresse.ligne1.trim() || !newAdresse.codePostal.trim() || !newAdresse.ville.trim()) {
        setError('Veuillez remplir tous les champs obligatoires')
        return
      }
    }

    setValidating(true)
    setError(null)

    try {
      const response = await fetch('/api/formulaire/save-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          useSocieteAddress: addressChoice === 'facturation',
          address: addressChoice === 'autre' ? newAdresse : null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Erreur lors de la sauvegarde')
        setValidating(false)
        return
      }

      // Sauvegarder l'adresse dans le store
      const finalAddress = addressChoice === 'facturation' ? facturationAddress : newAdresse

      // Stocker le résultat
      setValidationResult({
        modeLivraison: result.modeLivraison,
        zoneLivraison: result.zoneLivraison,
        depotType: result.depotType,
        depotRetrait: result.depotRetrait,
        depotLogistique: result.depotLogistique,
        prixLivraisonPayante: result.prixLivraisonPayante,
        horsZone: result.horsZone,
      })

      // Mettre à jour le store avec l'adresse, le mode et les infos de zone
      updateData({
        adresseLivraison: finalAddress!,
        modeLivraison: result.modeLivraison,
        zoneLivraison: result.zoneLivraison,
        depotType: result.depotType,
        depotRetrait: result.depotRetrait,
        depotLogistique: result.depotLogistique,
        prixLivraisonPayante: result.prixLivraisonPayante,
      })

      setHorsZone(result.horsZone)

      // Passer à l'affichage du résultat
      setViewState('result')
    } catch (err) {
      console.error('Erreur validation adresse:', err)
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setValidating(false)
    }
  }

  const handleContinue = () => {
    nextStep()
  }

  const handleBack = () => {
    if (viewState === 'result') {
      setViewState('address_choice')
      setValidationResult(null)
    } else {
      prevStep()
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    )
  }

  // Vue résultat : affiche où le client doit récupérer/recevoir son vélo
  if (viewState === 'result' && validationResult) {
    const { modeLivraison, depotRetrait, depotLogistique, horsZone } = validationResult
    const finalAddress = data.adresseLivraison

    // Si hors zone, on affiche quand même une confirmation de livraison à domicile
    // L'alerte admin a déjà été créée côté serveur
    if (horsZone) {
      return (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Truck className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>Livraison à votre adresse</CardTitle>
            <CardDescription>
              Votre vélo cargo sera livré directement chez vous
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Votre adresse a bien été enregistrée. Notre équipe vous contactera pour programmer la livraison.
              </AlertDescription>
            </Alert>

            <div className="bg-muted/50 rounded-lg p-4 border">
              <p className="text-sm font-medium text-muted-foreground mb-2">Adresse de livraison finale :</p>
              <p className="font-medium">{finalAddress?.ligne1}</p>
              {finalAddress?.ligne2 && <p className="text-sm text-muted-foreground">{finalAddress.ligne2}</p>}
              <p>{finalAddress?.codePostal} {finalAddress?.ville}</p>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Modifier
              </Button>
              <Button onClick={nextStep} className="flex-1">
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
            <CardTitle>Point de retrait assigné</CardTitle>
            <CardDescription>
              Vous récupérerez votre vélo cargo à ce point relais
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Bonne nouvelle ! Vous êtes à seulement {depotRetrait.distance} km d'un de nos points de retrait.
              </AlertDescription>
            </Alert>

            <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Store className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{depotRetrait.nom}</p>
                  <p className="text-muted-foreground">{depotRetrait.adresse}</p>
                  <p className="text-muted-foreground">{depotRetrait.code_postal} {depotRetrait.ville}</p>
                  <p className="text-sm text-primary mt-2">
                    Distance : {depotRetrait.distance} km de votre adresse
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 border">
              <p className="text-sm font-medium text-muted-foreground mb-2">Votre adresse de livraison finale :</p>
              <p className="font-medium">{finalAddress?.ligne1}</p>
              {finalAddress?.ligne2 && <p className="text-sm text-muted-foreground">{finalAddress.ligne2}</p>}
              <p>{finalAddress?.codePostal} {finalAddress?.ville}</p>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Vous serez contacté par email ou courrier pour convenir d'un créneau de retrait
                une fois votre dossier validé.
              </AlertDescription>
            </Alert>

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Modifier l'adresse
              </Button>
              <Button onClick={handleContinue} className="flex-1">
                Continuer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Livraison à domicile
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Truck className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle>Livraison à domicile confirmée</CardTitle>
          <CardDescription>
            Votre vélo cargo sera livré à l'adresse indiquée
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Alert className="bg-blue-50 border-blue-200">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              Votre adresse est éligible à la livraison à domicile.
            </AlertDescription>
          </Alert>

          <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Adresse de livraison finale</p>
                <p className="text-muted-foreground">{finalAddress?.ligne1}</p>
                {finalAddress?.ligne2 && <p className="text-muted-foreground">{finalAddress.ligne2}</p>}
                <p className="text-muted-foreground">{finalAddress?.codePostal} {finalAddress?.ville}</p>
              </div>
            </div>
          </div>

          {depotLogistique && (
            <div className="bg-muted/50 rounded-lg p-4 border">
              <p className="text-sm font-medium text-muted-foreground mb-2">Dépôt de départ :</p>
              <p className="font-medium">{depotLogistique.nom}</p>
              <p className="text-sm text-muted-foreground">{depotLogistique.ville}</p>
            </div>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Un créneau de livraison vous sera proposé par email ou courrier
              une fois votre dossier validé.
            </AlertDescription>
          </Alert>

          <div className="flex gap-4">
            <Button variant="outline" onClick={handleBack} className="flex-1">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Modifier l'adresse
            </Button>
            <Button onClick={handleContinue} className="flex-1">
              Continuer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Vue choix d'adresse
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <MapPin className="w-8 h-8 text-primary" />
        </div>
        <CardTitle>Adresse livraison finale</CardTitle>
        <CardDescription>
          Confirmez l'adresse où vous souhaitez recevoir votre vélo cargo
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Info importante en haut */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Votre adresse sera utilisée pour déterminer automatiquement
            le mode de livraison de votre vélo cargo.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Choix de l'adresse */}
        <RadioGroup value={addressChoice} onValueChange={(v) => handleChoiceChange(v as AddressChoice)} className="space-y-3">
          {/* Option 1: Utiliser l'adresse de facturation */}
          <div className={`p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${addressChoice === 'facturation' ? 'border-primary bg-primary/5' : ''}`}>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="facturation" id="facturation" className="mt-1" />
              <Label htmlFor="facturation" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="font-medium">Utiliser mon adresse de facturation</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  L'adresse enregistrée dans votre dossier
                </p>
              </Label>
            </div>

            {/* Afficher l'adresse de facturation juste en dessous de ce choix */}
            {facturationAddress && facturationAddress.ligne1 && (
              <div className="mt-3 ml-7 bg-muted/50 rounded-lg p-3 border">
                <p className="font-medium">{facturationAddress.ligne1}</p>
                {facturationAddress.ligne2 && <p className="text-sm text-muted-foreground">{facturationAddress.ligne2}</p>}
                <p className="text-sm">{facturationAddress.codePostal} {facturationAddress.ville}</p>
              </div>
            )}
          </div>

          {/* Option 2: Autre adresse */}
          <div className={`p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${addressChoice === 'autre' ? 'border-primary bg-primary/5' : ''}`}>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="autre" id="autre" className="mt-1" />
              <Label htmlFor="autre" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                  <MapPinned className="h-4 w-4 text-primary" />
                  <span className="font-medium">Utiliser une autre adresse</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Je souhaite indiquer une adresse différente
                </p>
              </Label>
            </div>
          </div>
        </RadioGroup>

        {/* Formulaire nouvelle adresse */}
        {showNewAddressForm && (
          <div className="grid gap-4 pt-4 border-t">
            <p className="text-sm font-medium">Nouvelle adresse de livraison :</p>

            <div className="space-y-2">
              <Label htmlFor="ligne1">Adresse *</Label>
              <AddressAutocomplete
                value={newAdresse.ligne1}
                onChange={(value) => {
                  setNewAdresse({ ...newAdresse, ligne1: value })
                  setAddressConfirmed(false)
                }}
                onSelect={(address) => {
                  setNewAdresse({
                    ...newAdresse,
                    ligne1: address.ligne1,
                    codePostal: address.codePostal,
                    ville: address.ville,
                    latitude: address.latitude,
                    longitude: address.longitude,
                  })
                  setAddressConfirmed(true)
                }}
                placeholder="Commencez à taper votre adresse..."
              />
              {addressConfirmed && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Adresse validée et géolocalisée
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ligne2">Complément d'adresse</Label>
              <Input
                id="ligne2"
                placeholder="Bâtiment, étage, etc."
                value={newAdresse.ligne2}
                onChange={(e) => setNewAdresse({ ...newAdresse, ligne2: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cp">Code postal *</Label>
                <Input
                  id="cp"
                  placeholder="97400"
                  value={newAdresse.codePostal}
                  onChange={(e) => setNewAdresse({ ...newAdresse, codePostal: e.target.value })}
                  maxLength={5}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="ville">Ville *</Label>
                <Input
                  id="ville"
                  placeholder="Saint-Denis"
                  value={newAdresse.ville}
                  onChange={(e) => setNewAdresse({ ...newAdresse, ville: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button onClick={validateAddress} disabled={validating} className="flex-1">
            {validating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Vérification...
              </>
            ) : (
              <>
                Valider
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
