'use client'

import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  ArrowRight,
  Fingerprint,
  Mail,
  Shield,
  UserPlus,
  CheckCircle2,
  Info,
  AlertTriangle,
  Bike,
} from 'lucide-react'

export function Step5Fnuci() {
  const { nextStep, prevStep } = useFormulaireStore()

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <Fingerprint className="w-8 h-8 text-blue-600" />
        </div>
        <CardTitle>Identification de votre vélo</CardTitle>
        <CardDescription>
          Information importante sur l'enregistrement FNUCI / Bicycode
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Section explicative principale */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-blue-900">
                Qu'est-ce que le FNUCI ?
              </p>
              <p className="text-sm text-blue-800 mt-1">
                Le <span className="font-semibold">Fichier National Unique des Cycles Identifiés</span> est
                une base de données nationale, comme une <span className="font-semibold">"carte grise"</span> pour
                votre vélo. Obligatoire depuis 2021, il permet d'identifier votre vélo en cas de vol ou de perte.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Étapes du processus */}
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            Ce qui va se passer
          </h3>

          {/* Étape 1 */}
          <div className="flex gap-4 items-start">
            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold">1</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Bike className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">Étiquette d'identification</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Une étiquette avec un code unique de <span className="font-semibold">10 caractères</span> sera
                apposée sur le cadre de votre vélo cargo lors de la livraison ou du retrait.
              </p>
            </div>
          </div>

          {/* Étape 2 */}
          <div className="flex gap-4 items-start">
            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold">2</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">Email de Bicycode</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Dans les jours suivants, vous recevrez un email de{' '}
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
                  no-reply@bicycode.eu
                </span>{' '}
                avec un code d'activation à 6 chiffres.
              </p>
            </div>
          </div>

          {/* Étape 3 */}
          <div className="flex gap-4 items-start">
            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold">3</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium">Création de votre "Garage à vélos"</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Vous devrez créer un compte sur le site Bicycode et valider vos coordonnées
                pour finaliser l'enregistrement de votre vélo.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Alerte importante - spam */}
        <Alert className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <span className="font-medium">Pensez à vérifier vos spams !</span>
            <br />
            L'email de Bicycode peut parfois arriver dans vos courriers indésirables.
          </AlertDescription>
        </Alert>

        {/* Récapitulatif */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-medium">Votre dossier est validé !</p>
          </div>
          <p className="text-sm text-green-600 mt-1">
            Il ne reste plus qu'à confirmer votre demande à l'étape suivante.
          </p>
        </div>

        {/* Boutons navigation */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button onClick={nextStep} className="flex-1 bg-green-600 hover:bg-green-700">
            J'ai compris
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
