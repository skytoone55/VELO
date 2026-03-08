'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle, Loader2, AlertCircle, Calendar, MapPin, Phone, Clock } from 'lucide-react'

const JOURS = [
  { id: 'lundi',    label: 'Lundi' },
  { id: 'mardi',    label: 'Mardi' },
  { id: 'mercredi', label: 'Mercredi' },
  { id: 'jeudi',    label: 'Jeudi' },
  { id: 'vendredi', label: 'Vendredi' },
  { id: 'samedi',   label: 'Samedi' },
]

const CRENEAUX = [
  { id: 'matin',      label: 'Matin',        detail: '8h – 12h' },
  { id: 'apres-midi', label: 'Après-midi',   detail: '12h – 17h' },
  { id: 'soir',       label: 'Soir',         detail: '17h – 20h' },
]

function buildDisponibilites(
  jours: string[],
  creneaux: string[],
  details: string,
  autreContact: string,
): string {
  const parts: string[] = []

  if (jours.length > 0) {
    const jourLabels = JOURS.filter(j => jours.includes(j.id)).map(j => j.label)
    parts.push(`Jours disponibles : ${jourLabels.join(', ')}`)
  }

  if (creneaux.length > 0) {
    const creneauLabels = CRENEAUX.filter(c => creneaux.includes(c.id))
      .map(c => `${c.label} (${c.detail})`)
    parts.push(`Créneaux préférés : ${creneauLabels.join(', ')}`)
  }

  if (details.trim()) {
    parts.push(`Informations complémentaires : ${details.trim()}`)
  }

  if (autreContact.trim()) {
    parts.push(`Autre contact / téléphone : ${autreContact.trim()}`)
  }

  return parts.join(' \u2014 ')
}

function RelanceContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  // Loading / error / done states
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)

  // Client data from API
  const [clientName, setClientName]                   = useState('')
  const [preferencesActuelles, setPreferencesActuelles] = useState('')
  const [adresse, setAdresse]                         = useState('')
  const [telephone, setTelephone]                     = useState('')

  // Form state
  const [joursSelectionnes, setJoursSelectionnes]     = useState<string[]>([])
  const [creneauxSelectionnes, setCreneauxSelectionnes] = useState<string[]>([])
  const [detailsComplementaires, setDetailsComplementaires] = useState('')
  const [autreContact, setAutreContact]               = useState('')

  const validate = useCallback(async () => {
    if (!token) { setError('Lien invalide ou expir\u00e9.'); setLoading(false); return }

    try {
      const res = await fetch('/api/relance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.error || 'Lien invalide ou expir\u00e9.'); setLoading(false); return }

      setClientName(data.raisonSociale || '')
      setPreferencesActuelles(data.preferencesActuelles || '')
      setAdresse(data.adresse || '')
      setTelephone(data.telephone || '')
    } catch {
      setError('Erreur de connexion. Veuillez r\u00e9essayer.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { validate() }, [validate])

  const toggleItem = (
    list: string[],
    setList: (v: string[]) => void,
    id: string,
  ) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const handleSubmit = async () => {
    if (joursSelectionnes.length === 0 && creneauxSelectionnes.length === 0 && !detailsComplementaires.trim()) {
      setError('Veuillez indiquer au moins un jour, un cr\u00e9neau ou des informations compl\u00e9mentaires.')
      return
    }

    setSubmitting(true)
    setError(null)

    const disponibilites = buildDisponibilites(
      joursSelectionnes,
      creneauxSelectionnes,
      detailsComplementaires,
      autreContact,
    )

    try {
      const res = await fetch('/api/relance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, disponibilites }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'enregistrement.')
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.')
    } finally {
      setSubmitting(false)
    }
  }

  // \u2500\u2500 Loading \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  // \u2500\u2500 Fatal error (token invalid) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (error && !clientName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-600 mb-1">Lien invalide</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // \u2500\u2500 Success \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full shadow-md">
          <CardContent className="pt-10 pb-10 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Merci !</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Vos disponibilit\u00e9s ont bien \u00e9t\u00e9 enregistr\u00e9es.<br />
              Notre \u00e9quipe vous recontactera dans les plus brefs d\u00e9lais<br />
              pour planifier la livraison de votre v\u00e9lo cargo.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // \u2500\u2500 Main form \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-5">

        {/* \u2500\u2500 Header card \u2500\u2500 */}
        <Card className="shadow-sm border-amber-200 bg-amber-50/60">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <Calendar className="w-6 h-6 text-amber-600" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-lg leading-tight">
                  Planification de votre livraison de v\u00e9lo cargo
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed text-gray-600">
                  {clientName ? (
                    <>Bonjour <strong className="text-gray-800">{clientName}</strong>,<br /></>
                  ) : null}
                  Nous n&apos;avons pas r\u00e9ussi \u00e0 vous joindre pour fixer un rendez-vous de livraison.
                  Merci de nous indiquer vos disponibilit\u00e9s ci-dessous \u2014 nous reviendrons vers vous rapidement.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* \u2500\u2500 Current info card \u2500\u2500 */}
        {(adresse || telephone || preferencesActuelles) && (
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Vos informations actuelles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {adresse && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Adresse de livraison</p>
                    <p className="text-sm font-medium text-gray-800">{adresse}</p>
                  </div>
                </div>
              )}
              {telephone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">T\u00e9l\u00e9phone enregistr\u00e9</p>
                    <p className="text-sm font-medium text-gray-800">{telephone}</p>
                  </div>
                </div>
              )}
              {preferencesActuelles && (
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Pr\u00e9f\u00e9rences indiqu\u00e9es lors de votre inscription</p>
                    <p className="text-sm text-gray-700 italic">{preferencesActuelles}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* \u2500\u2500 Availability form card \u2500\u2500 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vos nouvelles disponibilit\u00e9s</CardTitle>
            <CardDescription className="text-sm">
              Cochez les jours et cr\u00e9neaux qui vous conviennent le mieux.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Error banner */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Jours */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-800">Jours disponibles</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {JOURS.map(jour => (
                  <label
                    key={jour.id}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      joursSelectionnes.includes(jour.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <Checkbox
                      checked={joursSelectionnes.includes(jour.id)}
                      onCheckedChange={() =>
                        toggleItem(joursSelectionnes, setJoursSelectionnes, jour.id)
                      }
                    />
                    <span className="text-sm font-medium text-gray-700">{jour.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Cr\u00e9neaux horaires */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-800">Cr\u00e9neaux horaires pr\u00e9f\u00e9r\u00e9s</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CRENEAUX.map(creneau => (
                  <label
                    key={creneau.id}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      creneauxSelectionnes.includes(creneau.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <Checkbox
                      checked={creneauxSelectionnes.includes(creneau.id)}
                      onCheckedChange={() =>
                        toggleItem(creneauxSelectionnes, setCreneauxSelectionnes, creneau.id)
                      }
                    />
                    <div className="leading-none">
                      <p className="text-sm font-medium text-gray-700">{creneau.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{creneau.detail}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Informations compl\u00e9mentaires */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-800">
                Informations compl\u00e9mentaires
                <span className="ml-1 font-normal text-muted-foreground">(optionnel)</span>
              </label>
              <Textarea
                value={detailsComplementaires}
                onChange={(e) => setDetailsComplementaires(e.target.value)}
                placeholder="Code d'interphone, nom sur la bo\u00eete aux lettres, acc\u00e8s particulier, consignes pour le livreur\u2026"
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            {/* Autre num\u00e9ro de t\u00e9l\u00e9phone */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-800">
                Autre num\u00e9ro de contact
                <span className="ml-1 font-normal text-muted-foreground">(si diff\u00e9rent de celui enregistr\u00e9)</span>
              </label>
              <input
                type="tel"
                value={autreContact}
                onChange={(e) => setAutreContact(e.target.value)}
                placeholder="06 XX XX XX XX"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={
                submitting ||
                (joursSelectionnes.length === 0 &&
                  creneauxSelectionnes.length === 0 &&
                  !detailsComplementaires.trim())
              }
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Envoi en cours\u2026</>
                : 'Confirmer mes disponibilit\u00e9s'
              }
            </Button>

          </CardContent>
        </Card>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          Ces informations seront transmises \u00e0 notre \u00e9quipe logistique.<br />
          Nous vous confirmerons la date de livraison par t\u00e9l\u00e9phone ou par email.
        </p>

      </div>
    </div>
  )
}

export default function RelancePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Chargement...</div>}>
      <RelanceContent />
    </Suspense>
  )
}
