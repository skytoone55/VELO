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
  Truck,
  Store,
  Euro,
  UserCheck,
  IdCard,
  Mail,
  Calendar,
  Phone,
  BookOpen,
  FileText,
} from 'lucide-react'
import { getTenantConfig } from '@/lib/tenants'

export function Step6Confirmation() {
  const tenant = getTenantConfig()
  const router = useRouter()
  const { clientId, data, prevStep, reset, isHorsZone } = useFormulaireStore()

  const [confirmPersonne, setConfirmPersonne] = useState(false)
  const [confirmIdentite, setConfirmIdentite] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!confirmPersonne || !confirmIdentite) {
      setError('Veuillez cocher les deux cases obligatoires')
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

      const text = await response.text()
      let result: any
      try {
        result = JSON.parse(text)
      } catch {
        throw new Error(
          text.length > 100
            ? 'Erreur serveur — veuillez réessayer dans quelques instants'
            : text || `Erreur serveur (${response.status})`
        )
      }

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

  // Déterminer le mode final
  const isRetrait = data.preferenceMode === 'retrait' || data.modeLivraisonFinal === 'retrait'
  const isLivraisonPayante = data.preferenceMode === 'livraison_payante' || data.livraisonPayante

  if (success) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Demande enregistrée !</h2>
          <p className="text-muted-foreground mb-4 max-w-md">
            Votre demande a été enregistrée avec succès.
          </p>

          {/* Bloc livraison prévue */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 max-w-md text-left">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-blue-900">
                  Livraison prévue entre Mars et Mai 2026
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  Selon les arrivages et les secteurs géographiques. Notre équipe vous contactera
                  pour {isRetrait ? 'convenir d\'un créneau de retrait' : 'programmer la livraison'} de votre vélo cargo.
                </p>
              </div>
            </div>
          </div>

          {/* Rappel Bicycode */}
          <Alert className="max-w-md mb-4 text-left">
            <Mail className="h-4 w-4" />
            <AlertDescription>
              N'oubliez pas de surveiller vos emails (y compris les spams) pour l'email
              de <span className="font-semibold">Bicycode</span> concernant l'identification de votre vélo.
            </AlertDescription>
          </Alert>

          {/* Rappel emails livraison */}
          <Alert className="max-w-md mb-4 text-left">
            <Mail className="h-4 w-4" />
            <AlertDescription>
              Restez attentif à vos emails. Vous recevrez des informations importantes concernant
              votre livraison depuis <span className="font-semibold">{tenant.email}</span>.
            </AlertDescription>
          </Alert>

          {/* Bloc contact */}
          <div className="bg-muted rounded-lg p-4 mb-6 max-w-md text-center">
            <p className="text-sm font-medium mb-2">Une question ?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm">
              <a href={`tel:${tenant.phone}`} className="flex items-center gap-1 text-foreground hover:underline">
                <Phone className="h-4 w-4" />
                {tenant.phoneFormatted}
              </a>
              <span className="hidden sm:inline text-muted-foreground">ou</span>
              <a href={`mailto:${tenant.email}`} className="flex items-center gap-1 text-foreground hover:underline">
                <Mail className="h-4 w-4" />
                {tenant.email}
              </a>
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center mt-6">
            Vous pouvez fermer cette page en toute sécurité.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
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
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Société
          </div>
          <div className="bg-muted rounded-lg p-3 text-sm">
            <div className="font-medium">{data.raisonSociale}</div>
            <div className="text-muted-foreground">SIRET: {data.siret}</div>
            {data.contactPrenom || data.contactNom ? (
              <div className="text-muted-foreground mt-1">
                Contact: {data.contactPrenom} {data.contactNom}
              </div>
            ) : null}
          </div>
        </div>

        <Separator />

        {/* Récap mode de réception */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {isRetrait ? (
              <Store className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Truck className="h-4 w-4 text-muted-foreground" />
            )}
            Mode de réception
          </div>
          <div className="bg-muted rounded-lg p-3 text-sm">
            {isRetrait ? (
              <>
                <div className="font-medium flex items-center gap-2">
                  Retrait en point relais
                </div>
                {data.depotRetrait && (
                  <div className="text-muted-foreground mt-1">
                    <span className="font-medium text-foreground">{data.depotRetrait.nom}</span><br />
                    {data.depotRetrait.adresse}<br />
                    {data.depotRetrait.code_postal} {data.depotRetrait.ville}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="font-medium flex items-center gap-2">
                  Livraison à domicile
                  {isLivraisonPayante && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1 border">
                      <Euro className="h-3 w-3" />
                      Payant
                    </span>
                  )}
                </div>
                {data.adresseLivraison && (
                  <div className="text-muted-foreground mt-1">
                    {data.adresseLivraison.ligne1}<br />
                    {data.adresseLivraison.ligne2 && <>{data.adresseLivraison.ligne2}<br /></>}
                    {data.complementAdresse && <>{data.complementAdresse}<br /></>}
                    {data.adresseLivraison.codePostal} {data.adresseLivraison.ville}
                  </div>
                )}
                {data.preferencesLivraison && (
                  <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                    <span className="text-xs font-medium text-foreground">Préférences de livraison :</span>
                    <div className="text-muted-foreground text-xs mt-0.5">{data.preferencesLivraison}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {isLivraisonPayante && (
          <Alert>
            <Euro className="h-4 w-4" />
            <AlertDescription>
              Des frais de livraison supplémentaires seront à votre charge.
              Notre équipe vous contactera pour confirmer le montant.
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* Confirmations obligatoires - 2 colonnes côte à côte */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            Confirmations obligatoires
          </div>

          {/* Grille 2 colonnes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bloc 1 - Confirmation personne */}
            <label
              htmlFor="confirmPersonne"
              className="flex flex-col p-4 border rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex justify-center mb-3">
                <UserCheck className="h-12 w-12 text-foreground" />
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirmPersonne"
                  checked={confirmPersonne}
                  onCheckedChange={(checked) => setConfirmPersonne(checked as boolean)}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-sm leading-relaxed">
                  {isRetrait ? (
                    <>
                      Je confirme que <span className="font-semibold">{data.contactPrenom} {data.contactNom}</span> viendra récupérer le matériel. *
                    </>
                  ) : (
                    <>
                      Je confirme que <span className="font-semibold">{data.contactPrenom} {data.contactNom}</span> réceptionnera la livraison. *
                    </>
                  )}
                </span>
              </div>
            </label>

            {/* Bloc 2 - Confirmation pièce d'identité */}
            <label
              htmlFor="confirmIdentite"
              className="flex flex-col p-4 border rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              {/* Icônes des documents acceptés */}
              <div className="flex justify-center gap-4 mb-3">
                <div className="flex flex-col items-center gap-1">
                  <IdCard className="h-8 w-8 text-foreground" />
                  <span className="text-[10px] text-muted-foreground">Carte d&apos;identité</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <BookOpen className="h-8 w-8 text-foreground" />
                  <span className="text-[10px] text-muted-foreground">Passeport</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <IdCard className="h-8 w-8 text-foreground" />
                  <span className="text-[10px] text-muted-foreground">Permis de conduire</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <FileText className="h-8 w-8 text-foreground" />
                  <span className="text-[10px] text-muted-foreground">Titre de séjour</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirmIdentite"
                  checked={confirmIdentite}
                  onCheckedChange={(checked) => setConfirmIdentite(checked as boolean)}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-sm leading-relaxed">
                  {isRetrait ? (
                    <>
                      Je comprends qu'une <span className="font-semibold">pièce d'identité</span> (l'un de ces documents) sera demandée lors du retrait. *
                    </>
                  ) : (
                    <>
                      Je comprends qu'une <span className="font-semibold">pièce d'identité</span> (l'un de ces documents) sera demandée à la livraison. *
                    </>
                  )}
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1" disabled={submitting}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={submitting || !confirmPersonne || !confirmIdentite}
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
