'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, XCircle, Calendar, Clock, Loader2, AlertTriangle } from 'lucide-react'

export default function TourneeConfirmationPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<{
    clientName: string
    date: string | null
    creneauDebut: string | null
    creneauFin: string | null
    confirmationStatut: string | null
  } | null>(null)
  const [result, setResult] = useState<{
    statut: string
    message: string
  } | null>(null)
  const [showRefusForm, setShowRefusForm] = useState(false)
  const [commentaire, setCommentaire] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Lien invalide')
      setLoading(false)
      return
    }

    fetch(`/api/tournee/confirm?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setInfo(data)
        }
      })
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [token])

  const handleAction = async (action: 'confirmer' | 'refuser') => {
    if (!token) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/tournee/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action,
          commentaire: action === 'refuser' ? commentaire : undefined,
        }),
      })
      const data = await res.json()

      if (data.already_confirmed) {
        setResult({ statut: data.statut, message: data.error })
      } else if (data.success) {
        setResult({ statut: data.statut, message: data.message })
      } else {
        setError(data.error || 'Erreur')
      }
    } catch {
      setError('Erreur de connexion')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error && !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  // Already confirmed/refused
  if (info?.confirmationStatut && info.confirmationStatut !== 'en_attente') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          {info.confirmationStatut === 'confirmee' ? (
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          ) : (
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          )}
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {info.confirmationStatut === 'confirmee' ? 'Livraison confirmée' : 'Livraison refusée'}
          </h1>
          <p className="text-gray-600">
            Vous avez déjà {info.confirmationStatut === 'confirmee' ? 'confirmé' : 'refusé'} cette livraison.
          </p>
        </div>
      </div>
    )
  }

  // Result after action
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          {result.statut === 'confirmee' ? (
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          ) : (
            <XCircle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
          )}
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {result.statut === 'confirmee' ? 'Merci !' : 'Refus enregistré'}
          </h1>
          <p className="text-gray-600">{result.message}</p>
        </div>
      </div>
    )
  }

  // Main confirmation form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Confirmation de livraison</h1>
          {info?.clientName && (
            <p className="text-gray-600 mt-1">Bonjour {info.clientName}</p>
          )}
        </div>

        <div className="bg-blue-50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-blue-900">
              {formatDate(info?.date || null)}
            </span>
          </div>
          {(info?.creneauDebut || info?.creneauFin) && (
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-blue-800">
                Entre {info.creneauDebut || '09:00'} et {info.creneauFin || '18:00'}
              </span>
            </div>
          )}
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Votre vélo cargo est prêt pour la livraison. Confirmez votre disponibilité pour le créneau proposé.
        </p>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>
        )}

        {!showRefusForm ? (
          <div className="space-y-3">
            <button
              onClick={() => handleAction('confirmer')}
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle className="h-5 w-5" />
              )}
              Je confirme ma disponibilité
            </button>
            <button
              onClick={() => setShowRefusForm(true)}
              disabled={submitting}
              className="w-full bg-white border-2 border-gray-200 hover:border-red-300 hover:bg-red-50 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <XCircle className="h-5 w-5" />
              Ce créneau ne me convient pas
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Précisez vos disponibilités ou la raison du refus..."
              className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:border-blue-500 focus:outline-none"
              rows={3}
            />
            <button
              onClick={() => handleAction('refuser')}
              disabled={submitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              Confirmer le refus
            </button>
            <button
              onClick={() => setShowRefusForm(false)}
              disabled={submitting}
              className="w-full text-gray-500 hover:text-gray-700 text-sm py-2"
            >
              Annuler
            </button>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-6">
          PPE Energie — Livraison de vélos cargo
        </p>
      </div>
    </div>
  )
}
