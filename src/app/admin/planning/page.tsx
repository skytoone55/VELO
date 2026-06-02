'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Loader2, ChevronLeft, ChevronRight, Calendar, Truck,
  MapPin, Bike, Clock, Search, Eye, X, Trash2, Mail,
  Phone, Info, Pencil, Check, Users, Route, ArrowRight, Move, CalendarDays, Navigation,
  GripVertical,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { DELIVERY_STATUS } from '@/lib/constants'
import { LivreurActions } from './livreur-actions'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getTenantConfig } from '@/lib/tenants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DepotOption {
  id: string
  nom: string
  type: string
  jours_ouverture: string[] | null
  capacite_velos_jour: number | null
  creneau_duree_minutes: number | null
  actif: boolean | null
}

interface LivreurOption {
  id: string
  nom: string
  prenom: string
}

interface PlanningClient {
  id: string
  raison_sociale: string
  velo_devis: number
  velo_valide: number | null
  telephone: string | null
  email: string | null
  statut_commercial: string | null
  preferences_livraison: string | null
  adresse_livraison_ligne1: string | null
  adresse_livraison_cp: string | null
  adresse_livraison_ville: string | null
  adresse_societe_ligne1?: string | null
  adresse_societe_cp?: string | null
  adresse_societe_ville?: string | null
}

interface PlanningLivraison {
  id: string
  client_id: string | null
  mode_livraison: string
  statut: string | null
  creneau_date: string | null
  creneau_heure_debut: string | null
  creneau_heure_fin: string | null
  date_livraison: string | null
  date_programmation: string | null
  depot_id: string | null
  adresse_livraison_ligne1: string | null
  adresse_livraison_cp: string | null
  adresse_livraison_ville: string | null
  notes_admin: string | null
  complement_adresse: string | null
  heure_precise: string | null
  livreur_id: string | null
  tournee_id: string | null
  tournee_position: number | null
  created_at: string
  client: PlanningClient | null
}

interface CreneauConfig {
  heure_debut: string
  heure_fin: string
  capacite_velos: number
}

interface DepotFull {
  id: string
  nom: string
  type: string
  jours_ouverture: string[] | null
  capacite_velos_jour: number | null
  creneau_duree_minutes: number | null
  creneaux?: CreneauConfig[]
}

interface SelectedCreneau {
  date: string
  heure_debut: string
  heure_fin: string
  capacite: number
}

// ---------------------------------------------------------------------------
// Types for view modes
// ---------------------------------------------------------------------------

type ViewMode = 'jour' | '3jours' | 'semaine' | 'mois'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const JOURS_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const JOURS_LABELS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

function addMonths(d: Date, n: number): Date {
  const date = new Date(d)
  date.setMonth(date.getMonth() + n)
  return date
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function isSameDay(d1: Date, d2: Date): boolean {
  return formatDate(d1) === formatDate(d2)
}

function isSameMonth(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()
}

/** Returns all days needed to render a full month calendar grid (includes padding days from prev/next months). */
function getMonthCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  // getDay() 0=Sun, we want Mon=0 for our grid
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6 // Sunday -> 6
  const gridStart = addDays(firstDay, -startOffset)

  const days: Date[] = []
  // Always 42 cells (6 rows x 7 cols) for consistent grid height
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i))
  }
  return days
}

function getFirstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function getLastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

// ---------------------------------------------------------------------------
// Créneau helpers — "Journée entière" = 00:00 → 23:59
// ---------------------------------------------------------------------------

function isJourneeEntiere(c: { heure_debut: string }): boolean {
  return c.heure_debut.slice(0, 5) === '00:00'
}

/** Sort créneaux so the "Journée entière" slot (00:00) appears first. */
function sortCreneaux<T extends { heure_debut: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ja = isJourneeEntiere(a)
    const jb = isJourneeEntiere(b)
    if (ja && !jb) return -1
    if (!ja && jb) return 1
    return a.heure_debut.localeCompare(b.heure_debut)
  })
}

/**
 * Calcule l'index d'insertion d'un drop dans une liste de cartes livraison.
 * Cherche le conteneur des cartes (closest [data-livraison-list]) puis compare
 * la position Y de la souris au milieu de chaque carte (data-livraison-card).
 * Retourne l'index où insérer (0 = avant la 1re carte, N = à la fin).
 * Si aucun conteneur/carte trouvé → null (le caller traitera comme "fin").
 */
function computeDropIndex(e: React.DragEvent): number | null {
  const container = (e.target as HTMLElement)?.closest?.('[data-livraison-list]') as HTMLElement | null
  if (!container) return null
  const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-livraison-card]'))
  if (cards.length === 0) return 0
  const y = e.clientY
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    if (y < mid) return i
  }
  return cards.length
}

/**
 * Couleur du compteur de vélos d'un créneau selon le taux d'occupation.
 * <80% = vert, 80-100% = orange, >100% = rouge.
 * Pas applicable à "Journée entière" (pas de capacité).
 */
function creneauCapacityColor(slotVelos: number, capacite: number): string {
  if (capacite <= 0) return 'text-gray-600'
  const ratio = slotVelos / capacite
  if (ratio > 1) return 'text-red-600 font-bold'
  if (ratio >= 0.8) return 'text-orange-600 font-semibold'
  return 'text-green-600'
}


// ---------------------------------------------------------------------------
// Statut colors
// ---------------------------------------------------------------------------

const LIVRAISON_STATUT_COLORS: Record<string, string> = {
  en_attente: 'bg-yellow-100 text-yellow-800',
  en_livraison: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-orange-100 text-orange-800',
  livree: 'bg-green-100 text-green-800',
  annulee: 'bg-gray-100 text-gray-800',
}

function getStatutLabel(statut: string | null): string {
  if (!statut) return 'Inconnu'
  return DELIVERY_STATUS[statut as keyof typeof DELIVERY_STATUS] || statut
}

function getStatutColor(statut: string | null): string {
  if (!statut) return 'bg-gray-100 text-gray-800'
  return LIVRAISON_STATUT_COLORS[statut] || 'bg-gray-100 text-gray-800'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PlanningContent() {
  const adminUser = useAdminUser()
  const searchParams = useSearchParams()
  const initialDepotId = searchParams.get('depot_id')
  const initialDate = searchParams.get('date')
  const initialLivreurId = searchParams.get('livreur_id')

  // State
  const [depots, setDepots] = useState<DepotOption[]>([])
  const [selectedDepotId, setSelectedDepotId] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? '3jours' : 'semaine'
  )
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDate) { const d = new Date(initialDate + 'T00:00:00'); if (!isNaN(d.getTime())) return d }
    return new Date()
  })
  const [weekStart, setWeekStart] = useState<Date>(() => {
    if (initialDate) { const d = new Date(initialDate + 'T00:00:00'); if (!isNaN(d.getTime())) return getMonday(d) }
    return getMonday(new Date())
  })
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [livraisons, setLivraisons] = useState<PlanningLivraison[]>([])
  const [clientsALivrer, setClientsALivrer] = useState<PlanningClient[]>([])
  const [depot, setDepot] = useState<DepotFull | null>(null)
  const [miniCalMonth, setMiniCalMonth] = useState<Date>(() => getFirstOfMonth(new Date()))
  const [livreurs, setLivreurs] = useState<LivreurOption[]>([])
  const [selectedLivreurId, setSelectedLivreurId] = useState<string>('')
  const [placementOpen, setPlacementOpen] = useState(false)
  const [placementDate, setPlacementDate] = useState<string>('')
  const [placementCreneau, setPlacementCreneau] = useState<string | null>(null)
  const [placementSearch, setPlacementSearch] = useState('')
  const [placementResults, setPlacementResults] = useState<PlanningClient[]>([])
  const [placementLoading, setPlacementLoading] = useState(false)
  const [removingLivraisonId, setRemovingLivraisonId] = useState<string | null>(null)
  const [sendingMailByKey, setSendingMailByKey] = useState<Record<string, boolean>>({})
  const [mailPlanningMessage, setMailPlanningMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [bulkReschedulingDate, setBulkReschedulingDate] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false)
  const [selectedCreneau, setSelectedCreneau] = useState<SelectedCreneau | null>(null)
  const [moveDialogLivraison, setMoveDialogLivraison] = useState<PlanningLivraison | null>(null)
  const [moveDate, setMoveDate] = useState<string>('')
  const [moveLivreurId, setMoveLivreurId] = useState<string>('')
  const [moveCreneauKey, setMoveCreneauKey] = useState<string>('')
  const [moveSubmitting, setMoveSubmitting] = useState(false)
  const [allLivreurs, setAllLivreurs] = useState<LivreurOption[]>([])
  const [draggingLivraisonId, setDraggingLivraisonId] = useState<string | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const initialUrlApplied = useRef(false)

  // Week days array (Mon-Sun)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  // Filter livraisons by selected livreur (empty string or _all = show all)
  const filteredLivraisons = useMemo(() => {
    if (!selectedLivreurId || selectedLivreurId === '_all') return livraisons
    return livraisons.filter(l => l.livreur_id === selectedLivreurId || !l.livreur_id)
  }, [livraisons, selectedLivreurId])

  // Search: filter filteredLivraisons by client name
  const searchFilteredLivraisons = useMemo(() => {
    if (!searchQuery.trim()) return filteredLivraisons
    const q = searchQuery.toLowerCase()
    return filteredLivraisons.filter(l =>
      l.client?.raison_sociale?.toLowerCase().includes(q)
    )
  }, [filteredLivraisons, searchQuery])

  // Compute data range based on view mode
  const dataRange = useMemo(() => {
    if (viewMode === 'jour') {
      return { start: selectedDate, end: selectedDate }
    } else if (viewMode === '3jours') {
      return { start: selectedDate, end: addDays(selectedDate, 2) }
    } else if (viewMode === 'mois') {
      const first = getFirstOfMonth(selectedDate)
      const last = getLastOfMonth(selectedDate)
      // Extend to cover full calendar grid (prev/next month padding)
      const gridStart = getMonthCalendarDays(first.getFullYear(), first.getMonth())[0]
      const gridEnd = getMonthCalendarDays(first.getFullYear(), first.getMonth())[41]
      return { start: gridStart, end: gridEnd || last }
    }
    // semaine
    return { start: weekStart, end: weekEnd }
  }, [viewMode, selectedDate, weekStart, weekEnd])

  // Load depots on mount (via API pour bypass RLS)
  useEffect(() => {
    async function loadDepots() {
      try {
        const res = await fetch('/api/admin/depots')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Erreur chargement dépôts')

        let depotList = (json.depots || []) as DepotOption[]
        // L'API filtre déjà côté serveur, mais double-check côté client
        if (adminUser.role === 'agent_secteur' && adminUser.depot_ids?.length) {
          depotList = depotList.filter(d => adminUser.depot_ids!.includes(d.id))
        }
        setDepots(depotList)

        // Auto-select: prefer depot_id from URL, then user's depot, otherwise first depot
        if (depotList.length > 0) {
          if (initialDepotId && depotList.find((d) => d.id === initialDepotId)) {
            setSelectedDepotId(initialDepotId)
          } else {
            const userDepotIds = adminUser.depot_ids || []
            const matchingDepot = depotList.find((d) => userDepotIds.includes(d.id))
            setSelectedDepotId(matchingDepot ? matchingDepot.id : depotList[0].id)
          }
        }
      } catch (err) {
        console.error('Erreur chargement dépôts:', err)
      } finally {
        setLoading(false)
      }
    }
    loadDepots()
  }, [adminUser.depot_ids])

  // Load livreurs for selected depot
  useEffect(() => {
    async function loadLivreurs() {
      if (!selectedDepotId) { setLivreurs([]); return }
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('users_profile')
          .select('id, nom, prenom')
          .or('role.eq.livreur,and(role.eq.agent_secteur,est_aussi_livreur.eq.true)')
          .contains('depot_ids', [selectedDepotId])
          .order('nom')
        const livreurList = (data || []) as LivreurOption[]
        setLivreurs(livreurList)
        // Auto-select livreur
        if (!initialUrlApplied.current && (initialDate || initialLivreurId)) {
          // Arrivée depuis un lien (tournées intelligentes, etc.) — utiliser le livreur spécifié ou montrer tous
          initialUrlApplied.current = true
          if (initialLivreurId && livreurList.find(l => l.id === initialLivreurId)) {
            setSelectedLivreurId(initialLivreurId)
          } else {
            setSelectedLivreurId('_all')
          }
        } else {
          const selfMatch = livreurList.find(l => l.id === adminUser.id)
          setSelectedLivreurId(selfMatch ? selfMatch.id : (livreurList.length > 0 ? livreurList[0].id : ''))
        }
      } catch (err) {
        console.error('Erreur chargement livreurs:', err)
      }
    }
    loadLivreurs()
  }, [selectedDepotId])

  // Load planning data when depot or date range changes
  const loadPlanningData = useCallback(async () => {
    if (!selectedDepotId) return
    setLoadingData(true)

    try {
      const params = new URLSearchParams({
        depot_id: selectedDepotId,
        start_date: formatDate(dataRange.start),
        end_date: formatDate(dataRange.end),
      })

      const res = await fetch(`/api/admin/planning?${params}`)
      if (!res.ok) {
        console.error('Erreur API planning:', res.status)
        return
      }

      const data = await res.json()
      setLivraisons(data.livraisons || [])
      setClientsALivrer(data.clients_a_livrer || [])
      setDepot(data.depot || null)
    } catch (err) {
      console.error('Erreur chargement planning:', err)
    } finally {
      setLoadingData(false)
    }
  }, [selectedDepotId, dataRange])

  useEffect(() => {
    loadPlanningData()
  }, [loadPlanningData])

  // Rechargement apres une action livreur (Incident) depuis une carte de livraison
  useEffect(() => {
    const onRefresh = () => loadPlanningData()
    window.addEventListener('planning:refresh', onRefresh)
    return () => window.removeEventListener('planning:refresh', onRefresh)
  }, [loadPlanningData])

  // Navigation — adapts to current view mode
  const goToPrev = () => {
    if (viewMode === 'jour') {
      setSelectedDate((prev) => addDays(prev, -1))
    } else if (viewMode === '3jours') {
      setSelectedDate((prev) => addDays(prev, -3))
    } else if (viewMode === 'semaine') {
      setWeekStart((prev) => addDays(prev, -7))
      setSelectedDate((prev) => addDays(prev, -7))
    } else {
      setSelectedDate((prev) => addMonths(prev, -1))
    }
  }
  const goToNext = () => {
    if (viewMode === 'jour') {
      setSelectedDate((prev) => addDays(prev, 1))
    } else if (viewMode === '3jours') {
      setSelectedDate((prev) => addDays(prev, 3))
    } else if (viewMode === 'semaine') {
      setWeekStart((prev) => addDays(prev, 7))
      setSelectedDate((prev) => addDays(prev, 7))
    } else {
      setSelectedDate((prev) => addMonths(prev, 1))
    }
  }
  const goToToday = () => {
    const now = new Date()
    setSelectedDate(now)
    setWeekStart(getMonday(now))
    setMiniCalMonth(getFirstOfMonth(now))
  }

  // Switch to day view for a specific date (used by month view cell click)
  const goToDay = (d: Date) => {
    setSelectedDate(d)
    setWeekStart(getMonday(d))
    setMiniCalMonth(getFirstOfMonth(d))
    setViewMode('jour')
  }

  // Mini-calendar click — navigates within the current view mode (does NOT switch mode)
  const handleMiniCalClick = (d: Date) => {
    setMiniCalMonth(getFirstOfMonth(d))
    setSelectedDate(d)
    if (viewMode === 'semaine') {
      setWeekStart(getMonday(d))
    } else if (viewMode === 'jour' || viewMode === '3jours') {
      setWeekStart(getMonday(d))
    }
    // mois: just setSelectedDate above, which updates the month
  }

  // Keep weekStart in sync when selectedDate changes in semaine mode
  const switchViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    if (mode === 'semaine') {
      setWeekStart(getMonday(selectedDate))
    }
  }

  // Close search dropdown on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchDropdownOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Derived: 3-day columns
  const threeDays = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => addDays(selectedDate, i))
  }, [selectedDate])

  const handlePlacementSearch = async (query: string) => {
    setPlacementSearch(query)
    if (query.length < 2) { setPlacementResults([]); return }

    setPlacementLoading(true)
    try {
      const params = new URLSearchParams({ q: query })
      if (selectedDepotId) params.set('depot', selectedDepotId)
      const res = await fetch(`/api/admin/planning/search?${params}`)
      const { clients: data } = await res.json()
      setPlacementResults((data || []) as PlanningClient[])
    } catch (err) {
      console.error('Erreur recherche:', err)
    } finally {
      setPlacementLoading(false)
    }
  }

  const handlePlaceClient = async (clientId: string) => {
    if (!selectedDepotId || !placementDate) return
    if (!selectedLivreurId || selectedLivreurId === '_all') {
      alert('Veuillez sélectionner un livreur avant de planifier.')
      return
    }
    setPlacementLoading(true)

    try {
      const supabase = createClient()
      // Trouver la livraison du client
      let { data: livraison } = await supabase
        .from('livraisons')
        .select('id')
        .eq('client_id', clientId)
        .single()

      if (!livraison) {
        // Auto-créer la livraison si elle n'existe pas
        const clientInfo = clientsALivrer.find((c: any) => c.id === clientId)
        const { data: newLiv, error: createErr } = await supabase
          .from('livraisons')
          .insert({
            client_id: clientId,
            depot_id: selectedDepotId,
            mode_livraison: clientInfo?.adresse_livraison_ligne1 ? 'domicile' : 'retrait',
            adresse_livraison_ligne1: clientInfo?.adresse_livraison_ligne1 || clientInfo?.adresse_societe_ligne1,
            adresse_livraison_cp: clientInfo?.adresse_livraison_cp || clientInfo?.adresse_societe_cp,
            adresse_livraison_ville: clientInfo?.adresse_livraison_ville || clientInfo?.adresse_societe_ville,
            statut: 'a_livrer',
          })
          .select('id')
          .single()

        if (createErr || !newLiv) {
          alert('Erreur création livraison: ' + (createErr?.message || 'inconnue'))
          return
        }
        livraison = newLiv
      }

      // Mettre à jour la livraison avec la date et le dépôt
      const updateData: Record<string, unknown> = {
        creneau_date: placementDate,
        depot_id: selectedDepotId,
        statut: 'en_livraison',
        date_programmation: new Date().toISOString(),
      }
      if (placementCreneau) {
        updateData.creneau_heure_debut = placementCreneau
      }
      if (selectedLivreurId && selectedLivreurId !== '_all') {
        updateData.livreur_id = selectedLivreurId
      }

      await supabase
        .from('livraisons')
        .update(updateData)
        .eq('id', livraison.id)

      // Mettre à jour le statut client → en_livraison
      await supabase
        .from('clients')
        .update({
          statut_commercial: 'en_livraison',
          date_statut: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', clientId)

      // Refresh
      setPlacementOpen(false)
      setPlacementSearch('')
      setPlacementResults([])
      loadPlanningData()
    } catch (err) {
      console.error('Erreur placement:', err)
    } finally {
      setPlacementLoading(false)
    }
  }

  const openPlacement = (date: string, creneauHeure?: string) => {
    setPlacementDate(date)
    setPlacementCreneau(creneauHeure || null)
    setPlacementSearch('')
    setPlacementResults([])
    setPlacementOpen(true)
  }

  // Remove a client from the planning (unschedule livraison)
  // La confirmation se fait désormais via un popover inline ancré sur la croix
  // (voir LivraisonCard) — plus de window.confirm.
  const handleRemoveLivraison = async (livraisonId: string) => {
    setRemovingLivraisonId(livraisonId)
    try {
      const res = await fetch('/api/admin/planning/unschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livraisonId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la suppression')
      }

      loadPlanningData()
    } catch (err) {
      console.error('Erreur suppression créneau:', err)
      alert(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setRemovingLivraisonId(null)
    }
  }

  const handleSendMailPlanning = async (key: string, livraisonIds: string[]) => {
    if (livraisonIds.length === 0) return
    setSendingMailByKey(prev => ({ ...prev, [key]: true }))
    setMailPlanningMessage(null)
    try {
      const res = await fetch('/api/admin/livraisons/send-mail-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livraisonIds }),
      })
      const data = await res.json()
      setMailPlanningMessage({
        text: data.errors === 0
          ? `Mail planning envoyé à ${data.sent} client${data.sent > 1 ? 's' : ''}`
          : `${data.sent} envoyé${data.sent > 1 ? 's' : ''}, ${data.errors} erreur${data.errors > 1 ? 's' : ''}`,
        isError: data.errors > 0,
      })
      setTimeout(() => setMailPlanningMessage(null), 5000)
    } catch {
      setMailPlanningMessage({ text: 'Erreur envoi mail planning', isError: true })
      setTimeout(() => setMailPlanningMessage(null), 5000)
    } finally {
      setSendingMailByKey(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const handleBulkReschedule = async (date: string, expectedCount: number) => {
    if (expectedCount === 0) return
    const ok = window.confirm(
      `Remettre ${expectedCount} client${expectedCount > 1 ? 's' : ''} non livré${expectedCount > 1 ? 's' : ''} du ${date} en 'à livrer' ?`
    )
    if (!ok) return
    setBulkReschedulingDate(date)
    try {
      const res = await fetch('/api/admin/planning/bulk-reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, depot_id: selectedDepotId || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur bulk reschedule')
      setMailPlanningMessage({
        text: `${data.count_basculés ?? 0} livraison${(data.count_basculés ?? 0) > 1 ? 's' : ''} remise${(data.count_basculés ?? 0) > 1 ? 's' : ''} en 'à livrer'`,
        isError: false,
      })
      setTimeout(() => setMailPlanningMessage(null), 5000)
      loadPlanningData()
    } catch (err) {
      setMailPlanningMessage({
        text: err instanceof Error ? err.message : 'Erreur bulk reschedule',
        isError: true,
      })
      setTimeout(() => setMailPlanningMessage(null), 5000)
    } finally {
      setBulkReschedulingDate(null)
    }
  }

  // Load full livreurs list (RBAC applied server-side) for the move dialog
  useEffect(() => {
    let cancelled = false
    async function loadAllLivreurs() {
      try {
        const res = await fetch('/api/admin/livreurs')
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        let list: LivreurOption[] = json.livreurs || []
        if (adminUser.role === 'livreur') {
          list = list.filter(l => l.id === adminUser.id)
        }
        setAllLivreurs(list)
      } catch {
        /* silent */
      }
    }
    loadAllLivreurs()
    return () => { cancelled = true }
  }, [adminUser.id, adminUser.role])

  const openMoveDialog = (livraison: PlanningLivraison) => {
    setMoveDialogLivraison(livraison)
    setMoveDate(livraison.creneau_date || formatDate(new Date()))
    setMoveLivreurId(
      adminUser.role === 'livreur'
        ? adminUser.id
        : (livraison.livreur_id || selectedLivreurId || '')
    )
    if (livraison.creneau_heure_debut && livraison.creneau_heure_fin) {
      setMoveCreneauKey(`${livraison.creneau_heure_debut.slice(0, 5)}|${livraison.creneau_heure_fin.slice(0, 5)}`)
    } else {
      setMoveCreneauKey('_hors_creneau')
    }
  }

  const closeMoveDialog = () => {
    setMoveDialogLivraison(null)
    setMoveSubmitting(false)
  }

  // Compute available créneaux for the chosen (date, livreur). Source = depot config + existing livraisons.
  const moveDialogCreneaux = useMemo<CreneauConfig[]>(() => {
    if (!moveDate) return []
    const fromDepot = depot?.creneaux || []
    if (fromDepot.length > 0) return sortCreneaux(fromDepot)
    // Fallback : extraire les créneaux distincts utilisés ce jour-là pour ce livreur
    const seen = new Map<string, CreneauConfig>()
    for (const l of livraisons) {
      if (l.creneau_date !== moveDate) continue
      if (moveLivreurId && l.livreur_id !== moveLivreurId) continue
      if (!l.creneau_heure_debut) continue
      const key = `${l.creneau_heure_debut.slice(0, 5)}|${(l.creneau_heure_fin || '').slice(0, 5)}`
      if (!seen.has(key)) {
        seen.set(key, {
          heure_debut: l.creneau_heure_debut.slice(0, 5),
          heure_fin: (l.creneau_heure_fin || '').slice(0, 5),
          capacite_velos: 0,
        })
      }
    }
    return sortCreneaux(Array.from(seen.values()))
  }, [moveDate, moveLivreurId, depot, livraisons])

  const performMove = useCallback(async (params: {
    livraisonId: string
    newDate: string
    newLivreurId: string | null
    newCreneau: { heure_debut: string; heure_fin: string } | null
    targetIndex?: number | null
  }): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/planning/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          livraison_id: params.livraisonId,
          new_date: params.newDate,
          new_livreur_id: params.newLivreurId,
          new_creneau: params.newCreneau,
          target_index: params.targetIndex ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMailPlanningMessage({ text: data.error || 'Erreur déplacement', isError: true })
        setTimeout(() => setMailPlanningMessage(null), 5000)
        return false
      }
      setMailPlanningMessage({ text: 'Client déplacé', isError: false })
      setTimeout(() => setMailPlanningMessage(null), 3000)
      loadPlanningData()
      return true
    } catch (err) {
      setMailPlanningMessage({
        text: err instanceof Error ? err.message : 'Erreur déplacement',
        isError: true,
      })
      setTimeout(() => setMailPlanningMessage(null), 5000)
      return false
    }
  }, [loadPlanningData])

  const submitMoveDialog = async () => {
    if (!moveDialogLivraison || !moveDate) return
    let newCreneau: { heure_debut: string; heure_fin: string } | null = null
    if (moveCreneauKey && moveCreneauKey !== '_hors_creneau') {
      const [hd, hf] = moveCreneauKey.split('|')
      if (hd && hf) newCreneau = { heure_debut: hd, heure_fin: hf }
    }
    // Capacity check (soft warning) — si John annule, on n'envoie rien et le client reste à sa place
    if (!checkCapacityAndConfirm({
      livraisonId: moveDialogLivraison.id,
      targetDate: moveDate,
      targetCreneau: newCreneau,
    })) return
    setMoveSubmitting(true)
    const ok = await performMove({
      livraisonId: moveDialogLivraison.id,
      newDate: moveDate,
      newLivreurId: moveLivreurId || null,
      newCreneau,
    })
    setMoveSubmitting(false)
    if (ok) closeMoveDialog()
  }

  /**
   * Vérifie la capacité d'un créneau cible et demande confirmation si dépassement.
   * Retourne true si l'opération doit continuer (créneau ok OU John confirme le dépassement),
   * false si John annule. Journée entière (00:00) = jamais de check.
   */
  const checkCapacityAndConfirm = useCallback((params: {
    livraisonId: string
    targetDate: string
    targetCreneau: { heure_debut: string; heure_fin: string } | null
  }): boolean => {
    // Hors créneau ou Journée entière : pas de check
    if (!params.targetCreneau) return true
    if (params.targetCreneau.heure_debut.slice(0, 5) === '00:00') return true
    // Trouver capacite_velos du créneau cible dans la config dépôt
    const cren = (depot?.creneaux || []).find(c =>
      c.heure_debut.slice(0, 5) === params.targetCreneau!.heure_debut.slice(0, 5)
    )
    if (!cren || cren.capacite_velos <= 0) return true // pas de capacité définie = pas de check
    // Compter vélos actuels (exclure la livraison déplacée)
    const slotVelos = livraisons
      .filter(l =>
        l.creneau_date === params.targetDate &&
        l.creneau_heure_debut?.slice(0, 5) === params.targetCreneau!.heure_debut.slice(0, 5) &&
        l.id !== params.livraisonId
      )
      .reduce((sum, l) => sum + (l.client?.velo_valide || l.client?.velo_devis || 0), 0)
    // Nombre de vélos de la livraison déplacée
    const moved = livraisons.find(l => l.id === params.livraisonId)
    const movedVelos = moved?.client?.velo_valide || moved?.client?.velo_devis || 0
    const projected = slotVelos + movedVelos
    if (projected <= cren.capacite_velos) return true
    // Dépassement → confirmation
    return window.confirm(
      `Créneau plein : ce créneau est déjà à ${slotVelos}/${cren.capacite_velos} vélos. ` +
      `Ajouter ${movedVelos} vélo${movedVelos > 1 ? 's' : ''} dépasserait la capacité (${projected}/${cren.capacite_velos}). ` +
      `Déplacer quand même ?`
    )
  }, [depot, livraisons])

  // Drop handler used by WeekView/DayView : intra-livreur déplacement
  const handleDropOnSlot = useCallback(async (params: {
    livraisonId: string
    targetDate: string
    targetCreneau: { heure_debut: string; heure_fin: string } | null
    targetIndex?: number | null
  }) => {
    setDraggingLivraisonId(null)
    // Capacity check (soft warning) — si John annule, drop ignoré, client reste à sa place
    if (!checkCapacityAndConfirm(params)) return
    await performMove({
      livraisonId: params.livraisonId,
      newDate: params.targetDate,
      newLivreurId: null, // null = garder livreur actuel
      newCreneau: params.targetCreneau,
      targetIndex: params.targetIndex ?? null,
    })
  }, [performMove, checkCapacityAndConfirm])

  // Check if a day is open for the selected depot
  function isDayOpen(day: Date): boolean {
    if (!depot?.jours_ouverture || depot.jours_ouverture.length === 0) return true
    const jourNom = JOURS_SEMAINE[day.getDay()]
    return depot.jours_ouverture.includes(jourNom)
  }

  // Get livraisons for a specific day
  function getLivraisonsForDay(day: Date): PlanningLivraison[] {
    const dateStr = formatDate(day)
    return filteredLivraisons.filter((l) => l.creneau_date === dateStr)
  }

  // Count velos scheduled for a day
  function getVelosForDay(day: Date): number {
    const dayLivraisons = getLivraisonsForDay(day)
    return dayLivraisons.reduce((total, l) => {
      return total + (l.client?.velo_valide || l.client?.velo_devis || 0)
    }, 0)
  }

  // Search: show dropdown of matching clients from ALL livraisons
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (!value.trim()) {
      setSelectedCreneau(null)
      setSearchDropdownOpen(false)
      return
    }
    setSearchDropdownOpen(true)
  }

  // Search results from livraisons + unscheduled clients (clientsALivrer)
  type SearchResult = { type: 'livraison'; livraison: PlanningLivraison } | { type: 'client'; client: PlanningClient }
  const searchDropdownResults = useMemo((): SearchResult[] => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    const seenClientIds = new Set<string>()
    const results: SearchResult[] = []

    const matchClient = (name?: string | null, phone?: string | null, email?: string | null) =>
      name?.toLowerCase().includes(q) || phone?.includes(q) || email?.toLowerCase().includes(q)

    // 1. Scheduled livraisons matching the query
    for (const l of livraisons) {
      if (matchClient(l.client?.raison_sociale, l.client?.telephone, l.client?.email)) {
        if (l.client_id) seenClientIds.add(l.client_id)
        results.push({ type: 'livraison', livraison: l })
      }
      if (results.length >= 10) break
    }

    // 2. Unscheduled clients not already matched via livraisons
    if (results.length < 10) {
      for (const c of clientsALivrer) {
        if (seenClientIds.has(c.id)) continue
        if (matchClient(c.raison_sociale, c.telephone, c.email)) {
          results.push({ type: 'client', client: c })
          if (results.length >= 10) break
        }
      }
    }

    return results
  }, [livraisons, clientsALivrer, searchQuery])

  // Handle clicking a search result (livraison or unscheduled client)
  const handleSearchResultClick = (result: SearchResult) => {
    setSearchDropdownOpen(false)
    if (result.type === 'livraison') {
      const livraison = result.livraison
      setSearchQuery(livraison.client?.raison_sociale || '')
      if (livraison.creneau_date && livraison.creneau_heure_debut) {
        // Navigate to date and select the créneau
        const d = new Date(livraison.creneau_date + 'T00:00:00')
        setSelectedDate(d)
        setWeekStart(getMonday(d))
        setMiniCalMonth(getFirstOfMonth(d))
        const creneauConf = depot?.creneaux?.find(
          c => c.heure_debut.slice(0, 5) === livraison.creneau_heure_debut!.slice(0, 5)
        )
        setSelectedCreneau({
          date: livraison.creneau_date,
          heure_debut: livraison.creneau_heure_debut.slice(0, 5),
          heure_fin: livraison.creneau_heure_fin?.slice(0, 5) || creneauConf?.heure_fin.slice(0, 5) || '',
          capacite: creneauConf?.capacite_velos || 0,
        })
      } else if (livraison.client_id) {
        // No creneau — navigate to client fiche
        window.location.href = `/admin/clients/${livraison.client_id}`
      }
    } else {
      // Unscheduled client — navigate to client fiche
      const client = result.client
      setSearchQuery(client.raison_sociale || '')
      window.location.href = `/admin/clients/${client.id}`
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (depots.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Planning livraisons</h1>
        <p className="text-muted-foreground">Aucun dépôt actif trouvé.</p>
      </div>
    )
  }

  const today = new Date()

  // Livraisons displayed in the créneau detail panel
  const creneauLivraisons = selectedCreneau
    ? selectedCreneau.heure_debut === '_hors_creneau'
      ? (() => {
          // Hors créneau: livraisons without creneau_heure_debut for that date
          const dayLivs = filteredLivraisons.filter(l => l.creneau_date === selectedCreneau.date)
          const assignedIds = new Set(
            dayLivs.filter(l => l.creneau_heure_debut).map(l => l.id)
          )
          return dayLivs.filter(l => !assignedIds.has(l.id))
        })()
      : filteredLivraisons.filter(
          l =>
            l.creneau_date === selectedCreneau.date &&
            l.creneau_heure_debut?.slice(0, 5) === selectedCreneau.heure_debut
        )
    : []

  const creneauVelos = creneauLivraisons.reduce(
    (sum, l) => sum + (l.client?.velo_valide || l.client?.velo_devis || 0),
    0
  )

  const selectedCreneauDayLabel = selectedCreneau
    ? (() => {
        const [y, m, d] = selectedCreneau.date.split('-').map(Number)
        return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      })()
    : ''

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 shrink-0">
          <Calendar className="h-6 w-6" />
          Planning livraisons
        </h1>
      </div>

      {/* Search bar + Tournée intelligente */}
      <div className="flex items-center gap-3">
      <div className="relative max-w-md flex-1" ref={searchContainerRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Rechercher un client dans l'agenda..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => { if (searchQuery.trim()) setSearchDropdownOpen(true) }}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSelectedCreneau(null); setSearchDropdownOpen(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Dropdown results */}
        {searchDropdownOpen && searchQuery.trim() && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 max-h-[300px] overflow-auto">
            {searchDropdownResults.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                Aucun résultat
              </div>
            ) : (
              searchDropdownResults.map((result, idx) => {
                if (result.type === 'livraison') {
                  const livraison = result.livraison
                  const hasDate = !!livraison.creneau_date
                  const dateLabel = hasDate
                    ? (() => {
                        const d = new Date(livraison.creneau_date! + 'T00:00:00')
                        const day = d.getDate().toString().padStart(2, '0')
                        const month = (d.getMonth() + 1).toString().padStart(2, '0')
                        const heure = livraison.creneau_heure_debut
                          ? livraison.creneau_heure_debut.slice(0, 5)
                          : null
                        return `${day}/${month}${heure ? ` à ${heure}` : ''}`
                      })()
                    : null
                  return (
                    <button
                      key={`liv-${livraison.id}`}
                      onClick={() => handleSearchResultClick(result)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 flex items-center justify-between gap-3"
                    >
                      <span className="text-sm font-medium truncate">
                        {livraison.client?.raison_sociale || 'Client inconnu'}
                      </span>
                      {hasDate ? (
                        <span className="text-xs font-medium text-green-600 shrink-0 whitespace-nowrap">
                          {dateLabel} — Programmé
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-orange-500 shrink-0">
                          À placer
                        </span>
                      )}
                    </button>
                  )
                } else {
                  const client = result.client
                  return (
                    <button
                      key={`cli-${client.id}`}
                      onClick={() => handleSearchResultClick(result)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 flex items-center justify-between gap-3"
                    >
                      <span className="text-sm font-medium truncate">
                        {client.raison_sociale || 'Client inconnu'}
                      </span>
                      <span className="text-xs font-medium text-orange-500 shrink-0">
                        À livrer
                      </span>
                    </button>
                  )
                }
              })
            )}
          </div>
        )}
      </div>
      <Link href="/admin/tournees-intelligentes">
        <Button variant="outline" size="sm" className="text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 whitespace-nowrap">
          <Route className="h-4 w-4 mr-1" /> Tournée intelligente
        </Button>
      </Link>
      </div>

      {/* Main layout: Calendar + Créneau detail panel */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar views */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              {/* Unified top nav bar: 3-part layout */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                {/* Left: Date navigation */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" onClick={goToPrev}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={goToToday} className="text-xs">
                    Aujourd&apos;hui
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Calendar className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-4" align="start">
                      <MiniCalendar
                        month={miniCalMonth}
                        selectedDate={selectedDate}
                        onSelectDay={handleMiniCalClick}
                        onPrevMonth={() => setMiniCalMonth((m) => addMonths(m, -1))}
                        onNextMonth={() => setMiniCalMonth((m) => addMonths(m, 1))}
                      />
                    </PopoverContent>
                  </Popover>
                  <Button variant="outline" size="sm" onClick={goToNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <span className="ml-2 text-sm font-semibold whitespace-nowrap hidden md:inline">
                    {viewMode === 'jour' && formatDateLong(selectedDate)}
                    {viewMode === '3jours' && `${formatDateShort(selectedDate)} – ${formatDateShort(addDays(selectedDate, 2))}`}
                    {viewMode === 'semaine' && `Sem. ${formatDateShort(weekStart)} – ${formatDateShort(weekEnd)}`}
                    {viewMode === 'mois' && `${MOIS_LABELS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`}
                  </span>
                </div>

                {/* Center: Depot + Livreur selectors */}
                <div className="flex items-center gap-3 flex-nowrap justify-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground font-medium hidden lg:inline">Dépôt</span>
                    <Select value={selectedDepotId} onValueChange={setSelectedDepotId}>
                      <SelectTrigger className="w-36 lg:w-44">
                        <SelectValue placeholder="Dépôt" />
                      </SelectTrigger>
                      <SelectContent>
                        {depots.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.nom} ({d.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {livreurs.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground font-medium hidden lg:inline">Livreur</span>
                      <Select value={selectedLivreurId} onValueChange={setSelectedLivreurId}>
                        <SelectTrigger className="w-36 lg:w-44">
                          <SelectValue placeholder="Livreur" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">Tous les livreurs</SelectItem>
                          {livreurs.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.prenom} {l.nom}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {livreurs.length > 0 && (!selectedLivreurId || selectedLivreurId === '_all') && (
                    <span className="text-xs text-amber-600 font-medium">
                      Sélectionnez un livreur pour planifier
                    </span>
                  )}
                </div>

                {/* Right: View mode toggle */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="inline-flex rounded-lg border overflow-hidden">
                    {([
                      { mode: 'jour' as ViewMode, label: 'Jour' },
                      { mode: '3jours' as ViewMode, label: '3J' },
                      { mode: 'semaine' as ViewMode, label: 'Sem.' },
                      { mode: 'mois' as ViewMode, label: 'Mois' },
                    ]).map(({ mode, label }) => (
                      <button
                        key={mode}
                        onClick={() => switchViewMode(mode)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          viewMode === mode
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mobile date label */}
              <div className="text-sm font-semibold md:hidden mt-1">
                {viewMode === 'jour' && formatDateLong(selectedDate)}
                {viewMode === '3jours' && `${formatDateShort(selectedDate)} – ${formatDateShort(addDays(selectedDate, 2))}`}
                {viewMode === 'semaine' && `Sem. ${formatDateShort(weekStart)} – ${formatDateShort(weekEnd)}`}
                {viewMode === 'mois' && `${MOIS_LABELS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`}
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : viewMode === 'jour' ? (
                <DayView
                  day={selectedDate}
                  livraisons={getLivraisonsForDay(selectedDate)}
                  velosDay={getVelosForDay(selectedDate)}
                  capaciteJour={depot?.capacite_velos_jour || 0}
                  creneaux={sortCreneaux(depot?.creneaux || [])}
                  isOpen={isDayOpen(selectedDate)}
                  isToday={isSameDay(selectedDate, today)}
                  canAddClient={!!selectedLivreurId && selectedLivreurId !== '_all'}
                  onAddClient={(creneauHeure) => openPlacement(formatDate(selectedDate), creneauHeure)}
                  onRemoveLivraison={handleRemoveLivraison}
                  removingLivraisonId={removingLivraisonId}
                  onSelectCreneau={(date, heure_debut, heure_fin, capacite) =>
                    setSelectedCreneau({ date, heure_debut, heure_fin, capacite })
                  }
                  selectedCreneau={selectedCreneau}
                  onSendMailPlanning={handleSendMailPlanning}
                  sendingMailByKey={sendingMailByKey}
                  onBulkReschedule={handleBulkReschedule}
                  bulkReschedulingDate={bulkReschedulingDate}
                  onUpdateLivraison={(id, data) => {
                    setLivraisons(prev => prev.map(l => l.id === id ? { ...l, ...data } : l))
                  }}
                  onMoveLivraison={openMoveDialog}
                  draggingLivraisonId={draggingLivraisonId}
                  onDragStartLivraison={setDraggingLivraisonId}
                  onDropOnSlot={handleDropOnSlot}
                />
              ) : viewMode === 'mois' ? (
                <MonthView
                  selectedDate={selectedDate}
                  today={today}
                  getLivraisonsForDay={getLivraisonsForDay}
                  getVelosForDay={getVelosForDay}
                  isDayOpen={isDayOpen}
                  capaciteJour={depot?.capacite_velos_jour || 0}
                  onDayClick={goToDay}
                />
              ) : viewMode === '3jours' ? (
                /* 3-day view */
                <WeekView
                  weekDays={threeDays}
                  today={today}
                  creneaux={sortCreneaux(depot?.creneaux || [])}
                  capaciteJour={depot?.capacite_velos_jour || 0}
                  getLivraisonsForDay={getLivraisonsForDay}
                  getVelosForDay={getVelosForDay}
                  isDayOpen={isDayOpen}
                  onDayClick={goToDay}
                  canAddClient={!!selectedLivreurId && selectedLivreurId !== '_all'}
                  onAddClient={(day, creneauHeure) => openPlacement(formatDate(day), creneauHeure)}
                  onRemoveLivraison={handleRemoveLivraison}
                  removingLivraisonId={removingLivraisonId}
                  onSelectCreneau={(date, heure_debut, heure_fin, capacite) =>
                    setSelectedCreneau({ date, heure_debut, heure_fin, capacite })
                  }
                  selectedCreneau={selectedCreneau}
                  onSendMailPlanning={handleSendMailPlanning}
                  sendingMailByKey={sendingMailByKey}
                  onBulkReschedule={handleBulkReschedule}
                  bulkReschedulingDate={bulkReschedulingDate}
                  onUpdateLivraison={(id, data) => {
                    setLivraisons(prev => prev.map(l => l.id === id ? { ...l, ...data } : l))
                  }}
                  onMoveLivraison={openMoveDialog}
                  draggingLivraisonId={draggingLivraisonId}
                  onDragStartLivraison={setDraggingLivraisonId}
                  onDropOnSlot={handleDropOnSlot}
                />
              ) : (
                /* Week view */
                <WeekView
                  weekDays={weekDays}
                  today={today}
                  creneaux={sortCreneaux(depot?.creneaux || [])}
                  capaciteJour={depot?.capacite_velos_jour || 0}
                  getLivraisonsForDay={getLivraisonsForDay}
                  getVelosForDay={getVelosForDay}
                  isDayOpen={isDayOpen}
                  onDayClick={goToDay}
                  canAddClient={!!selectedLivreurId && selectedLivreurId !== '_all'}
                  onAddClient={(day, creneauHeure) => openPlacement(formatDate(day), creneauHeure)}
                  onRemoveLivraison={handleRemoveLivraison}
                  removingLivraisonId={removingLivraisonId}
                  onSelectCreneau={(date, heure_debut, heure_fin, capacite) =>
                    setSelectedCreneau({ date, heure_debut, heure_fin, capacite })
                  }
                  selectedCreneau={selectedCreneau}
                  onSendMailPlanning={handleSendMailPlanning}
                  sendingMailByKey={sendingMailByKey}
                  onBulkReschedule={handleBulkReschedule}
                  bulkReschedulingDate={bulkReschedulingDate}
                  onUpdateLivraison={(id, data) => {
                    setLivraisons(prev => prev.map(l => l.id === id ? { ...l, ...data } : l))
                  }}
                  onMoveLivraison={openMoveDialog}
                  draggingLivraisonId={draggingLivraisonId}
                  onDragStartLivraison={setDraggingLivraisonId}
                  onDropOnSlot={handleDropOnSlot}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel: créneau detail */}
        <div className="w-full lg:w-[340px] shrink-0">
          <Card className="h-full">
            <CardContent className="p-4">
              {selectedCreneau ? (
                <div className="space-y-4">
                  {/* Panel header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm capitalize">
                        {selectedCreneauDayLabel}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {selectedCreneau.heure_debut === '_hors_creneau' ? (
                          <span className="text-sm text-amber-600 font-medium flex items-center gap-1">
                            <Bike className="h-3.5 w-3.5" />
                            Hors créneau
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {selectedCreneau.heure_debut}
                            {selectedCreneau.heure_fin ? ` – ${selectedCreneau.heure_fin}` : ''}
                          </span>
                        )}
                        {selectedCreneau.capacite > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {creneauVelos}/{selectedCreneau.capacite} vélos
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedCreneau(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Action buttons (side by side) */}
                  {creneauLivraisons.length > 0 && selectedCreneau.heure_debut !== '_hors_creneau' && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 shadow-sm"
                        onClick={() => {
                          const k = `creneau_${selectedCreneau.date}_${selectedCreneau.heure_debut}`
                          handleSendMailPlanning(k, creneauLivraisons.map(l => l.id))
                        }}
                        disabled={!!sendingMailByKey[`creneau_${selectedCreneau.date}_${selectedCreneau.heure_debut}`]}
                      >
                        {sendingMailByKey[`creneau_${selectedCreneau.date}_${selectedCreneau.heure_debut}`] ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Mail className="h-3.5 w-3.5 mr-1" />
                        )}
                        Mail ({creneauLivraisons.length})
                      </Button>
                      <Link
                        href={`/admin/tournees-intelligentes?from_creneau=1&date=${selectedCreneau.date}&capacite=${Math.max(1, selectedCreneau.capacite - creneauVelos)}&include=${creneauLivraisons.map(l => l.client_id).filter(Boolean).join(',')}&creneau_debut=${selectedCreneau.heure_debut}&creneau_fin=${selectedCreneau.heure_fin}&capacite_max=${selectedCreneau.capacite - creneauVelos}${selectedLivreurId && selectedLivreurId !== '_all' ? `&livreur_id=${selectedLivreurId}` : ''}`}
                        className="flex-1"
                      >
                        <Button size="sm" variant="outline" className="w-full text-xs bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 hover:border-purple-300 shadow-sm">
                          <Route className="h-3.5 w-3.5 mr-1" />
                          Tournée
                        </Button>
                      </Link>
                      {(() => {
                        // Un créneau regroupe les livraisons par date + heure_debut uniquement :
                        // il peut donc contenir des livraisons de PLUSIEURS tournées distinctes.
                        const tourneeIds = [...new Set(
                          creneauLivraisons.map(l => l.tournee_id).filter((id): id is string => !!id)
                        )]
                        if (tourneeIds.length === 0) return null
                        // Résolution du libellé livreur (liste dépôt + liste complète)
                        const livreurNom = (livreurId: string | null): string | null => {
                          if (!livreurId) return null
                          const l = livreurs.find(x => x.id === livreurId) || allLivreurs.find(x => x.id === livreurId)
                          if (!l) return null
                          const full = `${l.prenom || ''} ${l.nom || ''}`.trim()
                          return full || null
                        }
                        if (tourneeIds.length === 1) {
                          return (
                            <Link href={`/admin/tournees/${tourneeIds[0]}`} target="_blank" className="flex-1">
                              <Button size="sm" variant="outline" className="w-full text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 shadow-sm">
                                <Navigation className="h-3.5 w-3.5 mr-1" />
                                Voir sur carte
                              </Button>
                            </Link>
                          )
                        }
                        // ≥2 tournées : un bouton par tournée distincte, libellé livreur ou index
                        return (
                          <div className="flex-1 flex flex-wrap gap-2">
                            {tourneeIds.map((tid, idx) => {
                              const livreurId = creneauLivraisons.find(l => l.tournee_id === tid)?.livreur_id || null
                              const label = livreurNom(livreurId) || `Tournée ${idx + 1}`
                              return (
                                <Link key={tid} href={`/admin/tournees/${tid}`} target="_blank">
                                  <Button size="sm" variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 shadow-sm">
                                    <Navigation className="h-3.5 w-3.5 mr-1" />
                                    {label}
                                  </Button>
                                </Link>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                  {mailPlanningMessage && (
                    <p className={`text-xs font-medium px-2 py-1 rounded ${mailPlanningMessage.isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {mailPlanningMessage.text}
                    </p>
                  )}

                  {/* Tout basculer buttons for hors créneau — one per créneau with capacity */}
                  {selectedCreneau.heure_debut === '_hors_creneau' && creneauLivraisons.length > 0 && (() => {
                    const horsVelos = creneauLivraisons.reduce((s, l) => s + (l.client?.velo_valide || l.client?.velo_devis || 0), 0)
                    const dayLivs = filteredLivraisons.filter(l => l.creneau_date === selectedCreneau.date)
                    const fitCreneaux = (depot?.creneaux || []).map(c => {
                      const slotLivs = dayLivs.filter(l => l.creneau_heure_debut?.slice(0, 5) === c.heure_debut.slice(0, 5))
                      const slotVelos = slotLivs.reduce((s, l) => s + (l.client?.velo_valide || l.client?.velo_devis || 0), 0)
                      const remaining = c.capacite_velos - slotVelos
                      return { ...c, remaining }
                    }).filter(c => c.remaining >= horsVelos)
                    return fitCreneaux.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[11px] text-amber-700 font-medium">Tout basculer ({horsVelos} vélo{horsVelos > 1 ? 's' : ''}) :</p>
                        <div className="flex flex-wrap gap-1">
                          {fitCreneaux.map(tc => (
                            <Button
                              key={tc.heure_debut}
                              size="sm"
                              variant="outline"
                              className="text-xs bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 shadow-sm"
                              onClick={async () => {
                                for (const l of creneauLivraisons) {
                                  await fetch(`/api/admin/livraisons/${l.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      creneau_heure_debut: tc.heure_debut.slice(0, 5),
                                      creneau_heure_fin: tc.heure_fin.slice(0, 5),
                                    }),
                                  })
                                }
                                setSelectedCreneau(null)
                                setLivraisons(prev => prev.map(l => {
                                  const match = creneauLivraisons.find(cl => cl.id === l.id)
                                  return match ? { ...l, creneau_heure_debut: tc.heure_debut.slice(0, 5), creneau_heure_fin: tc.heure_fin.slice(0, 5) } : l
                                }))
                              }}
                            >
                              <ArrowRight className="h-3 w-3 mr-1" />
                              {tc.heure_debut.slice(0, 5)} – {tc.heure_fin.slice(0, 5)} ({tc.remaining} dispo)
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        Aucun créneau n&apos;a assez de capacité pour {horsVelos} vélo{horsVelos > 1 ? 's' : ''}
                      </p>
                    )
                  })()}

                  {/* Client list */}
                  {creneauLivraisons.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {selectedCreneau.heure_debut === '_hors_creneau' ? 'Aucun client hors créneau' : 'Aucun client dans ce créneau'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {creneauLivraisons.map((livraison) => {
                        const client = livraison.client
                        const nbVelos = client?.velo_valide || client?.velo_devis || 0
                        return (
                          <div
                            key={livraison.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-white hover:bg-gray-50 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium" title={client?.raison_sociale || 'Client inconnu'}>
                                {client?.raison_sociale || 'Client inconnu'}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${getStatutColor(livraison.statut)}`}>
                                  {getStatutLabel(livraison.statut)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-0.5">
                                  <Bike className="h-3 w-3" />
                                  {nbVelos} vélo{nbVelos > 1 ? 's' : ''}
                                </span>
                                {client?.telephone && (
                                  <span>{client.telephone}</span>
                                )}
                              </div>
                              {/* Move buttons for hors-créneau */}
                              {selectedCreneau.heure_debut === '_hors_creneau' && (depot?.creneaux || []).length > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="text-[10px] text-muted-foreground mr-0.5">→</span>
                                  {(depot?.creneaux || []).map(c => (
                                    <MoveToCreneauButton
                                      key={c.heure_debut}
                                      livraisonId={livraison.id}
                                      creneauDebut={c.heure_debut.slice(0, 5)}
                                      creneauFin={c.heure_fin.slice(0, 5)}
                                      onMoved={(data) => {
                                        setLivraisons(prev => prev.map(l =>
                                          l.id === livraison.id ? { ...l, ...data } : l
                                        ))
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {livraison.client_id && (
                                <Link href={`/admin/clients/${livraison.client_id}`}>
                                  <button
                                    className="w-7 h-7 rounded flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="Voir le client"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                </Link>
                              )}
                              <button
                                onClick={() => {
                                  const tenant = getTenantConfig()
                                  if (tenant.externalRetraitUrl) {
                                    const mondayId = (livraison as any).client?.monday_item_id || ''
                                    window.open(`${tenant.externalRetraitUrl}?monday_id=${mondayId}&livraison_id=${livraison.id}`, '_blank')
                                  } else {
                                    window.open(`/admin/livraisons/deliver?id=${livraison.id}`, '_blank')
                                  }
                                }}
                                className="w-7 h-7 rounded flex items-center justify-center text-green-600 hover:bg-green-50 transition-colors"
                                title="Démarrer la livraison"
                              >
                                <Truck className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveLivraison(livraison.id) }}
                                disabled={removingLivraisonId === livraison.id}
                                className="w-7 h-7 rounded flex items-center justify-center text-red-600 hover:bg-red-50 transition-colors"
                                title="Retirer du planning"
                              >
                                {removingLivraisonId === livraison.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Cliquez sur un créneau pour voir les détails
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Panneau placement client sur créneau */}
      {placementOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Placer un client</h3>
              <button onClick={() => setPlacementOpen(false)} className="text-muted-foreground hover:text-foreground">&times;</button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Date : {(() => { const [y, m, d] = placementDate.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) })()}
              {placementCreneau && <> &mdash; Créneau : <span className="font-medium text-blue-600">{placementCreneau.slice(0, 5)}</span></>}
              {selectedLivreurId && selectedLivreurId !== '_all' && livreurs.length > 0 && (
                <> &mdash; Livreur : {livreurs.find(l => l.id === selectedLivreurId)?.prenom} {livreurs.find(l => l.id === selectedLivreurId)?.nom}</>
              )}
            </p>
            <input
              type="text"
              placeholder="Rechercher un client (nom, tél, email)..."
              value={placementSearch}
              onChange={(e) => handlePlacementSearch(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            {placementLoading && <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
            {!placementLoading && placementResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {placementResults.map((client) => {
                  // Check if this client already has a livraison with a creneau_date
                  const existingLivraison = livraisons.find(
                    l => l.client_id === client.id && l.creneau_date
                  )
                  const alreadyPlaced = !!existingLivraison
                  const placedDateLabel = alreadyPlaced && existingLivraison
                    ? (() => {
                        const d = new Date(existingLivraison.creneau_date! + 'T00:00:00')
                        const day = d.getDate().toString().padStart(2, '0')
                        const month = (d.getMonth() + 1).toString().padStart(2, '0')
                        const heure = existingLivraison.creneau_heure_debut
                          ? existingLivraison.creneau_heure_debut.slice(0, 5)
                          : null
                        return `${day}/${month}${heure ? ` à ${heure}` : ''}`
                      })()
                    : null
                  return (
                    <button
                      key={client.id}
                      onClick={() => handlePlaceClient(client.id)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">{client.raison_sociale}</p>
                        {alreadyPlaced ? (
                          <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                            Programmé {placedDateLabel}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded shrink-0">
                            À placer
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {client.velo_valide || client.velo_devis || '?'} vélo(s)
                        {client.adresse_livraison_ville && ` — ${client.adresse_livraison_cp} ${client.adresse_livraison_ville}`}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
            {!placementLoading && placementSearch.length >= 2 && placementResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun client &quot;à livrer&quot; trouvé</p>
            )}
          </div>
        </div>
      )}

      {/* Modale "Déplacer vers..." */}
      <Dialog open={!!moveDialogLivraison} onOpenChange={(o) => { if (!o) closeMoveDialog() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Déplacer vers…</DialogTitle>
          </DialogHeader>
          {moveDialogLivraison && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Client : <span className="font-medium text-foreground">{moveDialogLivraison.client?.raison_sociale || '—'}</span>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Date</label>
                <input
                  type="date"
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                  min={formatDate(new Date())}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Livreur</label>
                <select
                  value={moveLivreurId}
                  onChange={(e) => setMoveLivreurId(e.target.value)}
                  disabled={adminUser.role === 'livreur'}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:bg-gray-100"
                >
                  <option value="">— Garder le livreur actuel —</option>
                  {allLivreurs.map(l => (
                    <option key={l.id} value={l.id}>{l.prenom} {l.nom}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Créneau</label>
                <select
                  value={moveCreneauKey}
                  onChange={(e) => setMoveCreneauKey(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="_hors_creneau">Hors créneau</option>
                  {moveDialogCreneaux.map(c => {
                    const key = `${c.heure_debut.slice(0, 5)}|${c.heure_fin.slice(0, 5)}`
                    // Compte vélos actuels sur ce créneau ce jour-là, en excluant la livraison en cours de déplacement
                    const slotVelosCount = livraisons
                      .filter(l =>
                        l.creneau_date === moveDate &&
                        l.creneau_heure_debut?.slice(0, 5) === c.heure_debut.slice(0, 5) &&
                        l.id !== moveDialogLivraison?.id
                      )
                      .reduce((sum, l) => sum + (l.client?.velo_valide || l.client?.velo_devis || 0), 0)
                    const isJournee = isJourneeEntiere(c)
                    const label = isJournee
                      ? `Journée entière (${slotVelosCount} vélo${slotVelosCount > 1 ? 's' : ''})`
                      : `${c.heure_debut.slice(0, 5)} – ${c.heure_fin.slice(0, 5)} (${slotVelosCount}/${c.capacite_velos})`
                    return (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeMoveDialog} disabled={moveSubmitting}>Annuler</Button>
            <Button onClick={submitMoveDialog} disabled={moveSubmitting || !moveDate}>
              {moveSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Déplacer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Livraison card sub-component
// ---------------------------------------------------------------------------

function MoveToCreneauButton({ livraisonId, creneauDebut, creneauFin, onMoved }: {
  livraisonId: string
  creneauDebut: string
  creneauFin: string
  onMoved: (data: Partial<PlanningLivraison>) => void
}) {
  const [moving, setMoving] = useState(false)
  const move = async () => {
    setMoving(true)
    try {
      const res = await fetch(`/api/admin/livraisons/${livraisonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creneau_heure_debut: creneauDebut, creneau_heure_fin: creneauFin }),
      })
      if (res.ok) {
        onMoved({ creneau_heure_debut: creneauDebut, creneau_heure_fin: creneauFin })
      }
    } finally { setMoving(false) }
  }
  const journee = creneauDebut.slice(0, 5) === '00:00'
  return (
    <button
      onClick={move}
      disabled={moving}
      title={journee ? 'Déplacer vers Journée entière' : `Déplacer vers ${creneauDebut.slice(0, 5)}`}
      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50 inline-flex items-center gap-0.5"
    >
      {moving ? '...' : journee ? <CalendarDays className="h-3 w-3" /> : creneauDebut.slice(0, 5)}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Bouton croix "Retirer du planning" avec confirmation inline (popover ancré).
// Remplace window.confirm : la confirmation s'affiche près du bouton cliqué.
// ---------------------------------------------------------------------------

function RemoveConfirmPopover({
  onConfirm,
  removing,
  className,
  iconChar = '×',
}: {
  onConfirm: () => void
  removing?: boolean
  className: string
  iconChar?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          disabled={removing}
          className={className}
          title="Retirer du planning"
        >
          {removing ? '…' : iconChar}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 p-3"
        align="end"
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      >
        <p className="text-xs font-medium text-gray-700 mb-2">Retirer ce client ?</p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false) }}
            className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Non
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onConfirm() }}
            className="px-2 py-1 text-xs rounded bg-red-600 hover:bg-red-700 text-white font-medium"
          >
            Oui
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------

function LivraisonCard({
  livraison,
  expanded,
  onRemove,
  removing,
  onUpdate,
  onMove,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  livraison: PlanningLivraison
  expanded?: boolean
  onRemove?: (id: string) => void
  removing?: boolean
  onUpdate?: (id: string, data: Partial<PlanningLivraison>) => void
  onMove?: (livraison: PlanningLivraison) => void
  draggable?: boolean
  isDragging?: boolean
  onDragStart?: (id: string) => void
  onDragEnd?: () => void
}) {
  const clientName = livraison.client?.raison_sociale || 'Client inconnu'
  const nbVelos = livraison.client?.velo_valide || livraison.client?.velo_devis || 0
  const heureDebut = livraison.creneau_heure_debut
    ? livraison.creneau_heure_debut.slice(0, 5)
    : null
  const heureFin = livraison.creneau_heure_fin
    ? livraison.creneau_heure_fin.slice(0, 5)
    : null

  const [editingHeure, setEditingHeure] = useState(false)
  const [heureValue, setHeureValue] = useState(livraison.heure_precise || '')
  const [savingHeure, setSavingHeure] = useState(false)
  const [editingPrefs, setEditingPrefs] = useState(false)
  const [prefsValue, setPrefsValue] = useState(livraison.client?.preferences_livraison || '')
  const [savingPrefs, setSavingPrefs] = useState(false)

  const saveHeurePrecise = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (heureDebut && heureValue && heureValue < heureDebut) { alert(`Heure doit être ≥ ${heureDebut}`); return }
    if (heureFin && heureValue && heureValue > heureFin) { alert(`Heure doit être ≤ ${heureFin}`); return }
    setSavingHeure(true)
    try {
      const res = await fetch(`/api/admin/livraisons/${livraison.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ heure_precise: heureValue || null }) })
      if (res.ok) { onUpdate?.(livraison.id, { heure_precise: heureValue || null }); setEditingHeure(false) }
    } finally { setSavingHeure(false) }
  }

  const savePreferences = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (!livraison.client) return
    setSavingPrefs(true)
    try {
      const res = await fetch(`/api/admin/clients/${livraison.client.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences_livraison: prefsValue || null }) })
      if (res.ok) { onUpdate?.(livraison.id, { client: { ...livraison.client, preferences_livraison: prefsValue || null } }); setEditingPrefs(false) }
    } finally { setSavingPrefs(false) }
  }

  // Le drag n'est PLUS activé sur la carte entière : seule la poignée "Déplacer"
  // (bouton ci-dessous) porte ces handlers, pour éviter de démarrer un drag au
  // moindre contact avec la carte.
  const dragHandleProps = draggable
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData('text/livraison-id', livraison.id)
          e.dataTransfer.effectAllowed = 'move'
          onDragStart?.(livraison.id)
        },
        onDragEnd: () => onDragEnd?.(),
      }
    : {}

  if (expanded) {
    return (
      <div
        data-livraison-card={livraison.id}
        className={`relative group ${isDragging ? 'opacity-40' : ''}`}
      >
        <div className="border rounded-lg p-3 hover:bg-gray-50 transition-colors space-y-2">
          <Link
            href={livraison.client_id ? `/admin/clients/${livraison.client_id}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onDragStart={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-sm font-semibold flex-1">{clientName}</span>
              <Badge
                variant="secondary"
                className={`text-xs px-2 py-0.5 shrink-0 ${getStatutColor(livraison.statut)}`}
              >
                {getStatutLabel(livraison.statut)}
              </Badge>
            </div>
          </Link>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            {heureDebut && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {heureDebut}{heureFin ? ` - ${heureFin}` : ''}
              </span>
            )}
            {livraison.heure_precise && !editingHeure && (
              <span className="text-blue-600 font-medium">→ {livraison.heure_precise.slice(0, 5)}</span>
            )}
            <span className="flex items-center gap-1">
              <Bike className="h-3.5 w-3.5" />
              {nbVelos} vélo{nbVelos > 1 ? 's' : ''}
            </span>
            {livraison.mode_livraison && (
              <span className="flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" />
                {livraison.mode_livraison}
              </span>
            )}
          </div>
          {/* Téléphone cliquable */}
          {livraison.client?.telephone && (
            <a href={`tel:${livraison.client.telephone}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
              <Phone className="h-3.5 w-3.5" />{livraison.client.telephone}
            </a>
          )}
          {livraison.adresse_livraison_ligne1 && (
            <p className="text-xs text-gray-500 flex items-start gap-1">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {[livraison.adresse_livraison_ligne1, livraison.adresse_livraison_cp, livraison.adresse_livraison_ville].filter(Boolean).join(', ')}
            </p>
          )}
          {livraison.complement_adresse && (
            <p className="text-xs text-gray-500 ml-4 italic">{livraison.complement_adresse}</p>
          )}
          {/* Heure précise — inline edit */}
          <div className="flex items-center gap-2 text-xs" onClick={e => e.stopPropagation()}>
            {editingHeure ? (
              <>
                <input type="time" value={heureValue} onChange={e => setHeureValue(e.target.value)} className="border rounded px-1.5 py-0.5 text-xs w-24" />
                <button onClick={saveHeurePrecise} disabled={savingHeure} className="text-green-600 hover:text-green-700">
                  {savingHeure ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={e => { e.stopPropagation(); setEditingHeure(false) }} className="text-red-500"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <button onClick={e => { e.stopPropagation(); setHeureValue(livraison.heure_precise || ''); setEditingHeure(true) }} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <Clock className="h-3 w-3" />{livraison.heure_precise ? `Heure: ${livraison.heure_precise.slice(0, 5)}` : 'Définir heure'}<Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* Préférences client — inline edit */}
          <div className="text-xs" onClick={e => e.stopPropagation()}>
            {editingPrefs ? (
              <div className="flex gap-1">
                <textarea value={prefsValue} onChange={e => setPrefsValue(e.target.value)} className="flex-1 text-xs border rounded px-1.5 py-0.5 resize-none" rows={2} placeholder="Préférences..." />
                <div className="flex flex-col gap-0.5">
                  <button onClick={savePreferences} disabled={savingPrefs} className="text-green-600">{savingPrefs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</button>
                  <button onClick={e => { e.stopPropagation(); setEditingPrefs(false) }} className="text-red-500"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ) : livraison.client?.preferences_livraison ? (
              <div className="flex items-start gap-1 text-blue-600 bg-blue-50 rounded px-2 py-1">
                <Info className="h-3 w-3 mt-0.5 shrink-0" /><span className="flex-1">{livraison.client.preferences_livraison}</span>
                <button onClick={e => { e.stopPropagation(); setPrefsValue(livraison.client?.preferences_livraison || ''); setEditingPrefs(true) }} className="text-gray-400 hover:text-blue-600"><Pencil className="h-3 w-3" /></button>
              </div>
            ) : (
              <button onClick={e => { e.stopPropagation(); setPrefsValue(''); setEditingPrefs(true) }} className="text-gray-400 hover:text-blue-600 flex items-center gap-1">
                <Info className="h-3 w-3" /> Ajouter préférences <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
          {livraison.notes_admin && (
            <p className="text-xs text-gray-400 italic line-clamp-2">{livraison.notes_admin}</p>
          )}
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {draggable && (
            <span
              {...dragHandleProps}
              className={`w-5 h-5 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing`}
              title="Glisser pour déplacer (réordonner dans le créneau ou changer de jour)"
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            >
              <GripVertical className="h-3 w-3" />
            </span>
          )}
          {onMove && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMove(livraison) }}
              className="w-5 h-5 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
              title="Déplacer vers une autre date / livreur / créneau"
            >
              <Move className="h-3 w-3" />
            </button>
          )}
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
            <LivreurActions livraisonId={livraison.id} clientNom={clientName} />
          </span>
          {onRemove && (
            <RemoveConfirmPopover
              onConfirm={() => onRemove(livraison.id)}
              removing={removing}
              className="w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center text-xs font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity"
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      data-livraison-card={livraison.id}
      className={`relative group ${isDragging ? 'opacity-40' : ''}`}
    >
      <Link
        href={livraison.client_id ? `/admin/clients/${livraison.client_id}` : '#'}
        className="block"
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        onDragStart={(e) => e.stopPropagation()}
      >
        <div className="border rounded p-1 hover:bg-gray-50 transition-colors cursor-pointer space-y-0.5">
          <div className="flex items-center gap-1 text-[11px] font-medium text-gray-800 leading-tight">
            <div className={`w-2 h-2 rounded-full shrink-0 ${getStatutColor(livraison.statut).split(' ')[0].replace('text-', 'bg-')}`} />
            <span className="truncate flex-1" title={clientName}>{clientName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <Bike className="h-2.5 w-2.5" />
            <span>{nbVelos}</span>
            {heureDebut && (
              <span className="text-gray-400">{heureDebut}</span>
            )}
          </div>
        </div>
      </Link>
      <div className="mt-0.5 flex items-center gap-1">
        {draggable && (
          <span
            {...dragHandleProps}
            className="shrink-0 inline-flex items-center justify-center rounded px-1 py-0.5 bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-700 transition-colors cursor-grab active:cursor-grabbing"
            title="Glisser pour déplacer (réordonner dans le créneau ou changer de jour)"
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
          >
            <GripVertical className="h-2.5 w-2.5" />
          </span>
        )}
        {onMove && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMove(livraison) }}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded px-1 py-0.5 text-[10px] bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 transition-colors"
            title="Déplacer vers une autre date"
          >
            <Move className="h-2.5 w-2.5" />
            <span>Déplacer</span>
          </button>
        )}
        <LivreurActions livraisonId={livraison.id} clientNom={clientName} compact />
        {onRemove && (
          <RemoveConfirmPopover
            onConfirm={() => onRemove(livraison.id)}
            removing={removing}
            className="w-4 h-4 shrink-0 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center text-[10px] font-bold leading-none"
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mini Calendar sub-component
// ---------------------------------------------------------------------------

function MiniCalendar({
  month,
  selectedDate,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: {
  month: Date
  selectedDate: Date
  onSelectDay: (d: Date) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const days = getMonthCalendarDays(month.getFullYear(), month.getMonth())
  const today = new Date()

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={onPrevMonth} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {MOIS_LABELS[month.getMonth()]} {month.getFullYear()}
        </span>
        <button onClick={onNextMonth} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((j) => (
          <div key={j} className="text-center text-[10px] font-medium text-gray-400 py-1">
            {j}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {days.map((d, idx) => {
          const inMonth = isSameMonth(d, month)
          const isToday = isSameDay(d, today)
          const isSelected = isSameDay(d, selectedDate)

          return (
            <button
              key={idx}
              onClick={() => onSelectDay(d)}
              className={`
                text-center text-xs py-1.5 rounded transition-colors
                ${!inMonth ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-100'}
                ${isToday && !isSelected ? 'font-bold text-blue-600' : ''}
                ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700 font-bold' : ''}
              `}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Day View sub-component
// ---------------------------------------------------------------------------

function DayView({
  day,
  livraisons,
  velosDay,
  capaciteJour,
  creneaux,
  isOpen,
  isToday,
  canAddClient,
  onAddClient,
  onRemoveLivraison,
  removingLivraisonId,
  onSelectCreneau,
  selectedCreneau,
  onSendMailPlanning,
  sendingMailByKey,
  onBulkReschedule,
  bulkReschedulingDate,
  onUpdateLivraison,
  onMoveLivraison,
  draggingLivraisonId,
  onDragStartLivraison,
  onDropOnSlot,
}: {
  day: Date
  livraisons: PlanningLivraison[]
  velosDay: number
  capaciteJour: number
  creneaux: CreneauConfig[]
  isOpen: boolean
  isToday: boolean
  canAddClient: boolean
  onAddClient: (creneauHeure?: string) => void
  onRemoveLivraison: (id: string) => void
  removingLivraisonId: string | null
  onSelectCreneau: (date: string, heure_debut: string, heure_fin: string, capacite: number) => void
  selectedCreneau: SelectedCreneau | null
  onSendMailPlanning?: (key: string, livraisonIds: string[]) => void
  sendingMailByKey?: Record<string, boolean>
  onBulkReschedule?: (date: string, expectedCount: number) => void
  bulkReschedulingDate?: string | null
  onUpdateLivraison?: (id: string, data: Partial<PlanningLivraison>) => void
  onMoveLivraison?: (livraison: PlanningLivraison) => void
  draggingLivraisonId?: string | null
  onDragStartLivraison?: (id: string | null) => void
  onDropOnSlot?: (params: { livraisonId: string; targetDate: string; targetCreneau: { heure_debut: string; heure_fin: string } | null; targetIndex?: number | null }) => void
}) {
  // Indicateur de position de drop : créneau survolé + index d'insertion.
  const [dragOver, setDragOver] = useState<{ key: string; index: number } | null>(null)

  if (!isOpen) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Calendar className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">
          {JOURS_LABELS_FULL[day.getDay()]} {formatDateShort(day)}
        </p>
        <p className="text-sm mt-1">Ce jour est fermé</p>
      </div>
    )
  }

  // Assign livraisons to créneau buckets
  const getLivraisonsForCreneau = (c: CreneauConfig): PlanningLivraison[] => {
    return livraisons.filter((l) => {
      if (!l.creneau_heure_debut) return false
      const h = l.creneau_heure_debut.slice(0, 5)
      return h === c.heure_debut.slice(0, 5)
    })
  }

  const assignedIds = new Set(
    creneaux.flatMap((c) => getLivraisonsForCreneau(c).map((l) => l.id))
  )
  const unassigned = livraisons.filter((l) => !assignedIds.has(l.id))

  const hasCreneaux = creneaux.length > 0
  const dateStr = formatDate(day)
  const todayStr = formatDate(new Date())
  const isPastDay = dateStr < todayStr
  const nonLivresCount = livraisons.filter(l => l.statut !== 'livree' && l.statut !== 'annulee').length

  return (
    <div className="space-y-4">
      {/* Day action buttons (Mail + Bulk reschedule) */}
      {(livraisons.length > 0 && onSendMailPlanning) || (isPastDay && nonLivresCount > 0 && onBulkReschedule) ? (
        <div className="flex justify-end gap-2">
          {isPastDay && nonLivresCount > 0 && onBulkReschedule && (() => {
            const isBulking = bulkReschedulingDate === dateStr
            return (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onBulkReschedule(dateStr, nonLivresCount)}
                disabled={isBulking}
                className="text-xs bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                title="Remettre les clients non livrés en 'à livrer'"
              >
                {isBulking ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                )}
                Remettre {nonLivresCount} non livré{nonLivresCount > 1 ? 's' : ''}
              </Button>
            )
          })()}
          {livraisons.length > 0 && onSendMailPlanning && (() => {
            const dayKey = `day_${dateStr}`
            const isSending = !!sendingMailByKey?.[dayKey]
            return (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSendMailPlanning(dayKey, livraisons.map(l => l.id))}
                disabled={isSending}
                className="text-xs"
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5 mr-1.5" />
                )}
                Mail planning ({livraisons.length} client{livraisons.length > 1 ? 's' : ''})
              </Button>
            )
          })()}
        </div>
      ) : null}

      {hasCreneaux ? (
        /* Créneau blocks */
        <div className="space-y-3">
          {creneaux.map((c) => {
            const slotLivraisons = getLivraisonsForCreneau(c)
            const slotVelos = slotLivraisons.reduce((sum, l) => sum + (l.client?.velo_valide || l.client?.velo_devis || 0), 0)
            const slotRatio = c.capacite_velos > 0 ? slotVelos / c.capacite_velos : 0
            const isFull = slotVelos >= c.capacite_velos
            const isSelected =
              selectedCreneau?.date === dateStr &&
              selectedCreneau?.heure_debut === c.heure_debut.slice(0, 5)
            const isDropTarget = !!draggingLivraisonId

            return (
              <div
                key={c.heure_debut}
                onClick={() => onSelectCreneau(dateStr, c.heure_debut.slice(0, 5), c.heure_fin.slice(0, 5), c.capacite_velos)}
                onDragOver={isDropTarget ? (e) => {
                  e.preventDefault(); e.dataTransfer.dropEffect = 'move'
                  const idx = computeDropIndex(e) ?? slotLivraisons.length
                  setDragOver((prev) => (prev?.key === c.heure_debut && prev?.index === idx ? prev : { key: c.heure_debut, index: idx }))
                } : undefined}
                onDragLeave={isDropTarget ? (e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver((prev) => (prev?.key === c.heure_debut ? null : prev))
                } : undefined}
                onDrop={isDropTarget ? (e) => {
                  e.preventDefault()
                  setDragOver(null)
                  const id = e.dataTransfer.getData('text/livraison-id')
                  if (id) onDropOnSlot?.({ livraisonId: id, targetDate: dateStr, targetCreneau: { heure_debut: c.heure_debut.slice(0, 5), heure_fin: c.heure_fin.slice(0, 5) }, targetIndex: computeDropIndex(e) })
                } : undefined}
                className={`border-2 rounded-xl overflow-hidden cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-200'
                    : isDropTarget
                      ? 'border-blue-400 border-dashed bg-blue-50/60'
                      : isFull
                        ? 'border-red-200 bg-red-50/30 hover:border-red-300'
                        : 'border-blue-100 bg-blue-50/20 hover:border-blue-300'
                }`}
              >
                {/* Créneau header */}
                <div className={`flex items-center justify-between px-4 py-2 ${
                  isSelected ? 'bg-blue-50' : isFull ? 'bg-red-50' : 'bg-blue-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {isJourneeEntiere(c) ? (
                        <CalendarDays className="h-4 w-4 text-gray-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="text-sm font-semibold text-gray-700">
                        {isJourneeEntiere(c)
                          ? 'Journée entière'
                          : `${c.heure_debut.slice(0, 5)} – ${c.heure_fin.slice(0, 5)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Bike className="h-4 w-4 text-gray-500" />
                      {isJourneeEntiere(c) ? (
                        <span className="text-sm font-medium text-gray-600">
                          {slotVelos} vélo{slotVelos > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className={`text-sm ${creneauCapacityColor(slotVelos, c.capacite_velos)}`}>
                          {slotVelos}/{c.capacite_velos} vélos
                        </span>
                      )}
                    </div>
                    {/* Mini fill bar — masquée pour Journée entière (pas de capacité) */}
                    {!isJourneeEntiere(c) && (
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            slotRatio > 1 ? 'bg-red-500' : slotRatio >= 0.8 ? 'bg-orange-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, slotRatio * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {slotLivraisons.length > 0 && (
                    <Link
                      href={`/admin/tournees-intelligentes?from_creneau=1&date=${dateStr}&capacite=${Math.max(1, c.capacite_velos - slotVelos)}&include=${slotLivraisons.map(l => l.client_id).filter(Boolean).join(',')}&creneau_debut=${c.heure_debut}&creneau_fin=${c.heure_fin}&capacite_max=${c.capacite_velos - slotVelos}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200"
                        title="Simuler une tournée intelligente à partir de ce créneau"
                      >
                        <Route className="h-3.5 w-3.5" />
                      </button>
                    </Link>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddClient(c.heure_debut) }}
                      disabled={isFull || !canAddClient}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        isFull || !canAddClient
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                      title={!canAddClient ? 'Sélectionnez un livreur pour planifier' : undefined}
                    >
                      <span className="text-base leading-none">+</span> Ajouter
                    </button>
                  </div>
                </div>

                {/* Livraisons in this créneau */}
                <div className="p-3 space-y-2" data-livraison-list>
                  {slotLivraisons.length === 0 ? (
                    <>
                      {isDropTarget && dragOver?.key === c.heure_debut && (
                        <div className="h-0.5 rounded-full bg-blue-600 -my-1" />
                      )}
                      <p className="text-sm text-gray-400 text-center py-2 italic">
                        Aucune livraison dans ce créneau
                      </p>
                    </>
                  ) : (
                    slotLivraisons.map((livraison, i) => (
                      <div key={livraison.id} className="space-y-2">
                        {isDropTarget && dragOver?.key === c.heure_debut && dragOver.index === i && (
                          <div className="h-0.5 rounded-full bg-blue-600 -my-1" />
                        )}
                        <LivraisonCard
                          livraison={livraison}
                          expanded
                          onRemove={onRemoveLivraison}
                          removing={removingLivraisonId === livraison.id}
                          onUpdate={onUpdateLivraison}
                          onMove={onMoveLivraison}
                          draggable={!!onDropOnSlot}
                          isDragging={draggingLivraisonId === livraison.id}
                          onDragStart={onDragStartLivraison}
                          onDragEnd={() => onDragStartLivraison?.(null)}
                        />
                        {isDropTarget && dragOver?.key === c.heure_debut && dragOver.index === i + 1 && i === slotLivraisons.length - 1 && (
                          <div className="h-0.5 rounded-full bg-blue-600 -my-1" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {/* Unassigned livraisons */}
          {unassigned.length > 0 && (
            <div
              className="border border-gray-200 rounded-xl overflow-hidden"
              onDragOver={draggingLivraisonId ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
              onDrop={draggingLivraisonId ? (e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/livraison-id')
                if (id) onDropOnSlot?.({ livraisonId: id, targetDate: dateStr, targetCreneau: null })
              } : undefined}
            >
              <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-600">Autres (sans créneau) — {unassigned.length}</span>
                <button
                  onClick={() => onAddClient(undefined)}
                  disabled={!canAddClient}
                  className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    !canAddClient
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  title={!canAddClient ? 'Sélectionnez un livreur pour planifier' : undefined}
                >
                  <span className="text-base leading-none">+</span> Ajouter
                </button>
              </div>
              <div className="p-3 space-y-2">
                {unassigned.map((livraison) => (
                  <div key={livraison.id}>
                    <LivraisonCard
                      livraison={livraison}
                      expanded
                      onRemove={onRemoveLivraison}
                      removing={removingLivraisonId === livraison.id}
                      onUpdate={onUpdateLivraison}
                      onMove={onMoveLivraison}
                      draggable={!!onDropOnSlot}
                      isDragging={draggingLivraisonId === livraison.id}
                      onDragStart={onDragStartLivraison}
                      onDragEnd={() => onDragStartLivraison?.(null)}
                    />
                    {creneaux.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 ml-2">
                        <span className="text-[10px] text-gray-400">Déplacer →</span>
                        {creneaux.map((c) => (
                          <MoveToCreneauButton
                            key={c.heure_debut}
                            livraisonId={livraison.id}
                            creneauDebut={c.heure_debut}
                            creneauFin={c.heure_fin}
                            onMoved={(data) => onUpdateLivraison?.(livraison.id, data)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No créneau config — plain list */
        <>
          {livraisons.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Truck className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune livraison programmée</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...livraisons]
                .sort((a, b) => {
                  // Priorité : ordre de la tournée optimisée (tournee_position) si défini,
                  // sinon fallback sur creneau_heure_debut.
                  const ap = a.tournee_position
                  const bp = b.tournee_position
                  if (ap != null && bp != null) return ap - bp
                  if (ap != null) return -1
                  if (bp != null) return 1
                  return (a.creneau_heure_debut || '99:99').localeCompare(b.creneau_heure_debut || '99:99')
                })
                .map((livraison) => (
                  <LivraisonCard
                    key={livraison.id}
                    livraison={livraison}
                    expanded
                    onRemove={onRemoveLivraison}
                    removing={removingLivraisonId === livraison.id}
                    onUpdate={onUpdateLivraison}
                    onMove={onMoveLivraison}
                    draggable={!!onDropOnSlot}
                    isDragging={draggingLivraisonId === livraison.id}
                    onDragStart={onDragStartLivraison}
                    onDragEnd={() => onDragStartLivraison?.(null)}
                  />
                ))
              }
            </div>
          )}
          <button
            onClick={() => onAddClient(undefined)}
            disabled={!canAddClient}
            className={`w-full py-2 border-2 border-dashed rounded-lg text-sm transition-colors flex items-center justify-center gap-1 ${
              !canAddClient
                ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
            }`}
            title={!canAddClient ? 'Sélectionnez un livreur pour planifier' : undefined}
          >
            <span className="text-lg leading-none">+</span> Ajouter un client
          </button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Week View sub-component
// ---------------------------------------------------------------------------

function WeekView({
  weekDays,
  today,
  creneaux,
  capaciteJour,
  getLivraisonsForDay,
  getVelosForDay,
  isDayOpen,
  onDayClick,
  canAddClient,
  onAddClient,
  onRemoveLivraison,
  removingLivraisonId,
  onSelectCreneau,
  selectedCreneau,
  onSendMailPlanning,
  sendingMailByKey,
  onBulkReschedule,
  bulkReschedulingDate,
  onUpdateLivraison,
  onMoveLivraison,
  draggingLivraisonId,
  onDragStartLivraison,
  onDropOnSlot,
}: {
  weekDays: Date[]
  today: Date
  creneaux: CreneauConfig[]
  capaciteJour: number
  getLivraisonsForDay: (d: Date) => PlanningLivraison[]
  getVelosForDay: (d: Date) => number
  isDayOpen: (d: Date) => boolean
  onDayClick: (d: Date) => void
  canAddClient: boolean
  onAddClient: (day: Date, creneauHeure?: string) => void
  onRemoveLivraison: (id: string) => void
  removingLivraisonId: string | null
  onSelectCreneau: (date: string, heure_debut: string, heure_fin: string, capacite: number) => void
  selectedCreneau: SelectedCreneau | null
  onSendMailPlanning?: (key: string, livraisonIds: string[]) => void
  sendingMailByKey?: Record<string, boolean>
  onBulkReschedule?: (date: string, expectedCount: number) => void
  bulkReschedulingDate?: string | null
  onUpdateLivraison?: (id: string, data: Partial<PlanningLivraison>) => void
  onMoveLivraison?: (livraison: PlanningLivraison) => void
  draggingLivraisonId?: string | null
  onDragStartLivraison?: (id: string | null) => void
  onDropOnSlot?: (params: { livraisonId: string; targetDate: string; targetCreneau: { heure_debut: string; heure_fin: string } | null; targetIndex?: number | null }) => void
}) {
  const hasCreneaux = creneaux.length > 0
  const numDays = weekDays.length
  // Indicateur de position de drop : clé "date__heure_debut" + index d'insertion.
  const [dragOver, setDragOver] = useState<{ key: string; index: number } | null>(null)

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-1 gap-2"
      style={{ gridTemplateColumns: `repeat(${numDays}, 1fr)` }}
    >
      {weekDays.map((day) => {
        const open = isDayOpen(day)
        const dayLivraisons = getLivraisonsForDay(day)
        const velosDay = getVelosForDay(day)
        const isToday = isSameDay(day, today)
        const dateStr = formatDate(day)

        // Per créneau: get livraisons that match heure_debut
        const getLivraisonsForCreneau = (c: CreneauConfig) =>
          dayLivraisons.filter((l) => {
            if (!l.creneau_heure_debut) return false
            return l.creneau_heure_debut.slice(0, 5) === c.heure_debut.slice(0, 5)
          })

        const isDayDropTarget = !!draggingLivraisonId && open
        return (
          <div
            key={formatDate(day)}
            onDragOver={isDayDropTarget ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } : undefined}
            onDrop={isDayDropTarget ? (e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/livraison-id')
              if (id) onDropOnSlot?.({ livraisonId: id, targetDate: dateStr, targetCreneau: null })
            } : undefined}
            className={`
              border rounded-lg overflow-hidden flex flex-col min-h-[400px]
              ${isToday ? 'border-blue-500 border-2' : 'border-gray-200'}
              ${!open ? 'bg-gray-50' : 'bg-white'}
              ${isDayDropTarget ? 'ring-2 ring-blue-300' : ''}
            `}
          >
            {/* Day header — clicking navigates */}
            <button
              className={`
                px-2 py-1.5 text-center border-b text-sm font-medium w-full
                ${isToday ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}
              `}
              onClick={() => onDayClick(day)}
            >
              <div>{JOURS_LABELS[day.getDay()]}</div>
              <div className="text-xs">{formatDateShort(day)}</div>
            </button>

            {/* Mail planning button per day */}
            {open && dayLivraisons.length > 0 && onSendMailPlanning && (() => {
              const calKey = `calendar_${dateStr}`
              const isSending = !!sendingMailByKey?.[calKey]
              return (
                <div className="px-1 py-1 border-b bg-gray-50 flex justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSendMailPlanning(calKey, dayLivraisons.map(l => l.id)) }}
                    disabled={isSending}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                    title={`Envoyer mail planning à ${dayLivraisons.length} client(s)`}
                  >
                    {isSending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Mail className="h-3 w-3" />
                    )}
                    <span>{dayLivraisons.length}</span>
                  </button>
                </div>
              )
            })()}

            {/* Bulk reschedule button — past days only, non-delivered count > 0 */}
            {open && onBulkReschedule && dateStr < formatDate(today) && (() => {
              const nonLivres = dayLivraisons.filter(l => l.statut !== 'livree' && l.statut !== 'annulee')
              if (nonLivres.length === 0) return null
              const isBulking = bulkReschedulingDate === dateStr
              return (
                <div className="px-1 py-1 border-b bg-amber-50/50 flex justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); onBulkReschedule(dateStr, nonLivres.length) }}
                    disabled={isBulking}
                    className="flex items-center gap-1 text-[10px] text-amber-700 hover:text-amber-900 hover:bg-amber-100 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                    title={`Remettre ${nonLivres.length} client(s) non livré(s) en 'à livrer'`}
                  >
                    {isBulking ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3 w-3" />
                    )}
                    <span>Remettre {nonLivres.length}</span>
                  </button>
                </div>
              )
            })()}

            {!open ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
                Fermé
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {/* Global capacity bar (no créneau config) */}
                {capaciteJour > 0 && !hasCreneaux && (
                  <div className="px-2 py-1 border-b bg-gray-50">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Bike className="h-3 w-3" />
                        {velosDay}/{capaciteJour}
                      </span>
                      <span>{Math.round((velosDay / capaciteJour) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          velosDay / capaciteJour > 0.9
                            ? 'bg-red-500'
                            : velosDay / capaciteJour > 0.7
                              ? 'bg-amber-500'
                              : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, (velosDay / capaciteJour) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {hasCreneaux ? (
                  /* Créneau bars */
                  <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto">
                    {creneaux.map((c) => {
                      const slotLivraisons = getLivraisonsForCreneau(c)
                      const slotVelos = slotLivraisons.reduce((sum, l) => sum + (l.client?.velo_valide || l.client?.velo_devis || 0), 0)
                      const slotRatio = c.capacite_velos > 0 ? slotVelos / c.capacite_velos : 0
                      const isFull = slotVelos >= c.capacite_velos
                      const isSelected =
                        selectedCreneau?.date === dateStr &&
                        selectedCreneau?.heure_debut === c.heure_debut.slice(0, 5)

                      const isCrenDropTarget = !!draggingLivraisonId
                      return (
                        <div
                          key={c.heure_debut}
                          onClick={() => onSelectCreneau(dateStr, c.heure_debut.slice(0, 5), c.heure_fin.slice(0, 5), c.capacite_velos)}
                          onDragOver={isCrenDropTarget ? (e) => {
                            e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'
                            const crenKey = `${dateStr}__${c.heure_debut}`
                            const idx = computeDropIndex(e) ?? slotLivraisons.length
                            setDragOver((prev) => (prev?.key === crenKey && prev?.index === idx ? prev : { key: crenKey, index: idx }))
                          } : undefined}
                          onDragLeave={isCrenDropTarget ? (e) => {
                            const crenKey = `${dateStr}__${c.heure_debut}`
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver((prev) => (prev?.key === crenKey ? null : prev))
                          } : undefined}
                          onDrop={isCrenDropTarget ? (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDragOver(null)
                            const id = e.dataTransfer.getData('text/livraison-id')
                            if (id) onDropOnSlot?.({ livraisonId: id, targetDate: dateStr, targetCreneau: { heure_debut: c.heure_debut.slice(0, 5), heure_fin: c.heure_fin.slice(0, 5) }, targetIndex: computeDropIndex(e) })
                          } : undefined}
                          className={`rounded-lg border overflow-hidden cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-1 ring-blue-300 bg-blue-50/40'
                              : isCrenDropTarget
                                ? 'border-blue-400 border-dashed bg-blue-50/60'
                                : isFull
                                  ? 'border-red-200 bg-red-50/40 hover:border-red-300'
                                  : slotRatio > 0
                                    ? 'border-blue-200 bg-blue-50/40 hover:border-blue-300'
                                    : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                          }`}
                        >
                          {/* Créneau enrichi */}
                          <div className="px-2 py-1.5">
                            {/* Header: heures + bouton + */}
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-semibold text-gray-700 inline-flex items-center gap-1">
                                {isJourneeEntiere(c) ? (
                                  <>
                                    <CalendarDays className="h-3 w-3" />
                                    Journée entière
                                  </>
                                ) : (
                                  <>{c.heure_debut.slice(0, 5)} – {c.heure_fin.slice(0, 5)}</>
                                )}
                              </span>
                              <div className="flex items-center gap-1">
                                {slotLivraisons.length > 0 && (
                                <Link
                                  href={`/admin/tournees-intelligentes?from_creneau=1&date=${dateStr}&capacite=${Math.max(1, c.capacite_velos - slotVelos)}&include=${slotLivraisons.map(l => l.client_id).filter(Boolean).join(',')}&creneau_debut=${c.heure_debut}&creneau_fin=${c.heure_fin}&capacite_max=${c.capacite_velos - slotVelos}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div
                                    className="shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors bg-purple-100 text-purple-600 hover:bg-purple-200"
                                    title="Tournée intelligente"
                                  >
                                    <Route className="h-3 w-3" />
                                  </div>
                                </Link>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); onAddClient(day, c.heure_debut) }}
                                  disabled={isFull || !canAddClient}
                                  className={`shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold transition-colors ${
                                    isFull || !canAddClient
                                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                      : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                                  }`}
                                  title={!canAddClient ? 'Sélectionnez un livreur pour planifier' : `Ajouter dans ${isJourneeEntiere(c) ? 'Journée entière' : `${c.heure_debut.slice(0, 5)}-${c.heure_fin.slice(0, 5)}`}`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            {/* Stats */}
                            {(() => {
                              const nbClients = slotLivraisons.length
                              const nbLivres = slotLivraisons.filter(l => l.statut === 'livree').length
                              const nbEnCours = slotLivraisons.filter(l => l.statut === 'en_livraison').length
                              const pct = nbClients > 0 ? Math.round((nbLivres / nbClients) * 100) : 0
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                                    <Users className="h-3 w-3" />
                                    <span className="font-medium">{nbClients} client{nbClients > 1 ? 's' : ''}</span>
                                    {nbLivres > 0 && <span className="text-green-600">{nbLivres} livré{nbLivres > 1 ? 's' : ''}</span>}
                                    {nbEnCours > 0 && <span className="text-orange-600">{nbEnCours} en cours</span>}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                                    <Bike className="h-3 w-3" />
                                    {isJourneeEntiere(c) ? (
                                      <span>{slotVelos} vélo{slotVelos > 1 ? 's' : ''}</span>
                                    ) : (
                                      <span className={creneauCapacityColor(slotVelos, c.capacite_velos)}>
                                        {slotVelos}/{c.capacite_velos} vélos
                                      </span>
                                    )}
                                  </div>
                                  {/* Barre de progression — masquée pour Journée entière */}
                                  {!isJourneeEntiere(c) && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                      <div
                                        className={`h-1.5 rounded-full transition-all ${
                                          slotRatio > 1 ? 'bg-red-500' : slotRatio >= 0.8 ? 'bg-orange-500' : 'bg-green-500'
                                        }`}
                                        style={{ width: `${Math.min(100, slotRatio * 100)}%` }}
                                      />
                                    </div>
                                    {nbClients > 0 && (
                                      <span className={`text-[9px] font-bold shrink-0 ${pct === 100 ? 'text-green-600' : 'text-gray-500'}`}>
                                        {pct}%
                                      </span>
                                    )}
                                  </div>
                                  )}
                                </div>
                              )
                            })()}
                            {/* Cards clients du créneau (compact, draggable, bouton Déplacer) */}
                            {slotLivraisons.length > 0 && (
                              <div
                                className="mt-1.5 space-y-1"
                                data-livraison-list
                                onClick={(e) => e.stopPropagation()}
                              >
                                {slotLivraisons.map((livraison, i) => {
                                  const crenKey = `${dateStr}__${c.heure_debut}`
                                  const showLine = isCrenDropTarget && dragOver?.key === crenKey
                                  return (
                                  <div key={livraison.id} className="space-y-1">
                                    {showLine && dragOver?.index === i && (
                                      <div className="h-0.5 rounded-full bg-blue-600 -my-0.5" />
                                    )}
                                    <LivraisonCard
                                      livraison={livraison}
                                      onRemove={onRemoveLivraison}
                                      removing={removingLivraisonId === livraison.id}
                                      onUpdate={onUpdateLivraison}
                                      onMove={onMoveLivraison}
                                      draggable={!!onDropOnSlot}
                                      isDragging={draggingLivraisonId === livraison.id}
                                      onDragStart={onDragStartLivraison}
                                      onDragEnd={() => onDragStartLivraison?.(null)}
                                    />
                                    {showLine && dragOver?.index === i + 1 && i === slotLivraisons.length - 1 && (
                                      <div className="h-0.5 rounded-full bg-blue-600 -my-0.5" />
                                    )}
                                  </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {/* Livraisons non assignées — cards compactes draggables */}
                    {(() => {
                      const assignedIds = new Set(
                        creneaux.flatMap((c) => getLivraisonsForCreneau(c).map((l) => l.id))
                      )
                      const unassigned = dayLivraisons.filter((l) => !assignedIds.has(l.id))
                      const velosHors = unassigned.reduce((s, l) => s + (l.client?.velo_valide || l.client?.velo_devis || 0), 0)
                      const isHorsSelected = selectedCreneau?.date === dateStr && selectedCreneau?.heure_debut === '_hors_creneau'
                      const isUnassignedDropTarget = !!draggingLivraisonId
                      return unassigned.length > 0 ? (
                        <div
                          onClick={() => onSelectCreneau(dateStr, '_hors_creneau', '', 0)}
                          onDragOver={isUnassignedDropTarget ? (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move' } : undefined}
                          onDrop={isUnassignedDropTarget ? (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const id = e.dataTransfer.getData('text/livraison-id')
                            if (id) onDropOnSlot?.({ livraisonId: id, targetDate: dateStr, targetCreneau: null })
                          } : undefined}
                          className={`rounded-lg border overflow-hidden cursor-pointer transition-all ${
                            isHorsSelected
                              ? 'border-amber-500 ring-1 ring-amber-300 bg-amber-50'
                              : isUnassignedDropTarget
                                ? 'border-blue-400 border-dashed bg-blue-50/60'
                                : 'border-amber-200 bg-amber-50/50 hover:border-amber-300'
                          } px-1.5 py-1 space-y-1`}
                        >
                          <div className="flex items-center gap-1">
                            <Bike className="h-3 w-3 text-amber-600" />
                            <span className="text-[10px] font-medium text-amber-700">{unassigned.length} clients / {velosHors} vélos hors créneau</span>
                          </div>
                          <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                            {unassigned.map((l) => (
                              <LivraisonCard
                                key={l.id}
                                livraison={l}
                                onRemove={onRemoveLivraison}
                                removing={removingLivraisonId === l.id}
                                onUpdate={onUpdateLivraison}
                                onMove={onMoveLivraison}
                                draggable={!!onDropOnSlot}
                                isDragging={draggingLivraisonId === l.id}
                                onDragStart={onDragStartLivraison}
                                onDragEnd={() => onDragStartLivraison?.(null)}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null
                    })()}
                  </div>
                ) : (
                  /* No créneau config — plain list */
                  <div className="flex-1 p-1 space-y-1 overflow-y-auto">
                    {dayLivraisons.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">
                        Aucune livraison
                      </p>
                    ) : (
                      dayLivraisons.map((livraison) => (
                        <LivraisonCard
                          key={livraison.id}
                          livraison={livraison}
                          onRemove={onRemoveLivraison}
                          removing={removingLivraisonId === livraison.id}
                          onMove={onMoveLivraison}
                          draggable={!!onDropOnSlot}
                          isDragging={draggingLivraisonId === livraison.id}
                          onDragStart={onDragStartLivraison}
                          onDragEnd={() => onDragStartLivraison?.(null)}
                        />
                      ))
                    )}
                  </div>
                )}

                {/* Add client button */}
                <button
                  onClick={(e) => { e.stopPropagation(); onAddClient(day) }}
                  disabled={!canAddClient}
                  className={`w-full py-1.5 text-xs border-t transition-colors flex items-center justify-center gap-1 ${
                    !canAddClient
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                  title={!canAddClient ? 'Sélectionnez un livreur pour planifier' : undefined}
                >
                  <span className="text-sm leading-none">+</span> Client
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Month View sub-component
// ---------------------------------------------------------------------------

function MonthView({
  selectedDate,
  today,
  getLivraisonsForDay,
  getVelosForDay,
  isDayOpen,
  capaciteJour,
  onDayClick,
}: {
  selectedDate: Date
  today: Date
  getLivraisonsForDay: (d: Date) => PlanningLivraison[]
  getVelosForDay: (d: Date) => number
  isDayOpen: (d: Date) => boolean
  capaciteJour: number
  onDayClick: (d: Date) => void
}) {
  const days = getMonthCalendarDays(selectedDate.getFullYear(), selectedDate.getMonth())

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((j) => (
          <div
            key={j}
            className="text-center text-xs font-semibold text-gray-500 py-2 border-b"
          >
            {j}
          </div>
        ))}
      </div>

      {/* Day cells grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, idx) => {
          const inMonth = isSameMonth(d, selectedDate)
          const open = isDayOpen(d)
          const isToday = isSameDay(d, today)
          const dayLivraisons = getLivraisonsForDay(d)
          const velosDay = getVelosForDay(d)
          const count = dayLivraisons.length
          const ratio = capaciteJour > 0 ? velosDay / capaciteJour : 0

          let capacityColor = 'bg-green-100 border-green-200'
          if (ratio > 0.9) capacityColor = 'bg-red-100 border-red-200'
          else if (ratio > 0.7) capacityColor = 'bg-amber-100 border-amber-200'
          else if (ratio > 0.4) capacityColor = 'bg-blue-50 border-blue-200'

          return (
            <button
              key={idx}
              onClick={() => onDayClick(d)}
              className={`
                border rounded-lg p-1.5 min-h-[70px] md:min-h-[80px] text-left transition-colors
                ${!inMonth ? 'opacity-30' : ''}
                ${!open && inMonth ? 'bg-gray-100 border-gray-200' : ''}
                ${open && inMonth && count > 0 ? capacityColor : ''}
                ${open && inMonth && count === 0 ? 'bg-white border-gray-200 hover:border-gray-400' : ''}
                ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                hover:shadow-sm
              `}
            >
              {/* Day number */}
              <div
                className={`text-xs font-medium mb-1 ${
                  isToday
                    ? 'bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center'
                    : 'text-gray-700'
                }`}
              >
                {d.getDate()}
              </div>

              {!open && inMonth ? (
                <span className="text-[10px] text-gray-400">Fermé</span>
              ) : inMonth && count > 0 ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-0.5 text-[10px] font-medium text-gray-700">
                    <Truck className="h-2.5 w-2.5" />
                    {count}
                  </div>
                  {capaciteJour > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-gray-500">
                      <Bike className="h-2.5 w-2.5" />
                      {velosDay}/{capaciteJour}
                    </div>
                  )}
                </div>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function PlanningPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <PlanningContent />
    </Suspense>
  )
}
