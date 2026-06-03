'use client'

import { useState, useCallback, useMemo, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2, ArrowLeft, ArrowRight, MapPin, Bike, Clock, Route,
  X, Check, Users, Trash2, RotateCcw, Calendar, Truck, Navigation,
  Home, Package, ChevronLeft, ChevronRight, Pencil,
  ChevronUp, ChevronDown, GripVertical,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'

const TourneeMap = dynamic(() => import('./tournee-map'), { ssr: false })
import {
  getClientBikeCount, getTimeAtClient,
  estimateRoadDistance, estimateTravelTime,
} from '@/lib/tournees/optimizer'
import { PROCESS_STATUTS, STATUT_COLORS, type ProcessStatut } from '@/lib/constants'

// ─── Types ──────────────────────────────────────────────────────────────

type Method = 'departement' | 'cp' | 'client'
type Step = 'config' | 'proposal' | 'validation'

interface ProposedClient {
  id: string
  raison_sociale: string
  latitude: number
  longitude: number
  departement: string
  adresse_livraison_ville: string | null
  adresse_livraison_ligne1: string | null
  adresse_livraison_cp: string | null
  velo_devis: number
  velo_valide: number | null
  statut_commercial: string | null
  telephone: string | null
  email: string | null
  depot_logistique_id: string | null
}

interface TourStats {
  nbClients: number
  nbVelosTotal: number
  distanceTotaleKm: number
  dureeEstimeeMinutes: number
  dureeFormatted: string
  retourDepotKm?: number
  retourDepotMinutes?: number
  coutEssenceEur?: number
  coutPeageEur?: number
  coutTotalEur?: number
}

interface ClientDistance {
  distanceFromPrevKm: number
  travelMinutesFromPrev: number
}

interface Proposal {
  clients: ProposedClient[]
  stats: TourStats
  distances: ClientDistance[]
  clientsSansGPS: number
  totalEligibles: number
  totalClusters: number
  clusterIndex: number
  anchor: { lat: number; lng: number }
}

interface Livreur {
  id: string
  nom: string
  prenom: string
}

// ─── Constantes ─────────────────────────────────────────────────────────

const STATUTS_OPTIONS = [
  { value: 'controle_valide', label: 'Contrôle validé' },
  { value: 'formulaire_envoye', label: 'Formulaire envoyé' },
  { value: 'a_livrer', label: 'À livrer' },
  { value: 'en_livraison', label: 'En livraison' },
  { value: 'a_relivrer', label: 'À relivrer' },
]

const TEMPS_MAX_PRESETS = [20, 30, 40]
const TEMPS_MAX_DEFAULT = 30

const PIN_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ea580c', '#9333ea',
  '#0891b2', '#ca8a04', '#be185d', '#4f46e5', '#059669',
]

// ─── Wrapper Suspense pour useSearchParams ──────────────────────────────

export default function TourneesIntelligentesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Chargement...</div>}>
      <TourneesIntelligentesContent />
    </Suspense>
  )
}

// ─── Composant principal ────────────────────────────────────────────────

function TourneesIntelligentesContent() {
  const adminUser = useAdminUser()
  const searchParams = useSearchParams()

  // Params depuis le planning (mode créneau)
  const fromCreneau = searchParams.get('from_creneau') === '1'
  const paramCapacite = searchParams.get('capacite')
  const paramCapaciteMax = searchParams.get('capacite_max')
  const paramDepotId = searchParams.get('depot_id')
  const paramLivreurId = searchParams.get('livreur_id')
  const paramDate = searchParams.get('date')
  const paramInclude = searchParams.get('include')
  const paramCreneauDebut = searchParams.get('creneau_debut')
  const paramCreneauFin = searchParams.get('creneau_fin')

  // Params depuis la carte (mode zone)
  const fromZone = searchParams.get('method') === 'zone'
  const paramZoneLat = searchParams.get('zone_lat')
  const paramZoneLng = searchParams.get('zone_lng')
  const paramZoneRadius = searchParams.get('zone_radius')
  const paramMaxTravelMinutes = searchParams.get('max_travel_minutes')

  // State wizard
  const [step, setStep] = useState<Step>('config')
  const [isCreneauMode, setIsCreneauMode] = useState(false)
  const [isZoneMode, setIsZoneMode] = useState(false)

  // Contraintes créneau (durée max + capacité max vélos)
  const creneauDureeMinutes = useMemo(() => {
    if (!paramCreneauDebut || !paramCreneauFin) return null
    const [dh, dm] = paramCreneauDebut.split(':').map(Number)
    const [fh, fm] = paramCreneauFin.split(':').map(Number)
    return (fh * 60 + fm) - (dh * 60 + dm)
  }, [paramCreneauDebut, paramCreneauFin])
  const creneauCapaciteMax = paramCapaciteMax ? Math.max(1, parseInt(paramCapaciteMax) || 50) : null

  // Config — Bloc 1 : Vélos + Statuts
  const [capacite, setCapacite] = useState<number>(10)
  const [selectedStatuts, setSelectedStatuts] = useState<string[]>(['controle_valide', 'formulaire_envoye', 'a_livrer'])
  const [maxTravelMinutes, setMaxTravelMinutes] = useState<number>(TEMPS_MAX_DEFAULT)
  const [configReady, setConfigReady] = useState(false)

  // Config — Adresse de départ (optionnel)
  const [useDepartureAddress, setUseDepartureAddress] = useState(false)
  const [departureAddress, setDepartureAddress] = useState('')
  const [departureLat, setDepartureLat] = useState<number | null>(null)
  const [departureLng, setDepartureLng] = useState<number | null>(null)

  // Config — Bloc 2 : Méthode + Valeur
  const [method, setMethod] = useState<Method>('departement')
  const [value, setValue] = useState('')
  const [departements, setDepartements] = useState<string[]>([])
  const [cpSearch, setCpSearch] = useState('')
  const [cpResults, setCpResults] = useState<string[]>([])
  const [searchingCP, setSearchingCP] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<ProposedClient[]>([])
  const [searchingClients, setSearchingClients] = useState(false)
  const [selectedClientForSearch, setSelectedClientForSearch] = useState<ProposedClient | null>(null)

  // Proposal
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [removedClientIds, setRemovedClientIds] = useState<string[]>([])
  // Ordre manuel (réordonnancement par l'utilisateur). null = ordre proposé par l'algo.
  const [manualOrderIds, setManualOrderIds] = useState<string[] | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Validation
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [selectedLivreur, setSelectedLivreur] = useState('')
  const [livreurs, setLivreurs] = useState<Livreur[]>([])
  const [detectedDepotId, setDetectedDepotId] = useState<string | null>(null)
  const [detectedDepotName, setDetectedDepotName] = useState<string | null>(null)
  const [depotJoursOuverture, setDepotJoursOuverture] = useState<string[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ tournee_id: string; nb_livraisons: number; nb_deja_programmes?: number } | null>(null)

  // ─── Pré-remplir depuis les params URL (mode créneau) ──────────────

  useEffect(() => {
    if (!fromCreneau) return
    const cap = paramCapacite ? Math.max(1, parseInt(paramCapacite) || 10) : 10
    setCapacite(cap)
    if (paramDate) setSelectedDate(paramDate)
    if (paramDepotId) setDetectedDepotId(paramDepotId)
    if (paramLivreurId) setSelectedLivreur(paramLivreurId)

    // Mode créneau : pré-remplir mais rester sur la config (l'user ajuste nb vélos + statuts avant de calculer)
    if (paramInclude && paramInclude.length > 0) {
      setIsCreneauMode(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Pré-remplir depuis les params URL (mode zone) ─────────────────
  const [zoneClientIds, setZoneClientIds] = useState<string[] | null>(null)
  useEffect(() => {
    if (!fromZone) return
    if (paramZoneLat && paramZoneLng) {
      setIsZoneMode(true)
      // Capacité transmise par la carte (= nb vélos éligibles dans la zone)
      // pour que l'algo puisse traiter TOUS les clients de la zone par défaut.
      if (paramCapacite) {
        const cap = Math.max(1, parseInt(paramCapacite) || 10)
        setCapacite(cap)
      }
      // Temps max entre 2 clients adapté au rayon zone (sinon NN bloque dans son cluster)
      if (paramMaxTravelMinutes) {
        const mtt = Math.max(5, Math.min(999, parseInt(paramMaxTravelMinutes) || 30))
        setMaxTravelMinutes(mtt)
      }
      // Récupérer la liste exacte d'IDs éligibles transmise par la carte (localStorage)
      // Évite que la page tournée re-filtre la zone "à sa façon" et donne un nb différent.
      try {
        const raw = localStorage.getItem('tournee_zone_ids')
        if (raw) {
          const parsed = JSON.parse(raw)
          // Garde-fou : on n'utilise les IDs que s'ils sont récents (<5 min) et même zone
          const sameZone = String(parsed.lat) === paramZoneLat && String(parsed.lng) === paramZoneLng
          const fresh = Date.now() - (parsed.ts ?? 0) < 5 * 60 * 1000
          if (Array.isArray(parsed.ids) && sameZone && fresh) {
            setZoneClientIds(parsed.ids)
          }
          localStorage.removeItem('tournee_zone_ids')
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Résoudre le nom du dépôt quand detectedDepotId change ─────────

  useEffect(() => {
    if (!detectedDepotId) { setDetectedDepotName(null); return }
    fetch('/api/depots')
      .then(r => r.json())
      .then((depots: { id: string; nom: string; jours_ouverture?: string[] }[]) => {
        const found = depots.find(d => d.id === detectedDepotId)
        setDetectedDepotName(found?.nom ?? null)
        setDepotJoursOuverture(found?.jours_ouverture ?? null)
      })
      .catch(() => { setDetectedDepotName(null); setDepotJoursOuverture(null) })
  }, [detectedDepotId])

  // ─── Charger départements quand configReady ────────────────────────

  useEffect(() => {
    if (!configReady || selectedStatuts.length === 0) return
    const params = new URLSearchParams({ mode: 'departements', statuts: selectedStatuts.join(',') })
    fetch(`/api/admin/tournees-intelligentes?${params}`)
      .then(r => r.json())
      .then(d => { if (d.departements) setDepartements(d.departements) })
      .catch(() => {})
  }, [configReady, selectedStatuts])

  // ─── Handlers ───────────────────────────────────────────────────────

  // Valider Bloc 1 → afficher Bloc 2
  const confirmConfig = useCallback(() => {
    if (selectedStatuts.length === 0) {
      setError('Sélectionnez au moins un statut')
      return
    }
    setConfigReady(true)
    setError(null)
  }, [selectedStatuts])

  const searchCP = useCallback(async (prefix: string) => {
    setCpSearch(prefix)
    setValue('')
    if (prefix.length < 2) { setCpResults([]); return }
    setSearchingCP(true)
    try {
      const params = new URLSearchParams({ mode: 'cp', prefix, statuts: selectedStatuts.join(',') })
      const res = await fetch(`/api/admin/tournees-intelligentes?${params}`)
      const data = await res.json()
      if (data.codes_postaux) setCpResults(data.codes_postaux)
    } catch { /* ignore */ }
    setSearchingCP(false)
  }, [selectedStatuts])

  const searchClients = useCallback(async (query: string) => {
    setClientSearch(query)
    if (query.length < 2) { setClientResults([]); return }
    setSearchingClients(true)
    try {
      const params = new URLSearchParams({ mode: 'clients', search: query, statuts: selectedStatuts.join(',') })
      const res = await fetch(`/api/admin/tournees-intelligentes?${params}`)
      const data = await res.json()
      if (data.clients) setClientResults(data.clients as ProposedClient[])
    } catch { /* ignore */ }
    setSearchingClients(false)
  }, [selectedStatuts])

  // Fetch un cluster par son index
  const fetchCluster = useCallback(async (idx: number) => {
    setError(null)
    setLoading(true)
    const m = isZoneMode ? 'zone' : (isCreneauMode ? 'creneau' : method)
    const params = new URLSearchParams({
      method: m,
      statuts: selectedStatuts.join(','),
      capacite: capacite.toString(),
      cluster: idx.toString(),
    })
    if (m !== 'creneau' && m !== 'zone' && value) params.set('value', value)
    if (isCreneauMode && paramInclude) params.set('include', paramInclude)
    if (isZoneMode && paramZoneLat && paramZoneLng) {
      params.set('zone_lat', paramZoneLat)
      params.set('zone_lng', paramZoneLng)
      if (paramZoneRadius) params.set('zone_radius', paramZoneRadius)
      // IDs exacts transmis par la carte (filtrés selon les filtres carte) → l'API les utilise
      // tels quels au lieu de re-filtrer par bounding box + Haversine
      if (zoneClientIds && zoneClientIds.length > 0) {
        params.set('include', zoneClientIds.join(','))
      }
      // Mode zone = liste de clients choisie à la main sur la carte : on veut TOUS les
      // inclure dans la tournée. On lève donc le plafond de budget temps total (10h) qui,
      // sinon, coupe la tournée et laisse des clients de côté (le temps max entre 2 clients
      // reste réglable par l'utilisateur).
      params.set('budget_minutes', '100000')
    }
    // En mode créneau, limiter le budget temps à la durée du créneau
    if (isCreneauMode && creneauDureeMinutes) {
      params.set('budget_minutes', creneauDureeMinutes.toString())
    }
    // Temps max entre 2 clients (réglage utilisateur)
    if (maxTravelMinutes && maxTravelMinutes > 0) {
      params.set('max_travel_minutes', maxTravelMinutes.toString())
    }
    if (useDepartureAddress && departureLat && departureLng) {
      params.set('anchor_lat', departureLat.toString())
      params.set('anchor_lng', departureLng.toString())
    }
    // Passer le dépôt pour filtrer les clients rattachés
    if (detectedDepotId) params.set('depot_id', detectedDepotId)
    else if (paramDepotId) params.set('depot_id', paramDepotId)
    try {
      const res = await fetch(`/api/admin/tournees-intelligentes?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur'); setLoading(false); return }

      const depotCounts: Record<string, number> = {}
      for (const c of (data.clients ?? [])) {
        if (c.depot_logistique_id) {
          depotCounts[c.depot_logistique_id] = (depotCounts[c.depot_logistique_id] || 0) + 1
        }
      }
      const topDepot = Object.entries(depotCounts).sort((a, b) => b[1] - a[1])[0]
      setDetectedDepotId(topDepot ? topDepot[0] : null)

      setRemovedClientIds([])
      setManualOrderIds(null)
      setProposal(data)
    } catch {
      setError('Erreur de connexion')
    }
    setLoading(false)
  }, [method, value, selectedStatuts, capacite, useDepartureAddress, departureLat, departureLng, isCreneauMode, paramInclude, creneauDureeMinutes, maxTravelMinutes, detectedDepotId, paramDepotId, isZoneMode, paramZoneLat, paramZoneLng, paramZoneRadius, zoneClientIds])

  const calculate = useCallback(async () => {
    if (selectedStatuts.length === 0) {
      setError('Sélectionnez au moins un statut')
      return
    }
    // En mode créneau ou zone, pas besoin de value (les clients viennent du include / lat-lng-rayon)
    if (!isCreneauMode && !isZoneMode && !value) {
      setError('Remplissez tous les champs')
      return
    }
    await fetchCluster(0)
    setStep('proposal')
  }, [value, selectedStatuts, fetchCluster, isCreneauMode, isZoneMode])

  const loadLivreurs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ mode: 'livreurs' })
      if (detectedDepotId) params.set('depot_id', detectedDepotId)
      const res = await fetch(`/api/admin/tournees-intelligentes?${params}`)
      const data = await res.json()
      if (data.livreurs) {
        const list = data.livreurs as Livreur[]
        setLivreurs(list)
        // Auto-select : si l'user connecté est livreur et dans la liste, le sélectionner
        if (list.some(l => l.id === adminUser.id)) {
          setSelectedLivreur(adminUser.id)
        } else if (list.length === 1) {
          // Si un seul livreur dans le dépôt, le sélectionner par défaut
          setSelectedLivreur(list[0].id)
        }
      }
    } catch { /* ignore */ }
  }, [detectedDepotId, adminUser.id])

  const createTournee = useCallback(async () => {
    if (!proposal || !selectedDate) return
    setCreating(true)

    try {
      const res = await fetch('/api/admin/tournees-intelligentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_ids: visibleClients.map(c => c.id),
          date: selectedDate,
          livreur_id: selectedLivreur || null,
          depot_id: detectedDepotId || null,
          notes: `Tournée intelligente ${isCreneauMode ? 'créneau' : method} ${isCreneauMode ? '' : value} — ${visibleClients.length} clients, ${displayStats?.nbVelosTotal ?? 0} vélos`.trim(),
          ...(isCreneauMode && paramCreneauDebut ? { creneau_heure_debut: paramCreneauDebut } : {}),
          ...(isCreneauMode && paramCreneauFin ? { creneau_heure_fin: paramCreneauFin } : {}),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setCreated(data)
      } else {
        setError(data.error || 'Erreur création')
      }
    } catch {
      setError('Erreur de connexion')
    }

    setCreating(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, selectedDate, selectedLivreur, detectedDepotId, method, value, isCreneauMode, paramCreneauDebut, paramCreneauFin])

  const goToValidation = useCallback(() => {
    setStep('validation')
    loadLivreurs()
  }, [loadLivreurs])

  // Simulation suivante
  const nextSimulation = useCallback(() => {
    if (!proposal) return
    const next = (proposal.clusterIndex + 1) % proposal.totalClusters
    fetchCluster(next)
  }, [proposal, fetchCluster])

  // Simulation précédente
  const prevSimulation = useCallback(() => {
    if (!proposal) return
    const prev = (proposal.clusterIndex - 1 + proposal.totalClusters) % proposal.totalClusters
    fetchCluster(prev)
  }, [proposal, fetchCluster])

  // Reset complet
  const reset = useCallback(() => {
    setStep('config')
    setConfigReady(false)
    setProposal(null)
    setRemovedClientIds([])
    setManualOrderIds(null)
    setError(null)
    setCreated(null)
    setSelectedLivreur('')
    setDetectedDepotId(null)
    setDetectedDepotName(null)
    setValue('')
    setCpSearch('')
    setCpResults([])
    setClientSearch('')
    setClientResults([])
    setSelectedClientForSearch(null)
    setUseDepartureAddress(false)
    setDepartureAddress('')
    setDepartureLat(null)
    setDepartureLng(null)
    setIsCreneauMode(false)
  }, [])

  const mapCenter = useMemo(() => {
    if (proposal?.anchor) return proposal.anchor
    return { lat: 48.86, lng: 2.35 }
  }, [proposal])

  // Vérifier si la date sélectionnée est un jour d'ouverture du dépôt
  const isSelectedDateOpen = useMemo(() => {
    if (!depotJoursOuverture || !selectedDate) return true
    const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
    const dayName = JOURS[new Date(selectedDate + 'T00:00').getDay()]
    return depotJoursOuverture.includes(dayName)
  }, [depotJoursOuverture, selectedDate])

  // Clients visibles = proposal clients - retirés manuellement, dans l'ordre courant
  // (ordre manuel après réorganisation si défini, sinon ordre proposé par l'algo).
  const visibleClients = useMemo(() => {
    if (!proposal) return []
    const base = proposal.clients.filter(c => !removedClientIds.includes(c.id))
    if (!manualOrderIds) return base
    const byId = new Map(base.map(c => [c.id, c]))
    const ordered: ProposedClient[] = []
    for (const id of manualOrderIds) {
      const c = byId.get(id)
      if (c) { ordered.push(c); byId.delete(id) }
    }
    // Sécurité : tout client non listé (ajout tardif) reste à la fin
    for (const c of byId.values()) ordered.push(c)
    return ordered
  }, [proposal, removedClientIds, manualOrderIds])

  // ─── Réordonnancement manuel ────────────────────────────────────────
  // Règle : on dépose un client en position k → le DÉBUT (0..k inclus) est FIGÉ ;
  // la SUITE est recalculée en plus-proche-voisin (Haversine) en repartant du client k.
  // 100% local (vol d'oiseau), aucun appel réseau.
  const applyReorder = useCallback((clients: ProposedClient[], k: number) => {
    if (clients.length === 0) return clients
    const kk = Math.max(0, Math.min(k, clients.length - 1))
    const prefix = clients.slice(0, kk + 1)
    const pool = clients.slice(kk + 1)
    const suffix: ProposedClient[] = []
    let current = prefix[prefix.length - 1]
    const remaining = [...pool]
    while (remaining.length > 0) {
      let bestIdx = 0
      let bestD = Infinity
      for (let i = 0; i < remaining.length; i++) {
        const d = estimateRoadDistance(
          current.latitude, current.longitude,
          remaining[i].latitude, remaining[i].longitude,
        )
        if (d < bestD) { bestD = d; bestIdx = i }
      }
      const next = remaining.splice(bestIdx, 1)[0]
      suffix.push(next)
      current = next
    }
    return [...prefix, ...suffix]
  }, [])

  // Déplace un client de la position `from` vers la position `to`, fige le préfixe
  // jusqu'à `to` inclus, puis recalcule la suite en NN depuis ce client.
  const moveClient = useCallback((from: number, to: number) => {
    const list = visibleClients
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const arr = [...list]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    const recomputed = applyReorder(arr, to)
    setManualOrderIds(recomputed.map(c => c.id))
  }, [visibleClients, applyReorder])

  // Distances/temps par segment recalculés EN LOCAL pour l'ordre courant.
  // Index = position visible (segment depuis le client précédent → client i).
  // Pour i=0 : si point de départ défini, segment départ → 1er client.
  const segmentDistances = useMemo(() => {
    const clients = visibleClients
    const anchorPt = useDepartureAddress && departureLat != null && departureLng != null
      ? { lat: departureLat, lng: departureLng }
      : null
    return clients.map((c, i) => {
      if (i === 0) {
        if (!anchorPt) return { distanceFromPrevKm: 0, travelMinutesFromPrev: 0 }
        const km = estimateRoadDistance(anchorPt.lat, anchorPt.lng, c.latitude, c.longitude)
        return {
          distanceFromPrevKm: Math.round(km * 10) / 10,
          travelMinutesFromPrev: Math.round(estimateTravelTime(km)),
        }
      }
      const prev = clients[i - 1]
      const km = estimateRoadDistance(prev.latitude, prev.longitude, c.latitude, c.longitude)
      return {
        distanceFromPrevKm: Math.round(km * 10) / 10,
        travelMinutesFromPrev: Math.round(estimateTravelTime(km)),
      }
    })
  }, [visibleClients, useDepartureAddress, departureLat, departureLng])

  // Stats recalculées en local quand on retire OU réordonne un client.
  // Tant qu'on n'a ni retiré ni réorganisé, on garde les stats serveur (incluent retour dépôt / coûts).
  const displayStats = useMemo(() => {
    if (!proposal) return null
    if (removedClientIds.length === 0 && !manualOrderIds) return proposal.stats
    const clients = visibleClients
    if (clients.length === 0) return { nbClients: 0, nbVelosTotal: 0, distanceTotaleKm: 0, dureeEstimeeMinutes: 0, dureeFormatted: '0h00' }
    let nbVelosTotal = 0
    let dureeMinutes = 0
    let distanceKm = 0
    for (let i = 0; i < clients.length; i++) {
      const bikes = getClientBikeCount(clients[i])
      nbVelosTotal += bikes
      dureeMinutes += getTimeAtClient(bikes)
      if (i < clients.length - 1) {
        distanceKm += estimateRoadDistance(
          clients[i].latitude, clients[i].longitude,
          clients[i + 1].latitude, clients[i + 1].longitude,
        )
      }
    }
    dureeMinutes += estimateTravelTime(distanceKm)
    const hours = Math.floor(dureeMinutes / 60)
    const mins = Math.round(dureeMinutes % 60)
    return {
      nbClients: clients.length,
      nbVelosTotal,
      distanceTotaleKm: Math.round(distanceKm * 10) / 10,
      dureeEstimeeMinutes: Math.round(dureeMinutes),
      dureeFormatted: `${hours}h${mins.toString().padStart(2, '0')}`,
    }
  }, [proposal, removedClientIds, manualOrderIds, visibleClients])

  // ─── Rendu ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/planning">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Planning
          </Button>
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Route className="h-5 w-5 text-blue-600" />
          Tournée intelligente
        </h1>
      </div>

      {/* Stepper + bouton Tout recommencer à côté de "3. Validation" */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { key: 'config', label: '1. Configuration', icon: <Bike className="h-4 w-4" /> },
          { key: 'proposal', label: '2. Proposition', icon: <MapPin className="h-4 w-4" /> },
          { key: 'validation', label: '3. Validation', icon: <Check className="h-4 w-4" /> },
        ].map(({ key, label, icon }) => (
          <div
            key={key}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              step === key
                ? 'bg-blue-100 text-blue-700'
                : step > key
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
            }`}
          >
            {icon} {label}
          </div>
        ))}
        {step !== 'config' && (
          <Button variant="ghost" size="sm" onClick={() => setStep('config')} className="text-blue-500 hover:text-blue-700 ml-2">
            <Pencil className="h-3.5 w-3.5 mr-1" /> Modifier
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={reset} className="text-gray-500 hover:text-gray-700 ml-2">
          <RotateCcw className="h-4 w-4 mr-1" /> Tout recommencer
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ─── STEP 1 : Configuration ──────────────────────────────────── */}
      {step === 'config' && (
        <>
          {/* Bloc 1 : Vélos + Statuts + Adresse de départ */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">
                    Nb vélos (capacité camion)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={capacite || ''}
                    onChange={e => {
                      const raw = e.target.value
                      if (raw === '') { setCapacite(0); return }
                      let v = parseInt(raw) || 0
                      if (v > 500) v = 500
                      setCapacite(v)
                    }}
                    onBlur={() => { if (!capacite || capacite < 1) setCapacite(1) }}
                    className="w-24"
                    disabled={configReady}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Statuts clients</label>
                  <div className="flex items-center gap-3 h-10">
                    {STATUTS_OPTIONS.map(({ value: sv, label }) => (
                      <label key={sv} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={selectedStatuts.includes(sv)}
                          onCheckedChange={() => {
                            if (configReady) return
                            setSelectedStatuts(prev =>
                              prev.includes(sv) ? prev.filter(s => s !== sv) : [...prev, sv]
                            )
                          }}
                          disabled={configReady}
                        />
                        <span className="text-sm whitespace-nowrap">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Temps max entre 2 clients</label>
                  <div className="flex items-center gap-2 h-10">
                    {TEMPS_MAX_PRESETS.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { if (!configReady) setMaxTravelMinutes(p) }}
                        disabled={configReady}
                        className={`px-3 h-9 text-sm rounded border transition-colors ${
                          maxTravelMinutes === p
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        } ${configReady ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {p} min
                      </button>
                    ))}
                    <Input
                      type="number"
                      min={5}
                      max={999}
                      value={TEMPS_MAX_PRESETS.includes(maxTravelMinutes) ? '' : maxTravelMinutes}
                      placeholder="autre"
                      onChange={e => {
                        const raw = e.target.value
                        if (raw === '') return
                        const v = parseInt(raw)
                        if (!isNaN(v) && v >= 5 && v <= 999) setMaxTravelMinutes(v)
                      }}
                      disabled={configReady}
                      className="w-20 h-9"
                    />
                  </div>
                </div>

                {!configReady && (
                  <Button
                    onClick={confirmConfig}
                    disabled={selectedStatuts.length === 0 || (useDepartureAddress && !departureLat)}
                    className="bg-blue-600 hover:bg-blue-700 h-10"
                  >
                    Suivant <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}

                {configReady && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setConfigReady(false)
                      setValue('')
                      setCpSearch('')
                      setCpResults([])
                      setClientSearch('')
                      setClientResults([])
                      setSelectedClientForSearch(null)
                    }}
                    className="h-10"
                  >
                    Modifier
                  </Button>
                )}
              </div>

              {/* Adresse de départ */}
              {!configReady && (
                <div className="pt-3 border-t space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={useDepartureAddress}
                      onCheckedChange={() => {
                        setUseDepartureAddress(!useDepartureAddress)
                        if (useDepartureAddress) {
                          setDepartureAddress('')
                          setDepartureLat(null)
                          setDepartureLng(null)
                        }
                      }}
                    />
                    <Home className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Définir une adresse de départ</span>
                    <span className="text-xs text-gray-400 ml-1">(sinon : centre de la zone)</span>
                  </label>

                  {useDepartureAddress && (
                    <div className="flex items-center gap-2 ml-6">
                      <AddressAutocomplete
                        value={departureAddress}
                        onChange={setDepartureAddress}
                        onSelect={(addr) => {
                          setDepartureAddress(`${addr.ligne1}, ${addr.codePostal} ${addr.ville}`)
                          setDepartureLat(addr.latitude)
                          setDepartureLng(addr.longitude)
                        }}
                        placeholder="Ex: 10 rue Pierre Moulie, 94200 Ivry-sur-Seine"
                        className="w-96"
                      />
                      {departureLat && (
                        <Badge className="bg-green-100 text-green-700 text-xs shrink-0">
                          <Check className="h-3 w-3 mr-1" /> Localisé
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bloc créneau : pas de choix de zone, les clients viennent du créneau */}
          {configReady && isCreneauMode && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
                  <Users className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Mode créneau</strong> — {paramInclude?.split(',').filter(Boolean).length ?? 0} client(s) déjà dans le créneau
                    {paramCreneauDebut && paramCreneauFin && ` (${paramCreneauDebut.slice(0, 5)} – ${paramCreneauFin.slice(0, 5)}`}
                    {creneauDureeMinutes && `, ${Math.floor(creneauDureeMinutes / 60)}h${(creneauDureeMinutes % 60).toString().padStart(2, '0')})`}.
                    L&apos;algorithme va chercher des clients proches à ajouter pour remplir les {capacite} vélos.
                  </span>
                </div>
                <Button
                  onClick={calculate}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <><Route className="h-4 w-4 mr-1" /> Calculer la tournée</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Bloc zone : mode "tournée sur zone simulée" depuis la carte */}
          {configReady && isZoneMode && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Mode zone</strong> — centre <code>{paramZoneLat}, {paramZoneLng}</code>, rayon <strong>{paramZoneRadius || 30} km</strong>.
                    L&apos;algorithme va calculer la tournée optimale parmi les clients dans cette zone.
                  </span>
                </div>
                <Button
                  onClick={calculate}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <><Route className="h-4 w-4 mr-1" /> Calculer la tournée</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Bloc 2 : Méthode + Valeur (apparaît après validation du Bloc 1, hors mode créneau ni zone) */}
          {configReady && !isCreneauMode && !isZoneMode && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-4">
                  {/* Méthode */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Zone de recherche</label>
                    <Select value={method} onValueChange={(v: Method) => { setMethod(v); setValue(''); setClientResults([]); setCpSearch(''); setCpResults([]); setSelectedClientForSearch(null) }}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="departement">Par département</SelectItem>
                        <SelectItem value="cp">Par code postal</SelectItem>
                        <SelectItem value="client">Autour d&apos;un client</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Département */}
                  {method === 'departement' && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Département</label>
                      <Select value={value} onValueChange={setValue}>
                        <SelectTrigger className="w-28">
                          <SelectValue placeholder="..." />
                        </SelectTrigger>
                        <SelectContent>
                          {departements.map(d => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Code postal */}
                  {method === 'cp' && (
                    <div className="relative">
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Code postal</label>
                      {!value ? (
                        <>
                          <div className="relative">
                            <Input
                              placeholder="Tapez 93..."
                              value={cpSearch}
                              onChange={e => searchCP(e.target.value)}
                              className="w-32"
                              maxLength={5}
                            />
                            {searchingCP && (
                              <Loader2 className="h-4 w-4 animate-spin absolute right-2 top-3 text-gray-400" />
                            )}
                          </div>
                          {cpResults.length > 0 && (
                            <div className="absolute top-full mt-1 z-50 w-40 border rounded-lg bg-white shadow-lg divide-y max-h-48 overflow-y-auto">
                              {cpResults.map(cp => (
                                <button
                                  key={cp}
                                  onClick={() => { setValue(cp); setCpSearch(cp) }}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                                >
                                  {cp}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 h-10">
                          <Badge variant="secondary">{value}</Badge>
                          <button onClick={() => { setValue(''); setCpSearch(''); setCpResults([]) }}>
                            <X className="h-3 w-3 text-gray-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Client */}
                  {method === 'client' && (
                    <div className="relative">
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Client</label>
                      {!value ? (
                        <>
                          <div className="relative">
                            <Input
                              placeholder="Nom, SIRET ou email..."
                              value={clientSearch}
                              onChange={e => searchClients(e.target.value)}
                              className="w-64"
                            />
                            {searchingClients && (
                              <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3 text-gray-400" />
                            )}
                          </div>
                          {clientResults.length > 0 && (
                            <div className="absolute top-full mt-1 z-50 w-80 border rounded-lg bg-white shadow-lg divide-y max-h-48 overflow-y-auto">
                              {clientResults.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => { setValue(c.id); setClientSearch(c.raison_sociale); setSelectedClientForSearch(c) }}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between gap-2"
                                >
                                  <span className="font-medium truncate">{c.raison_sociale}</span>
                                  <span className="flex items-center gap-1.5 shrink-0">
                                    {c.statut_commercial && (
                                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                        c.statut_commercial === 'a_livrer' ? 'border-green-300 text-green-700 bg-green-50' :
                                        c.statut_commercial === 'controle_valide' ? 'border-blue-300 text-blue-700 bg-blue-50' :
                                        c.statut_commercial === 'livre' ? 'border-gray-300 text-gray-500' :
                                        'border-amber-300 text-amber-700 bg-amber-50'
                                      }`}>
                                        {c.statut_commercial.replace(/_/g, ' ')}
                                      </Badge>
                                    )}
                                    <span className="text-gray-400 text-xs">{c.adresse_livraison_cp} {c.adresse_livraison_ville}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 h-10">
                          <Badge variant="secondary">{clientSearch}</Badge>
                          <button onClick={() => { setValue(''); setClientSearch(''); setClientResults([]); setSelectedClientForSearch(null) }}>
                            <X className="h-3 w-3 text-gray-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bouton calcul */}
                  <Button
                    onClick={calculate}
                    disabled={loading || !value}
                    className="bg-blue-600 hover:bg-blue-700 h-10"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Route className="h-4 w-4 mr-1" /> Calculer</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── STEP 2 : Proposition ────────────────────────────────────── */}
      {step === 'proposal' && proposal && (
        <>
          {/* Bandeau récap */}
          <div className="grid grid-cols-7 gap-2">
            {[
              { icon: <Users className="h-4 w-4 text-blue-600" />, label: 'Clients', val: displayStats?.nbClients ?? 0 },
              { icon: <Bike className="h-4 w-4 text-green-600" />, label: 'Vélos', val: displayStats?.nbVelosTotal ?? 0 },
              { icon: <Clock className="h-4 w-4 text-orange-600" />, label: 'Durée', val: displayStats?.dureeFormatted ?? '0h00' },
              { icon: <Navigation className="h-4 w-4 text-purple-600" />, label: 'Distance', val: `${displayStats?.distanceTotaleKm ?? 0} km` },
              {
                icon: <MapPin className="h-4 w-4 text-amber-600" />,
                label: 'Retour dépôt',
                val: displayStats?.retourDepotKm != null
                  ? `${displayStats.retourDepotKm} km / ${displayStats.retourDepotMinutes ?? 0} min`
                  : '—',
              },
              {
                icon: <Bike className="h-4 w-4 text-emerald-700" />,
                label: 'Coût estimé',
                val: displayStats?.coutTotalEur != null
                  ? `~ ${displayStats.coutTotalEur.toFixed(2)} €`
                  : '—',
              },
              { icon: <MapPin className="h-4 w-4 text-red-600" />, label: 'Éligibles', val: `${proposal.totalEligibles}` },
            ].map(({ icon, label, val }) => (
              <Card key={label}>
                <CardContent className="px-3 py-2 flex items-center gap-2">
                  {icon}
                  <div>
                    <div className="text-[10px] text-gray-400 leading-none">{label}</div>
                    <div className="text-sm font-bold leading-tight">{val}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {proposal.clientsSansGPS > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-lg text-sm">
              {proposal.clientsSansGPS} client(s) sans coordonnées GPS dans cette zone (exclus du calcul)
            </div>
          )}

          {proposal.clients.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 text-gray-600 px-4 py-6 rounded-lg text-center">
              Aucun client trouvé avec ces critères. Essayez d&apos;élargir la zone ou les statuts.
            </div>
          )}

          {/* Carte + Liste */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-0 overflow-hidden rounded-lg">
                {visibleClients.length > 0 ? (
                  <TourneeMap
                    clients={visibleClients}
                    center={mapCenter}
                    anchorPoint={useDepartureAddress && departureLat && departureLng ? { lat: departureLat, lng: departureLng } : null}
                  />
                ) : (
                  <div className="h-[520px] bg-gray-100 flex items-center justify-center text-gray-400">
                    Aucun client à afficher
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Ordre de passage ({visibleClients.length} clients)
                  </h3>
                  {proposal.totalClusters > 1 && (
                    <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                      <Button variant="ghost" size="sm" onClick={prevSimulation} disabled={loading} className="h-6 w-6 p-0 hover:bg-blue-100">
                        <ChevronLeft className="h-4 w-4 text-blue-600" />
                      </Button>
                      <span className="text-xs font-medium text-blue-700 min-w-[100px] text-center">
                        {loading ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : `Simulation ${proposal.clusterIndex + 1} / ${proposal.totalClusters}`}
                      </span>
                      <Button variant="ghost" size="sm" onClick={nextSimulation} disabled={loading} className="h-6 w-6 p-0 hover:bg-blue-100">
                        <ChevronRight className="h-4 w-4 text-blue-600" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <p className="px-3 pb-1.5 text-[10px] text-gray-400">
                  Glissez une ligne (ou utilisez les flèches) pour réordonner. La suite est recalculée
                  automatiquement (plus proche voisin, vol d&apos;oiseau) à partir du point déposé.
                </p>
                <div className="divide-y">
                  {visibleClients.map((client, idx) => {
                    const bikes = getClientBikeCount(client)
                    const time = getTimeAtClient(bikes)
                    const dist = segmentDistances[idx]
                    const isDragging = dragIndex === idx
                    const isDragOver = dragOverIndex === idx
                    return (
                      <div key={client.id}>
                        {/* Distance depuis le point précédent (y compris départ → 1er client) */}
                        {dist && (idx > 0 || (idx === 0 && dist.distanceFromPrevKm > 0)) && (
                          <div className="flex items-center gap-1.5 px-3 py-0.5 text-[10px] text-gray-400">
                            <div className="flex-1 border-t border-dashed border-gray-200" />
                            {idx === 0 ? <Home className="h-2.5 w-2.5" /> : <Navigation className="h-2.5 w-2.5" />}
                            {idx === 0 ? 'Départ → ' : ''}{dist.distanceFromPrevKm} km — {dist.travelMinutesFromPrev} min
                            <div className="flex-1 border-t border-dashed border-gray-200" />
                          </div>
                        )}
                        <div
                          draggable
                          onDragStart={() => setDragIndex(idx)}
                          onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== idx) setDragOverIndex(idx) }}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (dragIndex !== null && dragIndex !== idx) moveClient(dragIndex, idx)
                            setDragIndex(null); setDragOverIndex(null)
                          }}
                          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                          className={`px-3 py-1.5 flex items-center justify-between group transition-colors ${
                            isDragging ? 'opacity-40' : isDragOver ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <GripVertical className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-400 cursor-grab shrink-0" />
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                              style={{ backgroundColor: PIN_COLORS[idx % PIN_COLORS.length] }}
                            >
                              {idx + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate">{client.raison_sociale}</div>
                              <div className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                                {client.adresse_livraison_cp} {client.adresse_livraison_ville}
                                <span className="text-gray-400">{bikes}v · {time}min</span>
                                {client.statut_commercial && (
                                  <span className={`inline-flex px-1 py-0.5 rounded text-[9px] font-medium leading-none ${STATUT_COLORS[client.statut_commercial as ProcessStatut] || 'bg-gray-100 text-gray-600'}`}>
                                    {PROCESS_STATUTS[client.statut_commercial as ProcessStatut] || client.statut_commercial}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => moveClient(idx, idx - 1)}
                              disabled={idx === 0}
                              className="p-1 rounded hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed"
                              title="Monter"
                            >
                              <ChevronUp className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                            <button
                              onClick={() => moveClient(idx, idx + 1)}
                              disabled={idx === visibleClients.length - 1}
                              className="p-1 rounded hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed"
                              title="Descendre"
                            >
                              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                            <button
                              onClick={() => setRemovedClientIds(prev => [...prev, client.id])}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
                              title="Retirer ce client"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400 hover:text-red-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {proposal.clients.length > 0 && (
            <div className="flex items-center justify-end">
              <Button onClick={goToValidation} className="bg-green-600 hover:bg-green-700">
                <Check className="h-4 w-4 mr-1" /> Valider cette tournée
              </Button>
            </div>
          )}
        </>
      )}

      {/* ─── STEP 3 : Validation ─────────────────────────────────────── */}
      {step === 'validation' && proposal && !created && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Planifier la tournée</h2>
            <p className="text-sm text-gray-500">
              {displayStats?.nbClients ?? 0} clients — {displayStats?.nbVelosTotal ?? 0} vélos — {displayStats?.dureeFormatted ?? '0h00'}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                {isCreneauMode ? 'Créneau de livraison' : 'Jour de livraison'}
              </label>
              {isCreneauMode && paramCreneauDebut && paramCreneauFin ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-100 text-purple-700 text-sm px-3 py-1">
                    {new Date(selectedDate + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {' '}— {paramCreneauDebut.slice(0, 5)} à {paramCreneauFin.slice(0, 5)}
                  </Badge>
                </div>
              ) : (
                <>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="w-52"
                    min={new Date().toISOString().split('T')[0]}
                  />
                  {depotJoursOuverture && selectedDate && (() => {
                    const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
                    const dayName = JOURS[new Date(selectedDate + 'T00:00').getDay()]
                    const isOpen = depotJoursOuverture.includes(dayName)
                    if (!isOpen) return (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <X className="h-3 w-3" /> Le dépôt est fermé le {dayName}. Jours d&apos;ouverture : {depotJoursOuverture.join(', ')}
                      </p>
                    )
                    return null
                  })()}
                </>
              )}
            </div>

            {detectedDepotId && (
              <div className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="text-gray-600">Dépôt auto-détecté :</span>
                <Badge variant="secondary">{detectedDepotName || detectedDepotId.slice(0, 8)}</Badge>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Truck className="h-4 w-4 text-blue-600" />
                Livreur (optionnel){detectedDepotId ? ' — filtré par dépôt' : ''}
              </label>
              <Select value={selectedLivreur} onValueChange={setSelectedLivreur}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Choisir un livreur..." />
                </SelectTrigger>
                <SelectContent>
                  {livreurs.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.prenom} {l.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {livreurs.length === 0 && detectedDepotId && (
                <p className="text-xs text-amber-600">Aucun livreur rattaché à ce dépôt</p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium mb-2">Récapitulatif</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {visibleClients.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-4">{i + 1}.</span>
                    <span className="truncate">{c.raison_sociale}</span>
                    <Badge variant="outline" className="text-xs ml-auto shrink-0">
                      {getClientBikeCount(c)} v
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep('proposal')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Retour
              </Button>
              <Button
                onClick={createTournee}
                disabled={creating || !selectedDate || !detectedDepotId || !isSelectedDateOpen}
                className="bg-green-600 hover:bg-green-700"
              >
                {creating ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Création...</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" /> Créer la tournée</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Confirmation ────────────────────────────────────────────── */}
      {created && (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold">Tournée créée !</h2>
            <p className="text-gray-600">
              {created.nb_livraisons} livraison{created.nb_livraisons > 1 ? 's' : ''} programmée{created.nb_livraisons > 1 ? 's' : ''} pour le{' '}
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {(created.nb_deja_programmes ?? 0) > 0 && (
              <p className="text-sm text-amber-600">
                {created.nb_deja_programmes} client{(created.nb_deja_programmes ?? 0) > 1 ? 's' : ''} déjà programmé{(created.nb_deja_programmes ?? 0) > 1 ? 's' : ''} ce jour — ignoré{(created.nb_deja_programmes ?? 0) > 1 ? 's' : ''}.
              </p>
            )}
            <p className="text-sm text-gray-400">
              {isCreneauMode && paramCreneauDebut
                ? `Les livraisons sont implantées dans le créneau ${paramCreneauDebut.slice(0, 5)} – ${paramCreneauFin?.slice(0, 5) ?? ''}.`
                : 'Les clients apparaissent dans le planning du jour. Glissez-les dans les créneaux souhaités.'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4 mr-1" /> Nouvelle tournée
              </Button>
              <Link href={`/admin/planning?${new URLSearchParams({ ...(detectedDepotId ? { depot_id: detectedDepotId } : {}), ...(selectedLivreur ? { livreur_id: selectedLivreur } : {}), date: selectedDate }).toString()}`}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <ArrowRight className="h-4 w-4 mr-1" /> Voir le planning
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
