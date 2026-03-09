'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, UserCheck, IdCard, Loader2, AlertCircle } from 'lucide-react'

function ConfirmCreneauContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [confirmPersonne, setConfirmPersonne] = useState(false)
  const [confirmIdentite, setConfirmIdentite] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch client name from token to personalise checkbox label
  const [clientName, setClientName] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/livraisons/info-creneau?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.clientName) setClientName(d.clientName)
      })
      .catch(() => {
        // non-critical — label will use generic text
      })
  }, [token])

  const handleConfirm = async () => {
    if (!confirmPersonne || !confirmIdentite) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/livraisons/confirm-creneau?token=${encodeURIComponent(token)}`
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la confirmation')
      }
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-3">
          Votre présence est confirmée.
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          À bientôt !
        </p>
      </div>
    )
  }

  const bothChecked = confirmPersonne && confirmIdentite

  return (
    <>
      <div className="flex justify-center mb-6">
        <CheckCircle className="h-14 w-14 text-green-500" />
      </div>

      <h1 className="text-xl font-semibold text-gray-900 mb-2 text-center">
        Confirmation de votre créneau
      </h1>
      <p className="text-gray-500 text-sm text-center mb-8 leading-relaxed">
        Avant de confirmer votre présence, veuillez cocher les deux cases ci-dessous.
      </p>

      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Checkbox 1 */}
      <label
        htmlFor="confirmPersonne"
        className="flex items-start gap-4 p-4 border rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors mb-4"
      >
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <UserCheck className="h-8 w-8 text-gray-600" />
        </div>
        <div className="flex items-start gap-3 flex-1">
          <input
            type="checkbox"
            id="confirmPersonne"
            checked={confirmPersonne}
            onChange={(e) => setConfirmPersonne(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0 cursor-pointer"
          />
          <span className="text-sm text-gray-700 leading-relaxed">
            Je confirme que c&apos;est bien moi
            {clientName ? (
              <>, <strong>{clientName}</strong>,</>
            ) : null}
            {' '}qui serai présent(e) pour réceptionner le(s) vélo(s) cargo
          </span>
        </div>
      </label>

      {/* Checkbox 2 */}
      <label
        htmlFor="confirmIdentite"
        className="flex items-start gap-4 p-4 border rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors mb-8"
      >
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <IdCard className="h-8 w-8 text-gray-600" />
        </div>
        <div className="flex items-start gap-3 flex-1">
          <input
            type="checkbox"
            id="confirmIdentite"
            checked={confirmIdentite}
            onChange={(e) => setConfirmIdentite(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0 cursor-pointer"
          />
          <span className="text-sm text-gray-700 leading-relaxed">
            Je confirme que je disposerai d&apos;une{' '}
            <strong>pièce d&apos;identité valide</strong> lors de la réception
          </span>
        </div>
      </label>

      <button
        onClick={handleConfirm}
        disabled={!bothChecked || submitting}
        className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-white font-semibold text-base transition-colors
          bg-green-600 hover:bg-green-700
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Confirmation en cours…
          </>
        ) : (
          <>
            <CheckCircle className="h-5 w-5" />
            Confirmer
          </>
        )}
      </button>
    </>
  )
}

export default function ConfirmCreneauPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          }
        >
          <ConfirmCreneauContent />
        </Suspense>
      </div>
    </div>
  )
}
