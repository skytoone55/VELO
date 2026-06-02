'use client'

import { useState } from 'react'
import { AlertTriangle, RotateCcw, Ban, UserX, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

type ActionKey = 'a_relivrer' | 'probleme_livraison' | 'retractation'

const ACTIONS: { key: ActionKey; label: string; icon: typeof RotateCcw; warn?: string }[] = [
  { key: 'a_relivrer', label: 'À relivrer', icon: RotateCcw },
  { key: 'probleme_livraison', label: 'Problème de livraison', icon: AlertTriangle },
  {
    key: 'retractation',
    label: 'Rétractation',
    icon: Ban,
    warn: 'Le client sera passé en Client HS (livraisons annulées, FNUCI libérés).',
  },
]

/**
 * Boutons d'action livreur sur une carte de livraison du planning.
 * Un seul bouton "Incident" ouvre un modal : choix de l'action + commentaire
 * obligatoire. Visible par tous les roles (les livreurs sont l'echelon le plus bas).
 *
 * Apres succes, emet l'evenement 'planning:refresh' que la page ecoute pour
 * recharger les donnees (pas de rechargement de page).
 */
export function LivreurActions({
  livraisonId,
  clientNom,
  triggerClassName,
  iconClassName = 'h-3 w-3',
}: {
  livraisonId: string
  clientNom: string
  triggerClassName?: string
  iconClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<ActionKey | null>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setOpen(false)
    setAction(null)
    setComment('')
    setLoading(false)
  }

  const submit = async () => {
    if (!action || !comment.trim() || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/planning/livraison-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livraisonId, action, commentaire: comment.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'action")

      const label = ACTIONS.find(a => a.key === action)?.label || 'Action'
      toast.success(`${label} enregistrée${action === 'retractation' ? ' — client passé HS' : ''}`)
      reset()
      window.dispatchEvent(new CustomEvent('planning:refresh'))
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'action")
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className={triggerClassName || 'shrink-0 inline-flex items-center justify-center rounded px-1 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors'}
        title="Signaler un incident (à relivrer / problème / rétractation)"
      >
        <AlertTriangle className={iconClassName} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!loading) reset() }}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white shadow-xl"
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">Action livreur — {clientNom}</h3>
              <button type="button" onClick={() => !loading && reset()} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              <div className="space-y-1.5">
                {ACTIONS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAction(key)}
                    className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm transition-colors ${
                      action === key
                        ? 'border-amber-500 bg-amber-50 text-amber-800'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {action === 'retractation' && (
                <div className="flex items-start gap-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                  <UserX className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{ACTIONS.find(a => a.key === 'retractation')?.warn}</span>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Commentaire <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Décris ce qui s'est passé…"
                  className="w-full resize-none rounded border px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <button
                type="button"
                onClick={() => !loading && reset()}
                disabled={loading}
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={loading || !action || !comment.trim()}
                className="inline-flex items-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
