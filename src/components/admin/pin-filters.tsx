'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Hook pour gérer les filtres figés par utilisateur et par page.
 * Stocke dans localStorage : `pinned_filters_${userId}_${pageKey}`
 *
 * Usage :
 * const { loadPinned, saveFilters } = usePinnedFilters(userId, 'clients')
 * // Au mount : loadPinned() retourne les filtres sauvegardés ou null
 * // Pour sauvegarder : saveFilters({ statut: 'all', depot: 'xyz', ... })
 */
export function usePinnedFilters(userId: string | undefined, pageKey: string) {
  const storageKey = userId ? `pinned_filters_${userId}_${pageKey}` : null

  const loadPinned = useCallback((): Record<string, any> | null => {
    if (!storageKey) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }, [storageKey])

  const saveFilters = useCallback((filters: Record<string, any>) => {
    if (!storageKey) return
    localStorage.setItem(storageKey, JSON.stringify(filters))
  }, [storageKey])

  const hasPinned = useCallback((): boolean => {
    if (!storageKey) return false
    return localStorage.getItem(storageKey) !== null
  }, [storageKey])

  return { loadPinned, saveFilters, hasPinned }
}

/**
 * Bouton compact "Figer" avec double validation.
 * Clic 1 : passe en mode confirmation ("Confirmer ?")
 * Clic 2 : exécute onPin()
 * Timeout 3s : revient à l'état normal si pas confirmé.
 */
interface PinFiltersButtonProps {
  onPin: () => void
  isPinned: boolean
}

export function PinFiltersButton({ onPin, isPinned }: PinFiltersButtonProps) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])

  const handleClick = () => {
    if (confirming) {
      onPin()
      setConfirming(false)
    } else {
      setConfirming(true)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className={`h-9 text-xs gap-1.5 transition-all ${
        confirming
          ? 'border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100'
          : isPinned
            ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'text-muted-foreground hover:text-foreground'
      }`}
      title={isPinned ? 'Filtres figés — cliquer pour mettre à jour' : 'Figer les filtres actuels comme vue par défaut'}
    >
      <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-current' : ''}`} />
      {confirming ? 'Confirmer ?' : 'Figer'}
    </Button>
  )
}
