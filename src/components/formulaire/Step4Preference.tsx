'use client'

import { useState, useEffect } from 'react'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ArrowLeft, ArrowRight, AlertCircle, Info, Store, Truck, CheckCircle, Euro } from 'lucide-react'

type PreferenceMode = 'retrait' | 'livraison_gratuite' | 'livraison_payante'

export function Step4Preference() {
  const { clientId, data, updateData, nextStep, prevStep, isHorsZone } = useFormulaireStore()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preference, setPreference] = useState<PreferenceMode | null>(null)
  const [preferencesLivraison, setPreferencesLivraison] = useState(data.preferencesLivraison || '')

  // Déterminer les options disponibles selon le mode de livraison défini à l'étape 3
  // data.modeLivraison est défini par l'API save-address à l'étape 3
  // data.zoneLivraison indique dans quelle zone se trouve le client: 'gratuite', 'payante', ou 'hors_zone'
  const modeLivraisonActuel = data.modeLivraison
  const depotRetrait = data.depotRetrait
  const zoneLivraison = data.zoneLivraison || 'gratuite'
  const depotType = data.depotType || 'logistique' // Type du dépôt le plus proche
  const prixLivraison = data.prixLivraisonPayante || 0

  // Logique des options selon le type de dépôt et la zone:
  //
  // DEPOT DE RETRAIT:
  // - Zone gratuite (0-30km): Retrait gratuit uniquement
  // - Zone payante (30-50km): Retrait gratuit OU livraison payante (choix)
  // - Hors zone (>50km): Alerte, sera recontacté
  //
  // DEPOT LOGISTIQUE:
  // - Zone gratuite (0-30km): Livraison gratuite
  // - Zone payante (30-50km): Livraison payante
  // - Hors zone (>50km): Alerte, sera recontacté

  const isDepotRetrait = depotType === 'retrait'
  const isZoneGratuite = zoneLivraison === 'gratuite'
  const isZonePayante = zoneLivraison === 'payante'

  // Pour dépôt retrait en zone gratuite, seul le retrait est possible
  const isRetraitSeul = isDepotRetrait && isZoneGratuite
  // Pour dépôt retrait en zone payante, choix entre retrait gratuit ou livraison payante
  const isRetraitOuLivraisonPayante = isDepotRetrait && isZonePayante
  // Pour dépôt logistique en zone gratuite, livraison gratuite
  const isLivraisonGratuite = !isDepotRetrait && isZoneGratuite
  // Pour dépôt logistique en zone payante, livraison payante uniquement
  const isLivraisonPayanteSeule = !isDepotRetrait && isZonePayante

  useEffect(() => {
    // Pré-sélectionner l'option par défaut selon la zone et le type de dépôt
    if (isRetraitSeul || isRetraitOuLivraisonPayante) {
      // Dépôt retrait: retrait par défaut
      setPreference('retrait')
    } else if (isLivraisonGratuite) {
      // Dépôt logistique zone gratuite
      setPreference('livraison_gratuite')
    } else if (isLivraisonPayanteSeule) {
      // Dépôt logistique zone payante
      setPreference('livraison_payante')
    } else {
      // Hors zone
      setPreference('livraison_payante')
    }
  }, [isRetraitSeul, isRetraitOuLivraisonPayante, isLivraisonGratuite, isLivraisonPayanteSeule])

  const handleSubmit = async () => {
    if (!preference) {
      setError('Veuillez sélectionner une option')
      return
    }

    // Préférences de livraison obligatoires pour livraison domicile
    if (preference !== 'retrait' && !preferencesLivraison.trim()) {
      setError('Veuillez renseigner vos préférences de livraison (disponibilités, instructions particulières...)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Mettre à jour le store avec la préférence
      updateData({
        preferenceMode: preference,
        modeLivraisonFinal: preference === 'retrait' ? 'retrait' : 'domicile',
        livraisonPayante: preference === 'livraison_payante',
        preferencesLivraison: preference !== 'retrait' ? preferencesLivraison.trim() || undefined : undefined,
      })

      // TODO: Appeler une API pour sauvegarder la préférence si nécessaire

      nextStep()
    } catch (err) {
      console.error('Erreur:', err)
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Truck className="w-8 h-8 text-foreground" />
        </div>
        <CardTitle>Préférence de réception</CardTitle>
        <CardDescription>
          Choisissez comment vous souhaitez recevoir votre vélo cargo
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Info sur l'adresse sélectionnée - masquée en mode retrait seul */}
        {data.adresseLivraison && !isRetraitSeul && (
          <div className="bg-muted/50 rounded-lg p-4 border">
            <p className="text-sm font-medium text-muted-foreground mb-1">Adresse de livraison :</p>
            <p className="font-medium">{data.adresseLivraison.ligne1}</p>
            {data.adresseLivraison.ligne2 && <p className="text-sm text-muted-foreground">{data.adresseLivraison.ligne2}</p>}
            <p>{data.adresseLivraison.codePostal} {data.adresseLivraison.ville}</p>
          </div>
        )}

        {/* Options selon la zone et le type de dépôt */}
        <RadioGroup
          value={preference || undefined}
          onValueChange={(v) => setPreference(v as PreferenceMode)}
          className="space-y-3"
        >
          {/* CAS 1: Dépôt retrait - Zone gratuite (retrait seul) */}
          {isRetraitSeul && (
            <>
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'retrait' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="retrait" id="retrait" className="mt-1" />
                <Label htmlFor="retrait" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Retrait au point relais</span>
                  </div>
                  {depotRetrait && (
                    <div className="text-sm text-muted-foreground mt-1">
                      <p className="font-medium text-foreground">{depotRetrait.nom}</p>
                      <p>{depotRetrait.adresse}</p>
                      <p>{depotRetrait.code_postal} {depotRetrait.ville}</p>
                      <p className="text-muted-foreground mt-1">Distance : {depotRetrait.distance} km</p>
                    </div>
                  )}
                </Label>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  Votre adresse est située à proximité d'un de nos points de retrait.
                  Vous pouvez y récupérer votre vélo rapidement.
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* CAS 2: Dépôt retrait - Zone payante (choix retrait gratuit OU livraison payante) */}
          {isRetraitOuLivraisonPayante && (
            <>
              {/* Option 1: Retrait gratuit */}
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'retrait' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="retrait" id="retrait" className="mt-1" />
                <Label htmlFor="retrait" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Retrait au point relais</span>
                  </div>
                  {depotRetrait && (
                    <div className="text-sm text-muted-foreground mt-1">
                      <p className="font-medium text-foreground">{depotRetrait.nom}</p>
                      <p>{depotRetrait.adresse}</p>
                      <p>{depotRetrait.code_postal} {depotRetrait.ville}</p>
                      <p className="text-muted-foreground mt-1">Distance : {depotRetrait.distance} km</p>
                    </div>
                  )}
                </Label>
              </div>

              {/* Option 2: Livraison payante */}
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'livraison_payante' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="livraison_payante" id="livraison_payante" className="mt-1" />
                <Label htmlFor="livraison_payante" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Livraison à domicile</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1 border">
                      <Euro className="h-3 w-3" />
                      Payant
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    La livraison à domicile est payante. Notre équipe vous contactera pour vous communiquer le montant exact.
                  </p>
                </Label>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Vous avez le choix entre le retrait au point relais ou la livraison payante à domicile.
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* CAS 3: Dépôt logistique - Zone gratuite (livraison gratuite) */}
          {isLivraisonGratuite && (
            <>
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'livraison_gratuite' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="livraison_gratuite" id="livraison_gratuite" className="mt-1" />
                <Label htmlFor="livraison_gratuite" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Livraison à domicile</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Votre vélo cargo sera livré directement à l'adresse indiquée.
                  </p>
                </Label>
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  Votre adresse est éligible à la livraison.
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* CAS 4: Dépôt logistique - Zone payante (livraison payante seule) */}
          {isLivraisonPayanteSeule && (
            <>
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'livraison_payante' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="livraison_payante" id="livraison_payante" className="mt-1" />
                <Label htmlFor="livraison_payante" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Livraison à domicile</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1 border">
                      <Euro className="h-3 w-3" />
                      Payant
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    La livraison à domicile est payante. Notre équipe vous contactera pour vous communiquer le montant exact.
                  </p>
                </Label>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Votre adresse est dans notre zone de livraison étendue. Notre équipe vous contactera pour les frais de livraison.
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* CAS 5: Hors zone */}
          {isHorsZone && (
            <>
              <div className={`flex items-start space-x-3 p-4 border rounded-lg bg-muted/50 border-border`}>
                <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Zone non couverte</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Votre adresse est située en dehors de notre zone de couverture.
                    Un conseiller vous contactera pour étudier les options disponibles.
                  </p>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nous avons bien enregistré votre demande. Notre équipe reviendra vers vous
                  rapidement pour discuter des possibilités de livraison dans votre secteur.
                </AlertDescription>
              </Alert>
            </>
          )}
        </RadioGroup>

        {/* Préférences de livraison — visible uniquement pour livraison domicile */}
        {preference && preference !== 'retrait' && (
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="preferencesLivraison" className="text-sm font-medium">
              Préférences de livraison <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="preferencesLivraison"
              placeholder="Ex : Je suis disponible le matin entre 8h et 12h. Merci de m'appeler 30 min avant."
              value={preferencesLivraison}
              onChange={(e) => {
                setPreferencesLivraison(e.target.value)
                if (error) setError(null)
              }}
              rows={3}
              required
            />
            <p className="text-xs text-muted-foreground">
              Indiquez vos disponibilités et instructions pour la livraison (obligatoire).
            </p>
          </div>
        )}

        {/* Boutons */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !preference}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                Confirmer
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
