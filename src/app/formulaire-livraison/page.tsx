'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { getTenantConfig } from '@/lib/tenants'

// ─── Types ───────────────────────────────────────────────────────

interface LivraisonData {
  id: string
  mode_livraison: string
  adresse_livraison: {
    ligne1: string
    ligne2: string | null
    cp: string | null
    ville: string | null
    complement: string | null
  } | null
}

interface ClientData {
  nom: string
  raison_sociale: string
  velo_devis: number
}

interface CreneauConfig {
  heure_debut: string
  heure_fin: string
  capacite_velos: number
}

interface DepotData {
  id: string
  nom: string
  type: string
  adresse: string
  code_postal: string
  ville: string
  jours_ouverture: string[] | null
  capacite_velos_jour: number | null
  creneau_duree_minutes: number | null
  creneaux: CreneauConfig[] | null
}

interface ValidateResponse {
  livraison: LivraisonData
  client: ClientData
  depot: DepotData | null
  error?: string
  alreadySubmitted?: boolean
  creneau?: {
    date: string
    heure_debut: string | null
    heure_fin: string | null
  }
}

interface TimeSlot {
  debut: string
  fin: string
  label: string
}

// ─── Helpers ─────────────────────────────────────────────────────

const JOUR_LABELS: Record<string, string> = {
  lundi: 'Lun',
  mardi: 'Mar',
  mercredi: 'Mer',
  jeudi: 'Jeu',
  vendredi: 'Ven',
  samedi: 'Sam',
  dimanche: 'Dim',
}

const JOUR_INDEX: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
}

function generateTimeSlots(durationMinutes: number): TimeSlot[] {
  const slots: TimeSlot[] = []
  const startHour = 8
  const endHour = 18

  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += durationMinutes) {
      const debut = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const totalMinEnd = h * 60 + m + durationMinutes
      const endH = Math.floor(totalMinEnd / 60)
      const endM = totalMinEnd % 60
      if (endH > endHour) break
      const fin = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
      slots.push({ debut, fin, label: `${debut} - ${fin}` })
    }
  }
  return slots
}

function getAvailableDates(joursOuverture: string[] | null, count: number = 10): string[] {
  const dates: string[] = []
  const allowedDays = new Set(
    (joursOuverture || ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'])
      .map(j => JOUR_INDEX[j.toLowerCase()])
      .filter((d): d is number => d !== undefined)
  )

  const cursor = new Date()
  cursor.setDate(cursor.getDate() + 2) // Minimum J+2

  while (dates.length < count) {
    if (allowedDays.has(cursor.getDay())) {
      const yyyy = cursor.getFullYear()
      const mm = String(cursor.getMonth() + 1).padStart(2, '0')
      const dd = String(cursor.getDate()).padStart(2, '0')
      dates.push(`${yyyy}-${mm}-${dd}`)
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Main Content ────────────────────────────────────────────────

function FormulaireLivraisonContent() {
  const tenant = getTenantConfig()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [existingCreneau, setExistingCreneau] = useState<{ date: string; heure_debut: string | null; heure_fin: string | null } | null>(null)

  const [livraison, setLivraison] = useState<LivraisonData | null>(null)
  const [client, setClient] = useState<ClientData | null>(null)
  const [depot, setDepot] = useState<DepotData | null>(null)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [confirmPersonne, setConfirmPersonne] = useState(false)
  const [confirmIdentite, setConfirmIdentite] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isRetrait = depot?.type === 'retrait'
  const isLogistique = depot?.type === 'logistique'

  // Validate token on mount
  const validateToken = useCallback(async () => {
    if (!token) {
      setError('Lien invalide. Veuillez utiliser le lien recu par email.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/formulaire-livraison/validate-token?token=${encodeURIComponent(token)}`)
      const data: ValidateResponse = await res.json()

      if (!res.ok) {
        if (data.alreadySubmitted && data.creneau) {
          setAlreadySubmitted(true)
          setExistingCreneau(data.creneau)
        } else {
          setError(data.error || 'Lien invalide ou expire')
        }
        setLoading(false)
        return
      }

      setLivraison(data.livraison)
      setClient(data.client)
      setDepot(data.depot)
    } catch {
      setError('Erreur de connexion. Veuillez reessayer.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    validateToken()
  }, [validateToken])

  // Available dates & time slots
  const availableDates = depot ? getAvailableDates(depot.jours_ouverture) : []
  // Utiliser les créneaux configurés du dépôt, sinon fallback sur génération automatique
  const timeSlots: TimeSlot[] = depot?.creneaux && depot.creneaux.length > 0
    ? depot.creneaux.map(c => ({ debut: c.heure_debut, fin: c.heure_fin, label: `${c.heure_debut} - ${c.heure_fin}` }))
    : depot?.creneau_duree_minutes ? generateTimeSlots(depot.creneau_duree_minutes) : generateTimeSlots(60)

  const canSubmit = selectedDate && selectedSlot && confirmPersonne && confirmIdentite && !submitting

  const handleSubmit = async () => {
    if (!canSubmit || !token || !selectedDate) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/formulaire-livraison/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          creneau_date: selectedDate,
          creneau_heure_debut: selectedSlot?.debut || '',
          creneau_heure_fin: selectedSlot?.fin || '',
          confirmPersonne,
          confirmIdentite,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Erreur lors de la soumission')
      }

      setSuccess(true)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue'
      setSubmitError(errMsg)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Loading ─────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Chargement...</p>
        </div>
      </div>
    )
  }

  // ─── Error ───────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h2>
          <p className="text-gray-500">{error}</p>
          <p className="text-sm text-gray-400 mt-4">
            Si le probleme persiste, contactez-nous a{' '}
            <a href={`mailto:${tenant.email}`} className="underline">{tenant.email}</a>
          </p>
        </div>
      </div>
    )
  }

  // ─── Already Submitted ───────────────────────────
  if (alreadySubmitted && existingCreneau) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Creneau deja choisi</h2>
          <p className="text-gray-500 mb-4">Vous avez deja selectionne un creneau pour cette livraison.</p>
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <p className="text-sm font-medium text-gray-700">Votre creneau :</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">
              {formatDateFr(existingCreneau.date)}
            </p>
            {existingCreneau.heure_debut && existingCreneau.heure_fin && (
              <p className="text-sm text-gray-600 mt-1">
                {existingCreneau.heure_debut} - {existingCreneau.heure_fin}
              </p>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-4">
            Pour modifier votre creneau, contactez-nous a{' '}
            <a href={`mailto:${tenant.email}`} className="underline">{tenant.email}</a>
          </p>
        </div>
      </div>
    )
  }

  // ─── Success ─────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Creneau confirme !</h2>
          <p className="text-gray-500 mb-6">
            Votre {isRetrait ? 'retrait' : 'livraison'} est programmee.
          </p>

          <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Recapitulatif :</p>
            <div className="space-y-1">
              <p className="text-sm text-gray-900">
                <span className="font-semibold">Date :</span> {selectedDate && formatDateFr(selectedDate)}
              </p>
              {selectedSlot && (
                <p className="text-sm text-gray-900">
                  <span className="font-semibold">Horaire :</span> {selectedSlot.label}
                </p>
              )}
              {isRetrait && depot && (
                <p className="text-sm text-gray-900 mt-2">
                  <span className="font-semibold">Lieu :</span> {depot.nom}<br />
                  <span className="text-gray-500">{depot.adresse}, {depot.code_postal} {depot.ville}</span>
                </p>
              )}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left mb-6">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Rappel :</span> Une piece d&apos;identite sera demandee lors de la {isRetrait ? 'recuperation' : 'reception'} du velo cargo.
            </p>
          </div>

          <p className="text-sm text-gray-400">
            Une question ? Contactez-nous a{' '}
            <a href={`mailto:${tenant.email}`} className="underline">{tenant.email}</a>
            {tenant.phone && (
              <> ou au <a href={`tel:${tenant.phone}`} className="underline">{tenant.phoneFormatted}</a></>
            )}
          </p>

          <p className="text-xs text-gray-300 mt-6">
            Vous pouvez fermer cette page en toute securite.
          </p>
        </div>
      </div>
    )
  }

  // ─── Main Form ───────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Image
            src={tenant.branding.logo}
            alt={tenant.branding.logoAlt}
            width={40}
            height={40}
            className="rounded"
          />
          <div>
            <h1 className="text-lg font-bold text-gray-900">{tenant.name}</h1>
            <p className="text-xs text-gray-500">Choix du creneau de {isRetrait ? 'retrait' : 'livraison'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Client info */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Informations</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Beneficiaire</span>
              <span className="font-medium text-gray-900">{client?.nom}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Societe</span>
              <span className="font-medium text-gray-900">{client?.raison_sociale}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nombre de velos</span>
              <span className="font-medium text-gray-900">{client?.velo_devis || 1}</span>
            </div>
            {isRetrait && depot && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-gray-500 mb-1">Point de retrait</p>
                <p className="font-medium text-gray-900">{depot.nom}</p>
                <p className="text-gray-500">{depot.adresse}</p>
                <p className="text-gray-500">{depot.code_postal} {depot.ville}</p>
              </div>
            )}
            {isLogistique && livraison?.adresse_livraison && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-gray-500 mb-1">Adresse de livraison</p>
                <p className="font-medium text-gray-900">{livraison.adresse_livraison.ligne1}</p>
                {livraison.adresse_livraison.ligne2 && (
                  <p className="text-gray-500">{livraison.adresse_livraison.ligne2}</p>
                )}
                <p className="text-gray-500">
                  {livraison.adresse_livraison.cp} {livraison.adresse_livraison.ville}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Jours d'ouverture info */}
        {depot?.jours_ouverture && depot.jours_ouverture.length > 0 && (
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Jours disponibles :</span>{' '}
              {depot.jours_ouverture.map(j => JOUR_LABELS[j.toLowerCase()] || j).join(', ')}
            </p>
          </div>
        )}

        {/* Date picker */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Choisissez une date
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Selectionnez la date souhaitee pour {isRetrait ? 'le retrait' : 'la livraison'} de votre velo cargo.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
            {availableDates.map(dateStr => {
              const d = new Date(dateStr + 'T00:00:00')
              const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short' })
              const dayNum = d.getDate()
              const month = d.toLocaleDateString('fr-FR', { month: 'short' })
              const isSelected = selectedDate === dateStr

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dateStr)
                    setSelectedSlot(null)
                  }}
                  className={`
                    p-3 rounded-lg border text-center transition-all text-sm
                    ${isSelected
                      ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                    }
                  `}
                >
                  <span className="block text-xs uppercase tracking-wide opacity-70">{dayName}</span>
                  <span className="block text-lg font-bold leading-tight">{dayNum}</span>
                  <span className="block text-xs opacity-70">{month}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Time slot picker */}
        {selectedDate && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Choisissez un creneau horaire
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Selectionnez le creneau qui vous convient.
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
              {timeSlots.map(slot => {
                const isSelected = selectedSlot?.debut === slot.debut

                return (
                  <button
                    key={slot.debut}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`
                      p-2.5 rounded-lg border text-center transition-all text-sm
                      ${isSelected
                        ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                      }
                    `}
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Confirmations */}
        {selectedDate && selectedSlot && (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Confirmations obligatoires</h2>

            {/* Confirm personne */}
            <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={confirmPersonne}
                onChange={e => setConfirmPersonne(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 shrink-0"
              />
              <span className="text-sm text-gray-700 leading-relaxed">
                Je confirme que <span className="font-semibold">{client?.nom}</span>{' '}
                {isRetrait
                  ? 'sera present(e) pour recuperer le(s) velo(s) cargo.'
                  : 'sera present(e) pour receptionner le(s) velo(s) cargo.'
                }
                <span className="text-red-500 ml-0.5">*</span>
              </span>
            </label>

            {/* Confirm identite */}
            <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={confirmIdentite}
                onChange={e => setConfirmIdentite(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-gray-300 text-gray-900 focus:ring-gray-900 shrink-0"
              />
              <span className="text-sm text-gray-700 leading-relaxed">
                Je comprends qu&apos;une <span className="font-semibold">piece d&apos;identite</span> sera demandee
                lors {isRetrait ? 'du retrait' : 'de la livraison'}.
                <span className="text-red-500 ml-0.5">*</span>
              </span>
            </label>
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-800">{submitError}</p>
          </div>
        )}

        {/* Submit button */}
        <div className="pb-8">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`
              w-full py-4 rounded-xl font-semibold text-base transition-all
              ${canSubmit
                ? 'bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98] shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Confirmation en cours...
              </span>
            ) : (
              `Confirmer ${isRetrait ? 'le retrait' : 'la livraison'}`
            )}
          </button>
        </div>

        {/* Footer */}
        <footer className="text-center pb-8">
          <p className="text-xs text-gray-400">
            {tenant.texts.copyright}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Une question ?{' '}
            <a href={`mailto:${tenant.email}`} className="underline">{tenant.email}</a>
            {tenant.phone && (
              <> | <a href={`tel:${tenant.phone}`} className="underline">{tenant.phoneFormatted}</a></>
            )}
          </p>
        </footer>
      </main>
    </div>
  )
}

// ─── Page (with Suspense for useSearchParams) ────────────────────

export default function FormulaireLivraisonPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    }>
      <FormulaireLivraisonContent />
    </Suspense>
  )
}
