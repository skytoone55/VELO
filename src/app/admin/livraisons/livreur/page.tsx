'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Loader2, Phone, MapPin, Bike, Clock, ChevronDown, ChevronUp,
  Truck, CheckCircle, AlertTriangle, Navigation,
} from 'lucide-react'
import { PROCESS_STATUTS, STATUT_COLORS } from '@/lib/constants'
import type { ProcessStatut } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LivraisonClient {
  id: string
  client_id: string
  statut: string | null
  creneau_date: string | null
  creneau_heure_debut: string | null
  creneau_heure_fin: string | null
  depot_id: string | null
  notes_internes: string | null
  adresse_livraison_ligne1: string | null
  adresse_livraison_cp: string | null
  adresse_livraison_ville: string | null
  tournee_position: number | null
  client: {
    id: string
    raison_sociale: string
    telephone: string | null
    velo_devis: number
    velo_valide: number | null
    latitude: number | null
    longitude: number | null
    statut_commercial: string | null
  } | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatTime(time: string | null): string {
  if (!time) return ''
  return time.slice(0, 5)
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

/** Nearest-neighbor route suggestion based on coordinates */
function suggestOrder(livraisons: LivraisonClient[]): number[] {
  const coords = livraisons.map((l, i) => ({
    index: i,
    lat: l.client?.latitude ?? 0,
    lng: l.client?.longitude ?? 0,
  }))

  if (coords.length <= 1) return coords.map((c) => c.index)

  const visited: boolean[] = new Array(coords.length).fill(false)
  const order: number[] = []

  // Start from the first delivery
  let current = 0
  visited[current] = true
  order.push(coords[current].index)

  for (let step = 1; step < coords.length; step++) {
    let nearest = -1
    let nearestDist = Infinity

    for (let j = 0; j < coords.length; j++) {
      if (visited[j]) continue
      const dist =
        Math.pow(coords[current].lat - coords[j].lat, 2) +
        Math.pow(coords[current].lng - coords[j].lng, 2)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = j
      }
    }

    if (nearest >= 0) {
      visited[nearest] = true
      order.push(coords[nearest].index)
      current = nearest
    }
  }

  return order
}

// ---------------------------------------------------------------------------
// Status card colors (livreur-specific)
// ---------------------------------------------------------------------------

const CARD_BORDER_COLORS: Record<string, string> = {
  en_attente: 'border-l-blue-500',
  programmee: 'border-l-blue-500',
  en_cours: 'border-l-orange-500',
  livree: 'border-l-green-500',
  annulee: 'border-l-gray-400',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LivreurDashboardPage() {
  const user = useAdminUser()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [todayLivraisons, setTodayLivraisons] = useState<LivraisonClient[]>([])
  const [tomorrowLivraisons, setTomorrowLivraisons] = useState<LivraisonClient[]>([])
  const [tomorrowOpen, setTomorrowOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [problemId, setProblemId] = useState<string | null>(null)
  const [problemNote, setProblemNote] = useState('')

  // -----------------------------------------------------------------------
  // Fetch livraisons
  // -----------------------------------------------------------------------

  const fetchLivraisons = useCallback(async () => {
    setLoading(true)
    try {
      const today = getToday()
      const tomorrow = getTomorrow()

      // Build query: livraisons for today or tomorrow, assigned to this livreur
      // or matching livreur's depot
      let query = supabase
        .from('livraisons')
        .select(`
          id, client_id, statut, creneau_date, creneau_heure_debut, creneau_heure_fin,
          depot_id, notes_internes, adresse_livraison_ligne1, adresse_livraison_cp,
          adresse_livraison_ville, tournee_position,
          client:clients!client_id (
            id, raison_sociale, telephone, velo_devis, velo_valide,
            latitude, longitude, statut_commercial
          )
        `)
        .in('creneau_date', [today, tomorrow])
        .order('tournee_position', { ascending: true, nullsFirst: false })
        .order('creneau_heure_debut', { ascending: true })

      // Filter by livreur assignment or depot
      if (user.role === 'livreur') {
        // Livreur sees their own assigned livraisons
        // OR livraisons from their depot that are unassigned
        query = query.or(
          `livreur_id.eq.${user.id}${
            user.depot_ids?.length
              ? `,and(livreur_id.is.null,depot_id.in.(${user.depot_ids.join(',')}))`
              : ''
          }`
        )
      }
      // admin/super_admin see all livraisons (no extra filter)

      const { data, error } = await query

      if (error) {
        console.error('Erreur chargement livraisons:', error)
        return
      }

      const livraisons = (data ?? []) as unknown as LivraisonClient[]

      setTodayLivraisons(
        livraisons
          .filter((l) => l.creneau_date === today)
          .sort((a, b) => {
            // Priorité : ordre de la tournée optimisée si disponible,
            // sinon fallback sur creneau_heure_debut.
            const ap = a.tournee_position
            const bp = b.tournee_position
            if (ap != null && bp != null) return ap - bp
            if (ap != null) return -1
            if (bp != null) return 1
            return (a.creneau_heure_debut ?? '').localeCompare(b.creneau_heure_debut ?? '')
          })
      )
      setTomorrowLivraisons(
        livraisons
          .filter((l) => l.creneau_date === tomorrow)
          .sort((a, b) => {
            // Priorité : ordre de la tournée optimisée si disponible,
            // sinon fallback sur creneau_heure_debut.
            const ap = a.tournee_position
            const bp = b.tournee_position
            if (ap != null && bp != null) return ap - bp
            if (ap != null) return -1
            if (bp != null) return 1
            return (a.creneau_heure_debut ?? '').localeCompare(b.creneau_heure_debut ?? '')
          })
      )
    } finally {
      setLoading(false)
    }
  }, [supabase, user])

  useEffect(() => {
    fetchLivraisons()
  }, [fetchLivraisons])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const updateStatus = useCallback(
    async (livraisonId: string, statut: string, note?: string) => {
      setActionLoading(livraisonId)
      try {
        const res = await fetch(`/api/admin/livraisons/${livraisonId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statut, note }),
        })

        if (!res.ok) {
          const err = await res.json()
          alert(err.error ?? 'Erreur lors de la mise à jour')
          return
        }

        // Refresh data
        await fetchLivraisons()
        setProblemId(null)
        setProblemNote('')
      } finally {
        setActionLoading(null)
      }
    },
    [fetchLivraisons]
  )

  // -----------------------------------------------------------------------
  // Route suggestion
  // -----------------------------------------------------------------------

  const suggestedOrder = useMemo(() => {
    const pending = todayLivraisons.filter((l) => l.statut !== 'livree' && l.statut !== 'annulee')
    if (pending.length < 2) return null
    const order = suggestOrder(pending)
    return order.map((idx) => pending[idx])
  }, [todayLivraisons])

  // -----------------------------------------------------------------------
  // Render card
  // -----------------------------------------------------------------------

  function renderLivraisonCard(livraison: LivraisonClient) {
    const client = livraison.client
    const isLoading = actionLoading === livraison.id
    const statut = livraison.statut ?? 'en_attente'
    const borderColor = CARD_BORDER_COLORS[statut] ?? 'border-l-gray-300'
    const clientStatut = client?.statut_commercial as ProcessStatut | undefined

    return (
      <Card
        key={livraison.id}
        className={`border-l-4 ${borderColor} mb-3 shadow-sm`}
      >
        <CardContent className="p-4">
          {/* Header: time + client name */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">
                  {formatTime(livraison.creneau_heure_debut)}
                  {livraison.creneau_heure_fin
                    ? ` - ${formatTime(livraison.creneau_heure_fin)}`
                    : ''}
                </span>
              </div>
              <p className="font-semibold text-base truncate">
                {client?.raison_sociale ?? 'Client inconnu'}
              </p>
            </div>
            {clientStatut && (
              <Badge
                className={`shrink-0 text-xs ${
                  STATUT_COLORS[clientStatut] ?? 'bg-gray-100 text-gray-800'
                }`}
              >
                {PROCESS_STATUTS[clientStatut] ?? clientStatut}
              </Badge>
            )}
          </div>

          {/* Address */}
          <div className="flex items-start gap-2 mb-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {livraison.adresse_livraison_ligne1 ?? 'Adresse non renseignée'}
              {livraison.adresse_livraison_cp
                ? `, ${livraison.adresse_livraison_cp}`
                : ''}
              {livraison.adresse_livraison_ville
                ? ` ${livraison.adresse_livraison_ville}`
                : ''}
            </span>
          </div>

          {/* Vélos count */}
          <div className="flex items-center gap-2 mb-3 text-sm">
            <Bike className="h-4 w-4 text-muted-foreground" />
            <span>
              {client?.velo_valide ?? client?.velo_devis ?? '?'} vélo
              {(client?.velo_valide ?? client?.velo_devis ?? 0) > 1 ? 's' : ''}
            </span>
          </div>

          {/* Phone */}
          {client?.telephone && (
            <a
              href={`tel:${client.telephone}`}
              className="flex items-center gap-2 mb-3 text-sm text-blue-600 active:text-blue-800"
            >
              <Phone className="h-4 w-4" />
              <span className="underline">{client.telephone}</span>
            </a>
          )}

          {/* Action buttons */}
          {statut !== 'livree' && statut !== 'annulee' && (
            <div className="flex flex-wrap gap-2">
              {statut !== 'en_cours' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 min-w-[100px] h-11 text-orange-700 border-orange-300 hover:bg-orange-50"
                  disabled={isLoading}
                  onClick={() => updateStatus(livraison.id, 'en_cours')}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Truck className="h-4 w-4 mr-1" />
                      En route
                    </>
                  )}
                </Button>
              )}

              <Button
                size="sm"
                className="flex-1 min-w-[100px] h-11 bg-green-600 hover:bg-green-700 text-white"
                disabled={isLoading}
                onClick={() => updateStatus(livraison.id, 'livree')}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Livré
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="flex-1 min-w-[100px] h-11 text-red-700 border-red-300 hover:bg-red-50"
                disabled={isLoading}
                onClick={() =>
                  setProblemId(problemId === livraison.id ? null : livraison.id)
                }
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Problème
              </Button>
            </div>
          )}

          {/* Problem note textarea */}
          {problemId === livraison.id && (
            <div className="mt-3 space-y-2">
              <textarea
                className="w-full border rounded-md p-3 text-sm min-h-[80px] resize-none"
                placeholder="Décrivez le problème rencontré..."
                value={problemNote}
                onChange={(e) => setProblemNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 h-10"
                  disabled={isLoading || !problemNote.trim()}
                  onClick={() =>
                    updateStatus(livraison.id, 'probleme', problemNote.trim())
                  }
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Signaler le problème'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10"
                  onClick={() => {
                    setProblemId(null)
                    setProblemNote('')
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* ---- Today ---- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">Aujourd&apos;hui</h1>
            <p className="text-sm text-muted-foreground capitalize">
              {formatDate(getToday())}
            </p>
          </div>
          <Badge variant="secondary" className="text-base px-3 py-1">
            {todayLivraisons.length}
          </Badge>
        </div>

        {todayLivraisons.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>Aucune livraison prévue aujourd&apos;hui</p>
            </CardContent>
          </Card>
        ) : (
          todayLivraisons.map(renderLivraisonCard)
        )}
      </section>

      {/* ---- Route suggestion ---- */}
      {suggestedOrder && suggestedOrder.length >= 2 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Navigation className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-800">
              Ordre suggéré pour optimiser votre tournée
            </h2>
          </div>
          <Card>
            <CardContent className="p-3">
              <ol className="space-y-1.5">
                {suggestedOrder.map((l, idx) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <span className="truncate">
                      {l.client?.raison_sociale ?? 'Client inconnu'}
                    </span>
                    <span className="text-muted-foreground text-xs ml-auto shrink-0">
                      {formatTime(l.creneau_heure_debut)}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ---- Tomorrow (collapsible) ---- */}
      <section>
        <button
          className="flex items-center justify-between w-full py-3 text-left"
          onClick={() => setTomorrowOpen(!tomorrowOpen)}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Demain</h2>
            <Badge variant="outline" className="text-sm">
              {tomorrowLivraisons.length}
            </Badge>
          </div>
          {tomorrowOpen ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {tomorrowOpen && (
          <div>
            {tomorrowLivraisons.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-6 text-center text-muted-foreground">
                  <p>Aucune livraison prévue demain</p>
                </CardContent>
              </Card>
            ) : (
              tomorrowLivraisons.map(renderLivraisonCard)
            )}
          </div>
        )}
      </section>
    </div>
  )
}
