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

  // D\u00e9terminer les options disponibles selon le mode de livraison d\u00e9fini \u00e0 l'\u00e9tape 3
  // data.modeLivraison est d\u00e9fini par l'API save-address \u00e0 l'\u00e9tape 3
  // data.zoneLivraison indique dans quelle zone se trouve le client: 'gratuite', 'payante', ou 'hors_zone'
  const modeLivraisonActuel = data.modeLivraison
  const depotRetrait = data.depotRetrait
  const zoneLivraison = data.zoneLivraison || 'gratuite'
  const depotType = data.depotType || 'logistique' // Type du d\u00e9p\u00f4t le plus proche
  const prixLivraison = data.prixLivraisonPayante || 0

  // Logique des options selon le type de d\u00e9p\u00f4t et la zone:
  //
  // DEPOT DE RETRAIT:
  // - Zone gratuite (0-30km): Retrait gratuit uniquement
  // - Zone payante (30-50km): Retrait gratuit OU livraison payante (choix)
  // - Hors zone (>50km): Alerte, sera recontact\u00e9
  //
  // DEPOT LOGISTIQUE:
  // - Zone gratuite (0-30km): Livraison gratuite
  // - Zone payante (30-50km): Livraison payante
  // - Hors zone (>50km): Alerte, sera recontact\u00e9

  const isDepotRetrait = depotType === 'retrait'
  const isZoneGratuite = zoneLivraison === 'gratuite'
  const isZonePayante = zoneLivraison === 'payante'

  // Pour d\u00e9p\u00f4t retrait en zone gratuite, seul le retrait est possible
  const isRetraitSeul = isDepotRetrait && isZoneGratuite
  // Pour d\u00e9p\u00f4t retrait en zone payante, choix entre retrait gratuit ou livraison payante
  const isRetraitOuLivraisonPayante = isDepotRetrait && isZonePayante
  // Pour d\u00e9p\u00f4t logistique en zone gratuite, livraison gratuite
  const isLivraisonGratuite = !isDepotRetrait && isZoneGratuite
  // Pour d\u00e9p\u00f4t logistique en zone payante, livraison payante uniquement
  const isLivraisonPayanteSeule = !isDepotRetrait && isZonePayante

  useEffect(() => {
    // Pr\u00e9-s\u00e9lectionner l'option par d\u00e9faut selon la zone et le type de d\u00e9p\u00f4t
    if (isRetraitSeul || isRetraitOuLivraisonPayante) {
      // D\u00e9p\u00f4t retrait: retrait par d\u00e9faut
      setPreference('retrait')
    } else if (isLivraisonGratuite) {
      // D\u00e9p\u00f4t logistique zone gratuite
      setPreference('livraison_gratuite')
    } else if (isLivraisonPayanteSeule) {
      // D\u00e9p\u00f4t logistique zone payante
      setPreference('livraison_payante')
    } else {
      // Hors zone
      setPreference('livraison_payante')
    }
  }, [isRetraitSeul, isRetraitOuLivraisonPayante, isLivraisonGratuite, isLivraisonPayanteSeule])

  const handleSubmit = async () => {
    if (!preference) {
      setError('Veuillez s\u00e9lectionner une option')
      return
    }

    // Pr\u00e9f\u00e9rences de livraison obligatoires pour livraison domicile
    if (preference !== 'retrait' && !preferencesLivraison.trim()) {
      setError('Veuillez renseigner vos pr\u00e9f\u00e9rences de livraison (disponibilit\u00e9s, instructions particuli\u00e8res...)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Mettre \u00e0 jour le store avec la pr\u00e9f\u00e9rence
      updateData({
        preferenceMode: preference,
        modeLivraisonFinal: preference === 'retrait' ? 'retrait' : 'domicile',
        livraisonPayante: preference === 'livraison_payante',
        preferencesLivraison: preference !== 'retrait' ? preferencesLivraison.trim() || undefined : undefined,
      })

      // TODO: Appeler une API pour sauvegarder la pr\u00e9f\u00e9rence si n\u00e9cessaire

      nextStep()
    } catch (err) {
      console.error('Erreur:', err)
      setError('Une erreur est survenue. R\u00e9essayez.')
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
        <CardTitle>Pr\u00e9f\u00e9rence de r\u00e9ception</CardTitle>
        <CardDescription>
          Choisissez comment vous souhaitez recevoir votre v\u00e9lo cargo
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Info sur l'adresse s\u00e9lectionn\u00e9e - masqu\u00e9e en mode retrait seul */}
        {data.adresseLivraison && !isRetraitSeul && (
          <div className="bg-muted/50 rounded-lg p-4 border">
            <p className="text-sm font-medium text-muted-foreground mb-1">Adresse de livraison :</p>
            <p className="font-medium">{data.adresseLivraison.ligne1}</p>
            {data.adresseLivraison.ligne2 && <p className="text-sm text-muted-foreground">{data.adresseLivraison.ligne2}</p>}
            <p>{data.adresseLivraison.codePostal} {data.adresseLivraison.ville}</p>
          </div>
        )}

        {/* Options selon la zone et le type de d\u00e9p\u00f4t */}
        <RadioGroup
          value={preference || undefined}
          onValueChange={(v) => setPreference(v as PreferenceMode)}
          className="space-y-3"
        >
          {/* CAS 1: D\u00e9p\u00f4t retrait - Zone gratuite (retrait seul) */}
          {isRetraitSeul && (
            <>
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'retrait' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="retrait" id="retrait" className="mt-1" />
                <Label htmlFor="retrait" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Retrait au point relais</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Gratuit</span>
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
                  Votre adresse est situ\u00e9e \u00e0 proximit\u00e9 d'un de nos points de retrait.
                  Le retrait est gratuit et vous permet de r\u00e9cup\u00e9rer votre v\u00e9lo rapidement.
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* CAS 2: D\u00e9p\u00f4t retrait - Zone payante (choix retrait gratuit OU livraison payante) */}
          {isRetraitOuLivraisonPayante && (
            <>
              {/* Option 1: Retrait gratuit */}
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'retrait' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="retrait" id="retrait" className="mt-1" />
                <Label htmlFor="retrait" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Retrait au point relais</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Gratuit</span>
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
                    <span className="font-medium">Livraison \u00e0 domicile</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1 border">
                      <Euro className="h-3 w-3" />
                      Payant
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    La livraison \u00e0 domicile est payante. Notre \u00e9quipe vous contactera pour vous communiquer le montant exact.
                  </p>
                </Label>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Vous avez le choix entre le retrait gratuit au point relais ou la livraison payante \u00e0 domicile.
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* CAS 3: D\u00e9p\u00f4t logistique - Zone gratuite (livraison gratuite) */}
          {isLivraisonGratuite && (
            <>
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'livraison_gratuite' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="livraison_gratuite" id="livraison_gratuite" className="mt-1" />
                <Label htmlFor="livraison_gratuite" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Livraison \u00e0 domicile</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Gratuit</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Votre v\u00e9lo cargo sera livr\u00e9 directement \u00e0 l'adresse indiqu\u00e9e.
                  </p>
                </Label>
              </div>

              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Bonne nouvelle ! Votre adresse est \u00e9ligible \u00e0 la livraison gratuite.
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* CAS 4: D\u00e9p\u00f4t logistique - Zone payante (livraison payante seule) */}
          {isLivraisonPayanteSeule && (
            <>
              <div className={`flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${preference === 'livraison_payante' ? 'border-foreground bg-muted' : ''}`}>
                <RadioGroupItem value="livraison_payante" id="livraison_payante" className="mt-1" />
                <Label htmlFor="livraison_payante" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Livraison \u00e0 domicile</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1 border">
                      <Euro className="h-3 w-3" />
                      Payant
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    La livraison \u00e0 domicile est payante. Notre \u00e9quipe vous contactera pour vous communiquer le montant exact.
                  </p>
                </Label>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Votre adresse est dans notre zone de livraison \u00e9tendue. Notre \u00e9quipe vous contactera pour les frais de livraison.
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
                    Votre adresse est situ\u00e9e en dehors de notre zone de couverture.
                    Un conseiller vous contactera pour \u00e9tudier les options disponibles.
                  </p>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nous avons bien enregistr\u00e9 votre demande. Notre \u00e9quipe reviendra vers vous
                  rapidement pour discuter des possibilit\u00e9s de livraison dans votre secteur.
                </AlertDescription>
              </Alert>
            </>
          )}
        </RadioGroup>

        {/* Pr\u00e9f\u00e9rences de livraison \u2014 visible uniquement pour livraison domicile */}
        {preference && preference !== 'retrait' && (
          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="preferencesLivraison" className="text-sm font-medium">
              Pr\u00e9f\u00e9rences de livraison <span className="text-red-500">*</span>
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
              Indiquez vos disponibilit\u00e9s et instructions pour la livraison (obligatoire).
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
