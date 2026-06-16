'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, Check, X } from 'lucide-react'

/**
 * Repère visuel "RDV" pour le planning : indique qu'un confirmateur a eu le
 * client au téléphone et que celui-ci a VALIDÉ son rendez-vous.
 *
 * - OFF -> ON : un seul clic (passe au vert immédiatement).
 * - ON -> OFF : double validation (1er clic = "Retirer ?", 2e clic = confirme),
 *   pour éviter de retirer le vert par erreur.
 *
 * Ce n'est PAS un statut métier : juste un drapeau booléen (livraisons.rdv_confirme)
 * mémorisé pour rester affiché après rechargement et visible par tous les confirmateurs.
 * Composant autonome : il fait son propre PATCH et gère son état (optimiste).
 */
export function RdvToggle({
  livraisonId,
  initial,
  onChanged,
}: {
  livraisonId: string
  initial: boolean
  onChanged?: (value: boolean) => void
}) {
  const [confirmed, setConfirmed] = useState<boolean>(!!initial)
  const [saving, setSaving] = useState(false)
  const [confirmingOff, setConfirmingOff] = useState(false)

  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const patch = async (value: boolean) => {
    const previous = confirmed
    setSaving(true)
    setConfirmed(value) // optimiste -> réactif sans rechargement
    try {
      const res = await fetch(`/api/admin/livraisons/${livraisonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_confirme: value }),
      })
      if (!res.ok) {
        setConfirmed(previous) // rollback si échec
        return
      }
      onChanged?.(value)
    } catch {
      setConfirmed(previous)
    } finally {
      setSaving(false)
      setConfirmingOff(false)
    }
  }

  // État OFF : bouton contour, un clic pour valider le RDV
  if (!confirmed) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); patch(true) }}
        disabled={saving}
        title="Marquer le RDV comme confirmé par le client"
        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 transition-colors hover:border-green-500 hover:text-green-600"
      >
        {saving
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : <span className="h-2 w-2 rounded-full border border-current" />}
        RDV
      </button>
    )
  }

  // État ON, étape de double validation pour retirer
  if (confirmingOff) {
    return (
      <span
        onClick={stop}
        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700"
      >
        Retirer ?
        <button
          type="button"
          onClick={(e) => { stop(e); patch(false) }}
          disabled={saving}
          title="Confirmer le retrait du RDV"
          className="text-red-600 hover:text-red-700"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={(e) => { stop(e); setConfirmingOff(false) }}
          title="Annuler"
          className="text-gray-500 hover:text-gray-700"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    )
  }

  // État ON : pastille verte "RDV", clic = 1re étape du retrait
  return (
    <button
      type="button"
      onClick={(e) => { stop(e); setConfirmingOff(true) }}
      title="RDV confirmé — cliquer pour retirer"
      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white transition-colors hover:bg-green-600"
    >
      <CheckCircle2 className="h-3 w-3" />
      RDV
    </button>
  )
}
