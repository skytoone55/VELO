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
  Send, MapPin, Bike, Clock, Search, Eye, X, Trash2, Mail,
} from 'lucide-react'
import { DELIVERY_STATUS } from '@/lib/constants'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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

  // State
  const [depots, setDepots] = useState<DepotOption[]>([])
  const [selectedDepotId, setSelectedDepotId] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('semaine')
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [livraisons, setLivraisons] = useState<PlanningLivraison[]>([])
  const [clientsALivrer, setClientsALivrer] = useState<PlanningClient[]>([])
  const [depot, setDepot] = useState<DepotFull | null>(null)
  const [sendingFormulaire, setSendingFormulaire] = useState<string | null>(null)
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
  const [sendingMailPlanning, setSendingMailPlanning] = useState(false)
  const [mailPlanningMessage, setMailPlanningMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false)
  const [selectedCreneau, setSelectedCreneau] = useState<SelectedCreneau | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Week days array (Mon-Sun)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  // Filter livraisons by selected livreur (empty string = no livreur selected, show all read-only)
  const filteredLivraisons = useMemo(() => {
    if (!selectedLivreurId) return livraisons
    return livraisons.filter(l => (l as any).livreur_id === selectedLivreurId || !(l as any).livreur_id)
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

        const depotList = (json.depots || []) as DepotOption[]
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
        // Auto-select: si le user est livreur, sélectionner lui-même, sinon le premier
        const selfMatch = livreurList.find(l => l.id === adminUser.id)
        setSelectedLivreurId(selfMatch ? selfMatch.id : (livreurList.length > 0 ? livreurList[0].id : ''))
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
      const supabase = createClient()
      const { data } = await supabase
        .from('clients')
        .select('id, raison_sociale, velo_devis, velo_valide, telephone, email, statut_commercial, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville')
        .eq('statut_commercial', 'a_livrer')
        .or(`raison_sociale.ilike.%${query}%,telephone.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10)
      setPlacementResults((data || []) as PlanningClient[])
    } catch (err) {
      console.error('Erreur recherche:', err)
    } finally {
      setPlacementLoading(false)
    }
  }

  const handlePlaceClient = async (clientId: string) => {
    if (!selectedDepotId || !placementDate) return
    if (!selectedLivreurId) {
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
      if (selectedLivreurId) {
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
  const handleRemoveLivraison = async (livraisonId: string) => {
    if (!confirm('Retirer ce client du planning ?')) return
    setRemovingLivraisonId(livraisonId)
    try {
      const supabase = createClient()

      // Récupérer le client_id avant de déprogrammer
      const { data: livData } = await supabase
        .from('livraisons')
        .select('client_id')
        .eq('id', livraisonId)
        .single()

      await supabase
        .from('livraisons')
        .update({
          creneau_date: null,
          creneau_heure_debut: null,
          creneau_heure_fin: null,
          statut: 'a_livrer',
          livreur_id: null,
        })
        .eq('id', livraisonId)

      // Réverter le statut client → a_livrer
      if (livData?.client_id) {
        await supabase
          .from('clients')
          .update({
            statut_commercial: 'a_livrer',
            date_statut: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', livData.client_id)
      }

      loadPlanningData()
    } catch (err) {
      console.error('Erreur suppression créneau:', err)
      alert('Erreur lors de la suppression')
    } finally {
      setRemovingLivraisonId(null)
    }
  }

  const handleSendMailPlanning = async (livraisonIds: string[]) => {
    if (livraisonIds.length === 0) return
    setSendingMailPlanning(true)
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
      setSendingMailPlanning(false)
    }
  }

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
      return total + (l.client?.velo_devis || 0)
    }, 0)
  }

  // Send formulaire livraison
  async function handleSendFormulaire(clientId: string) {
    if (sendingFormulaire) return
    setSendingFormulaire(clientId)
    try {
      const res = await fetch('/api/admin/clients/send-formulaire-livraison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`Erreur : ${err.error || 'Envoi échoué'}`)
      } else {
        alert('Formulaire de livraison envoyé avec succès')
        loadPlanningData()
      }
    } catch (err) {
      console.error('Erreur envoi formulaire:', err)
      alert('Erreur lors de l\'envoi')
    } finally {
      setSendingFormulaire(null)
    }
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
    ? filteredLivraisons.filter(
        l =>
          l.creneau_date === selectedCreneau.date &&
          l.creneau_heure_debut?.slice(0, 5) === selectedCreneau.heure_debut
      )
    : []

  const creneauVelos = creneauLivraisons.reduce(
    (sum, l) => sum + (l.client?.velo_devis || 0),
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

      {/* Search bar with dropdown */}
      <div className="relative max-w-md" ref={searchContainerRef}>
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
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <Select value={selectedDepotId} onValueChange={setSelectedDepotId}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Sélectionner un dépôt" />
                    </SelectTrigger>
                    <SelectContent>
                      {depots.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nom} ({d.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {livreurs.length > 0 && (
                    <Select value={selectedLivreurId} onValueChange={setSelectedLivreurId}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Choisir un livreur" />
                      </SelectTrigger>
                      <SelectContent>
                        {livreurs.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.prenom} {l.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {livreurs.length > 0 && !selectedLivreurId && (
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
                  creneaux={depot?.creneaux || []}
                  isOpen={isDayOpen(selectedDate)}
                  isToday={isSameDay(selectedDate, today)}
                  canAddClient={!!selectedLivreurId}
                  onAddClient={(creneauHeure) => openPlacement(formatDate(selectedDate), creneauHeure)}
                  onRemoveLivraison={handleRemoveLivraison}
                  removingLivraisonId={removingLivraisonId}
                  onSelectCreneau={(date, heure_debut, heure_fin, capacite) =>
                    setSelectedCreneau({ date, heure_debut, heure_fin, capacite })
                  }
                  selectedCreneau={selectedCreneau}
                  onSendMailPlanning={handleSendMailPlanning}
                  sendingMailPlanning={sendingMailPlanning}
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
                  creneaux={depot?.creneaux || []}
                  capaciteJour={depot?.capacite_velos_jour || 0}
                  getLivraisonsForDay={getLivraisonsForDay}
                  getVelosForDay={getVelosForDay}
                  isDayOpen={isDayOpen}
                  onDayClick={goToDay}
                  canAddClient={!!selectedLivreurId}
                  onAddClient={(day, creneauHeure) => openPlacement(formatDate(day), creneauHeure)}
                  onRemoveLivraison={handleRemoveLivraison}
                  removingLivraisonId={removingLivraisonId}
                  onSelectCreneau={(date, heure_debut, heure_fin, capacite) =>
                    setSelectedCreneau({ date, heure_debut, heure_fin, capacite })
                  }
                  selectedCreneau={selectedCreneau}
                  onSendMailPlanning={handleSendMailPlanning}
                  sendingMailPlanning={sendingMailPlanning}
                />
              ) : (
                /* Week view */
                <WeekView
                  weekDays={weekDays}
                  today={today}
                  creneaux={depot?.creneaux || []}
                  capaciteJour={depot?.capacite_velos_jour || 0}
                  getLivraisonsForDay={getLivraisonsForDay}
                  getVelosForDay={getVelosForDay}
                  isDayOpen={isDayOpen}
                  onDayClick={goToDay}
                  canAddClient={!!selectedLivreurId}
                  onAddClient={(day, creneauHeure) => openPlacement(formatDate(day), creneauHeure)}
                  onRemoveLivraison={handleRemoveLivraison}
                  removingLivraisonId={removingLivraisonId}
                  onSelectCreneau={(date, heure_debut, heure_fin, capacite) =>
                    setSelectedCreneau({ date, heure_debut, heure_fin, capacite })
                  }
                  selectedCreneau={selectedCreneau}
                  onSendMailPlanning={handleSendMailPlanning}
                  sendingMailPlanning={sendingMailPlanning}
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
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {selectedCreneau.heure_debut}
                          {selectedCreneau.heure_fin ? ` – ${selectedCreneau.heure_fin}` : ''}
                        </span>
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

                  {/* Mail planning button */}
                  {creneauLivraisons.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => handleSendMailPlanning(creneauLivraisons.map(l => l.id))}
                        disabled={sendingMailPlanning}
                      >
                        {sendingMailPlanning ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Mail className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Mail planning ({creneauLivraisons.length})
                      </Button>
                    </div>
                  )}
                  {mailPlanningMessage && (
                    <p className={`text-xs font-medium px-2 py-1 rounded ${mailPlanningMessage.isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {mailPlanningMessage.text}
                    </p>
                  )}

                  {/* Client list */}
                  {creneauLivraisons.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Aucun client dans ce créneau
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {creneauLivraisons.map((livraison) => {
                        const client = livraison.client
                        const nbVelos = client?.velo_devis || 0
                        return (
                          <div
                            key={livraison.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-white hover:bg-gray-50 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {client?.raison_sociale || 'Client inconnu'}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span className="flex items-center gap-0.5">
                                  <Bike className="h-3 w-3" />
                                  {nbVelos} vélo{nbVelos > 1 ? 's' : ''}
                                </span>
                                {client?.telephone && (
                                  <span>{client.telephone}</span>
                                )}
                              </div>
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
                              <a
                                href={`/admin/livraisons/deliver?id=${livraison.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-7 h-7 rounded flex items-center justify-center text-green-600 hover:bg-green-50 transition-colors"
                                title="Démarrer la livraison"
                              >
                                <Truck className="h-3.5 w-3.5" />
                              </a>
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
              {selectedLivreurId && livreurs.length > 0 && (
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
                        {client.velo_devis || client.velo_valide || '?'} vélo(s)
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Livraison card sub-component
// ---------------------------------------------------------------------------

function LivraisonCard({
  livraison,
  expanded,
  onRemove,
  removing,
}: {
  livraison: PlanningLivraison
  expanded?: boolean
  onRemove?: (id: string) => void
  removing?: boolean
}) {
  const clientName = livraison.client?.raison_sociale || 'Client inconnu'
  const nbVelos = livraison.client?.velo_devis || 0
  const heureDebut = livraison.creneau_heure_debut
    ? livraison.creneau_heure_debut.slice(0, 5)
    : null
  const heureFin = livraison.creneau_heure_fin
    ? livraison.creneau_heure_fin.slice(0, 5)
    : null

  if (expanded) {
    return (
      <div className="relative group">
        <Link
          href={livraison.client_id ? `/admin/clients/${livraison.client_id}` : '#'}
          className="block"
        >
          <div className="border rounded-lg p-3 hover:bg-gray-50 transition-colors cursor-pointer space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold flex-1">{clientName}</span>
              <Badge
                variant="secondary"
                className={`text-xs px-2 py-0.5 shrink-0 ${getStatutColor(livraison.statut)}`}
              >
                {getStatutLabel(livraison.statut)}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-600">
              {heureDebut && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {heureDebut}{heureFin ? ` - ${heureFin}` : ''}
                </span>
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
            {livraison.adresse_livraison_ligne1 && (
              <p className="text-xs text-gray-500 flex items-start gap-1">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {[livraison.adresse_livraison_ligne1, livraison.adresse_livraison_cp, livraison.adresse_livraison_ville].filter(Boolean).join(', ')}
              </p>
            )}
            {livraison.notes_admin && (
              <p className="text-xs text-gray-400 italic line-clamp-2">{livraison.notes_admin}</p>
            )}
          </div>
        </Link>
        {onRemove && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(livraison.id) }}
            disabled={removing}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center text-xs font-bold leading-none"
            title="Retirer du planning"
          >
            {removing ? '…' : '×'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative group">
      <Link
        href={livraison.client_id ? `/admin/clients/${livraison.client_id}` : '#'}
        className="block"
      >
        <div className="border rounded p-1 hover:bg-gray-50 transition-colors cursor-pointer">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <div className={`w-2 h-2 rounded-full shrink-0 ${getStatutColor(livraison.statut).split(' ')[0].replace('text-', 'bg-')}`} />
            <Bike className="h-2.5 w-2.5" />
            <span>{nbVelos}</span>
            {heureDebut && (
              <span className="text-gray-400">{heureDebut}</span>
            )}
          </div>
        </div>
      </Link>
      {onRemove && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(livraison.id) }}
          disabled={removing}
          className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center text-[10px] font-bold leading-none"
          title="Retirer du planning"
        >
          {removing ? '…' : '×'}
        </button>
      )}
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
  sendingMailPlanning,
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
  onSendMailPlanning?: (livraisonIds: string[]) => void
  sendingMailPlanning?: boolean
}) {
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

  return (
    <div className="space-y-4">
      {/* Mail planning button for the day */}
      {livraisons.length > 0 && onSendMailPlanning && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSendMailPlanning(livraisons.map(l => l.id))}
            disabled={sendingMailPlanning}
            className="text-xs"
          >
            {sendingMailPlanning ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5 mr-1.5" />
            )}
            Mail planning ({livraisons.length} client{livraisons.length > 1 ? 's' : ''})
          </Button>
        </div>
      )}

      {hasCreneaux ? (
        /* Créneau blocks */
        <div className="space-y-3">
          {creneaux.map((c) => {
            const slotLivraisons = getLivraisonsForCreneau(c)
            const slotVelos = slotLivraisons.reduce((sum, l) => sum + (l.client?.velo_devis || 0), 0)
            const slotRatio = c.capacite_velos > 0 ? slotVelos / c.capacite_velos : 0
            const isFull = slotVelos >= c.capacite_velos
            const isSelected =
              selectedCreneau?.date === dateStr &&
              selectedCreneau?.heure_debut === c.heure_debut.slice(0, 5)

            return (
              <div
                key={c.heure_debut}
                onClick={() => onSelectCreneau(dateStr, c.heure_debut.slice(0, 5), c.heure_fin.slice(0, 5), c.capacite_velos)}
                className={`border-2 rounded-xl overflow-hidden cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-200'
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
                      <Clock className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-700">
                        {c.heure_debut.slice(0, 5)} – {c.heure_fin.slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Bike className="h-4 w-4 text-gray-500" />
                      <span className={`text-sm font-medium ${isFull ? 'text-red-600' : 'text-gray-600'}`}>
                        {slotVelos}/{c.capacite_velos} vélos
                      </span>
                    </div>
                    {/* Mini fill bar */}
                    <div className="w-20 bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          slotRatio > 0.9 ? 'bg-red-500' : slotRatio > 0.7 ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, slotRatio * 100)}%` }}
                      />
                    </div>
                  </div>
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

                {/* Livraisons in this créneau */}
                <div className="p-3 space-y-2">
                  {slotLivraisons.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-2 italic">
                      Aucune livraison dans ce créneau
                    </p>
                  ) : (
                    slotLivraisons.map((livraison) => (
                      <LivraisonCard
                        key={livraison.id}
                        livraison={livraison}
                        expanded
                        onRemove={onRemoveLivraison}
                        removing={removingLivraisonId === livraison.id}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {/* Unassigned livraisons */}
          {unassigned.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-600">Autres (sans créneau)</span>
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
                  <LivraisonCard
                    key={livraison.id}
                    livraison={livraison}
                    expanded
                    onRemove={onRemoveLivraison}
                    removing={removingLivraisonId === livraison.id}
                  />
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
                .sort((a, b) => (a.creneau_heure_debut || '99:99').localeCompare(b.creneau_heure_debut || '99:99'))
                .map((livraison) => (
                  <LivraisonCard
                    key={livraison.id}
                    livraison={livraison}
                    expanded
                    onRemove={onRemoveLivraison}
                    removing={removingLivraisonId === livraison.id}
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
  sendingMailPlanning,
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
  onSendMailPlanning?: (livraisonIds: string[]) => void
  sendingMailPlanning?: boolean
}) {
  const hasCreneaux = creneaux.length > 0
  const numDays = weekDays.length

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

        return (
          <div
            key={formatDate(day)}
            className={`
              border rounded-lg overflow-hidden flex flex-col min-h-[400px]
              ${isToday ? 'border-blue-500 border-2' : 'border-gray-200'}
              ${!open ? 'bg-gray-50' : 'bg-white'}
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
            {open && dayLivraisons.length > 0 && onSendMailPlanning && (
              <div className="px-1 py-1 border-b bg-gray-50 flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); onSendMailPlanning(dayLivraisons.map(l => l.id)) }}
                  disabled={sendingMailPlanning}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                  title={`Envoyer mail planning à ${dayLivraisons.length} client(s)`}
                >
                  {sendingMailPlanning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Mail className="h-3 w-3" />
                  )}
                  <span>{dayLivraisons.length}</span>
                </button>
              </div>
            )}

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
                      const slotVelos = slotLivraisons.reduce((sum, l) => sum + (l.client?.velo_devis || 0), 0)
                      const slotRatio = c.capacite_velos > 0 ? slotVelos / c.capacite_velos : 0
                      const isFull = slotVelos >= c.capacite_velos
                      const isSelected =
                        selectedCreneau?.date === dateStr &&
                        selectedCreneau?.heure_debut === c.heure_debut.slice(0, 5)

                      return (
                        <div
                          key={c.heure_debut}
                          onClick={() => onSelectCreneau(dateStr, c.heure_debut.slice(0, 5), c.heure_fin.slice(0, 5), c.capacite_velos)}
                          className={`rounded-lg border overflow-hidden cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-1 ring-blue-300 bg-blue-50/40'
                              : isFull
                                ? 'border-red-200 bg-red-50/40 hover:border-red-300'
                                : slotRatio > 0
                                  ? 'border-blue-200 bg-blue-50/40 hover:border-blue-300'
                                  : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                          }`}
                        >
                          {/* Créneau bar header */}
                          <div className="flex items-center justify-between px-1.5 py-1 gap-1">
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-semibold text-gray-700 leading-tight">
                                {c.heure_debut.slice(0, 5)}-{c.heure_fin.slice(0, 5)}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <div className="flex-1 bg-gray-200 rounded-full h-1">
                                  <div
                                    className={`h-1 rounded-full ${
                                      slotRatio > 0.9 ? 'bg-red-500' : slotRatio > 0.7 ? 'bg-amber-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min(100, slotRatio * 100)}%` }}
                                  />
                                </div>
                                <span className={`text-[9px] shrink-0 ${isFull ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                  {slotVelos}/{c.capacite_velos}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); onAddClient(day, c.heure_debut) }}
                              disabled={isFull || !canAddClient}
                              className={`shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold transition-colors ${
                                isFull || !canAddClient
                                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                              }`}
                              title={!canAddClient ? 'Sélectionnez un livreur pour planifier' : `Ajouter dans ${c.heure_debut.slice(0, 5)}-${c.heure_fin.slice(0, 5)}`}
                            >
                              +
                            </button>
                          </div>

                          {/* Résumé compact — pas de cartes individuelles */}
                        </div>
                      )
                    })}

                    {/* Livraisons non assignées — compteur simple */}
                    {(() => {
                      const assignedIds = new Set(
                        creneaux.flatMap((c) => getLivraisonsForCreneau(c).map((l) => l.id))
                      )
                      const unassigned = dayLivraisons.filter((l) => !assignedIds.has(l.id))
                      return unassigned.length > 0 ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-1.5 py-1 flex items-center gap-1.5">
                          <Bike className="h-3 w-3 text-amber-600" />
                          <span className="text-[10px] text-amber-700">{unassigned.length} hors créneau</span>
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
