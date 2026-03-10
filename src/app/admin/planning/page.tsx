'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Loader2, ChevronLeft, ChevronRight, Calendar, Truck, Users,
  BarChart3, Send, MapPin, Bike, Clock, Phone, Info, Pencil, Check, X as XIcon,
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
  created_at: string
  client: PlanningClient | null
}

interface DepotFull {
  id: string
  nom: string
  type: string
  jours_ouverture: string[] | null
  capacite_velos_jour: number | null
  creneau_duree_minutes: number | null
}

// ---------------------------------------------------------------------------
// Types for view modes
// ---------------------------------------------------------------------------

type ViewMode = 'jour' | 'semaine' | 'mois'

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
  return d.toISOString().split('T')[0]
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
  programmee: 'bg-blue-100 text-blue-800',
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

export default function PlanningPage() {
  const adminUser = useAdminUser()

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
  const [miniCalOpen, setMiniCalOpen] = useState(false)

  // Week days array (Mon-Sun)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  // Compute data range based on view mode
  const dataRange = useMemo(() => {
    if (viewMode === 'jour') {
      return { start: selectedDate, end: selectedDate }
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

  // Load depots on mount
  useEffect(() => {
    async function loadDepots() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('depots')
          .select('id, nom, type, jours_ouverture, capacite_velos_jour, creneau_duree_minutes, actif')
          .eq('actif', true)
          .order('nom')

        const depotList = (data || []) as DepotOption[]
        setDepots(depotList)

        // Auto-select: prefer user's depot, otherwise first depot
        if (depotList.length > 0) {
          const userDepotIds = adminUser.depot_ids || []
          const matchingDepot = depotList.find((d) => userDepotIds.includes(d.id))
          setSelectedDepotId(matchingDepot ? matchingDepot.id : depotList[0].id)
        }
      } catch (err) {
        console.error('Erreur chargement dépôts:', err)
      } finally {
        setLoading(false)
      }
    }
    loadDepots()
  }, [adminUser.depot_ids])

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
    } else if (viewMode === 'semaine') {
      setWeekStart((prev) => addDays(prev, -7))
    } else {
      setSelectedDate((prev) => addMonths(prev, -1))
    }
  }
  const goToNext = () => {
    if (viewMode === 'jour') {
      setSelectedDate((prev) => addDays(prev, 1))
    } else if (viewMode === 'semaine') {
      setWeekStart((prev) => addDays(prev, 7))
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

  // Switch to day view for a specific date (used by mini calendar + month view)
  const goToDay = (d: Date) => {
    setSelectedDate(d)
    setWeekStart(getMonday(d))
    setMiniCalMonth(getFirstOfMonth(d))
    setViewMode('jour')
  }

  // Keep weekStart in sync when selectedDate changes in semaine mode
  const switchViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    if (mode === 'semaine') {
      setWeekStart(getMonday(selectedDate))
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
    return livraisons.filter((l) => l.creneau_date === dateStr)
  }

  // Count velos scheduled for a day
  function getVelosForDay(day: Date): number {
    const dayLivraisons = getLivraisonsForDay(day)
    return dayLivraisons.reduce((total, l) => {
      return total + (l.client?.velo_devis || 0)
    }, 0)
  }

  // Stats — adapt to view mode
  const statsLabel = viewMode === 'jour' ? 'ce jour' : viewMode === 'mois' ? 'ce mois' : 'cette semaine'
  const totalLivraisonsPeriode = livraisons.length
  const totalVelosPeriode = livraisons.reduce(
    (sum, l) => sum + (l.client?.velo_devis || 0),
    0
  )
  const capacitePeriode = useMemo(() => {
    if (!depot?.capacite_velos_jour) return 0
    if (viewMode === 'jour') {
      return isDayOpen(selectedDate) ? depot.capacite_velos_jour : 0
    } else if (viewMode === 'mois') {
      const first = getFirstOfMonth(selectedDate)
      const last = getLastOfMonth(selectedDate)
      let count = 0
      const d = new Date(first)
      while (d <= last) {
        if (isDayOpen(d)) count++
        d.setDate(d.getDate() + 1)
      }
      return count * depot.capacite_velos_jour
    }
    // semaine
    const joursOuverts = weekDays.filter((d) => isDayOpen(d)).length
    return joursOuverts * depot.capacite_velos_jour
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depot, weekDays, viewMode, selectedDate])

  const tauxUtilisation = capacitePeriode > 0
    ? Math.round((totalVelosPeriode / capacitePeriode) * 100)
    : 0

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

  // Get client address snippet
  function getAddressSnippet(client: PlanningClient): string {
    const addr = client.adresse_livraison_ligne1 || client.adresse_societe_ligne1
    const cp = client.adresse_livraison_cp || client.adresse_societe_cp
    const ville = client.adresse_livraison_ville || client.adresse_societe_ville
    const parts = [addr, cp, ville].filter(Boolean)
    return parts.join(', ') || 'Adresse non renseignée'
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          Planning livraisons
        </h1>

        <Select value={selectedDepotId} onValueChange={setSelectedDepotId}>
          <SelectTrigger className="w-full sm:w-[280px]">
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
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-blue-100">
              <Truck className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Livraisons {statsLabel}</p>
              <p className="text-xl font-bold">{totalLivraisonsPeriode}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-amber-100">
              <BarChart3 className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Capacité utilisée</p>
              <p className="text-xl font-bold">
                {tauxUtilisation}%
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  ({totalVelosPeriode}/{capacitePeriode} vélos)
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-orange-100">
              <Users className="h-5 w-5 text-orange-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clients en attente</p>
              <p className="text-xl font-bold">{clientsALivrer.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main layout: Calendar + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar week view */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Title — adapts to view mode */}
                <CardTitle className="text-lg flex-1">
                  {viewMode === 'jour' && formatDateLong(selectedDate)}
                  {viewMode === 'semaine' && `Semaine du ${formatDateShort(weekStart)} au ${formatDateShort(weekEnd)}`}
                  {viewMode === 'mois' && `${MOIS_LABELS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`}
                </CardTitle>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* View mode toggle */}
                  <div className="inline-flex rounded-lg border overflow-hidden">
                    {(['jour', 'semaine', 'mois'] as ViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => switchViewMode(mode)}
                        className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                          viewMode === mode
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Navigation arrows */}
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={goToPrev}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToToday}>
                      Aujourd&apos;hui
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToNext}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Mini calendar toggle (mobile) */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="lg:hidden"
                    onClick={() => setMiniCalOpen(!miniCalOpen)}
                  >
                    <Calendar className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Mini calendar — mobile collapsible */}
              {miniCalOpen && (
                <div className="mt-3 lg:hidden">
                  <MiniCalendar
                    month={miniCalMonth}
                    selectedDate={selectedDate}
                    onSelectDay={goToDay}
                    onPrevMonth={() => setMiniCalMonth((m) => addMonths(m, -1))}
                    onNextMonth={() => setMiniCalMonth((m) => addMonths(m, 1))}
                  />
                </div>
              )}
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
                  isOpen={isDayOpen(selectedDate)}
                  isToday={isSameDay(selectedDate, today)}
                  onUpdateLivraison={(id, data) => {
                    setLivraisons(prev => prev.map(l => l.id === id ? { ...l, ...data } : l))
                  }}
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
              ) : (
                /* Week view (existing) */
                <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                  {weekDays.map((day) => {
                    const open = isDayOpen(day)
                    const dayLivraisons = getLivraisonsForDay(day)
                    const velosDay = getVelosForDay(day)
                    const capaciteJour = depot?.capacite_velos_jour || 0
                    const isToday = isSameDay(day, today)

                    return (
                      <div
                        key={formatDate(day)}
                        className={`
                          border rounded-lg overflow-hidden flex flex-col min-h-[180px] cursor-pointer
                          ${isToday ? 'border-blue-500 border-2' : 'border-gray-200'}
                          ${!open ? 'bg-gray-50' : 'bg-white'}
                        `}
                        onClick={() => goToDay(day)}
                      >
                        {/* Day header */}
                        <div
                          className={`
                            px-2 py-1.5 text-center border-b text-sm font-medium
                            ${isToday ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-700'}
                          `}
                        >
                          <div>{JOURS_LABELS[day.getDay()]}</div>
                          <div className="text-xs">{formatDateShort(day)}</div>
                        </div>

                        {!open ? (
                          /* Closed day */
                          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                            Fermé
                          </div>
                        ) : (
                          /* Open day content */
                          <div className="flex-1 flex flex-col">
                            {/* Capacity bar */}
                            {capaciteJour > 0 && (
                              <div className="px-2 py-1 border-b bg-gray-50">
                                <div className="flex items-center justify-between text-xs text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Bike className="h-3 w-3" />
                                    {velosDay}/{capaciteJour}
                                  </span>
                                  <span>
                                    {Math.round((velosDay / capaciteJour) * 100)}%
                                  </span>
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
                                    style={{
                                      width: `${Math.min(100, (velosDay / capaciteJour) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Livraisons list */}
                            <div className="flex-1 p-1 space-y-1 overflow-y-auto max-h-[300px]">
                              {dayLivraisons.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-3">
                                  Aucune livraison
                                </p>
                              ) : (
                                dayLivraisons.map((livraison) => (
                                  <LivraisonCard
                                    key={livraison.id}
                                    livraison={livraison}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel: Mini calendar + Clients a livrer */}
        <div className="w-full lg:w-[340px] shrink-0 space-y-4">
          {/* Mini calendar — desktop only */}
          <div className="hidden lg:block">
            <Card>
              <CardContent className="p-3">
                <MiniCalendar
                  month={miniCalMonth}
                  selectedDate={selectedDate}
                  onSelectDay={goToDay}
                  onPrevMonth={() => setMiniCalMonth((m) => addMonths(m, -1))}
                  onNextMonth={() => setMiniCalMonth((m) => addMonths(m, 1))}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Clients à planifier
                <Badge variant="secondary" className="ml-auto">
                  {clientsALivrer.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : clientsALivrer.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Aucun client en attente de planification
                </p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {clientsALivrer.map((client) => (
                    <div
                      key={client.id}
                      className="border rounded-lg p-3 space-y-2 hover:border-gray-400 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="font-medium text-sm hover:underline text-blue-700 line-clamp-1"
                        >
                          {client.raison_sociale}
                        </Link>
                        <Badge variant="outline" className="shrink-0 text-xs">
                          <Bike className="h-3 w-3 mr-1" />
                          {client.velo_devis}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{getAddressSnippet(client)}</span>
                      </p>

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        disabled={sendingFormulaire === client.id}
                        onClick={() => handleSendFormulaire(client.id)}
                      >
                        {sendingFormulaire === client.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Send className="h-3 w-3 mr-1" />
                        )}
                        Envoyer formulaire livraison
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Livraison card sub-component
// ---------------------------------------------------------------------------

function LivraisonCard({ livraison, expanded, onUpdate }: { livraison: PlanningLivraison; expanded?: boolean; onUpdate?: (id: string, data: Partial<PlanningLivraison>) => void }) {
  const clientName = livraison.client?.raison_sociale || 'Client inconnu'
  const nbVelos = livraison.client?.velo_devis || 0
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
    e.preventDefault()
    e.stopPropagation()
    if (heureDebut && heureValue && heureValue < heureDebut) {
      alert(`L'heure doit être ≥ ${heureDebut}`)
      return
    }
    if (heureFin && heureValue && heureValue > heureFin) {
      alert(`L'heure doit être ≤ ${heureFin}`)
      return
    }
    setSavingHeure(true)
    try {
      const res = await fetch(`/api/admin/livraisons/${livraison.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heure_precise: heureValue || null }),
      })
      if (res.ok) {
        onUpdate?.(livraison.id, { heure_precise: heureValue || null })
        setEditingHeure(false)
      }
    } finally { setSavingHeure(false) }
  }

  const savePreferences = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!livraison.client) return
    setSavingPrefs(true)
    try {
      const res = await fetch(`/api/admin/clients/${livraison.client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences_livraison: prefsValue || null }),
      })
      if (res.ok) {
        onUpdate?.(livraison.id, { client: { ...livraison.client, preferences_livraison: prefsValue || null } })
        setEditingPrefs(false)
      }
    } finally { setSavingPrefs(false) }
  }

  if (expanded) {
    return (
      <div className="border rounded-lg p-3 hover:bg-gray-50 transition-colors space-y-2">
        <Link href={livraison.client_id ? `/admin/clients/${livraison.client_id}` : '#'}>
          <div className="flex items-center justify-between gap-2">
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
            <span className="flex items-center gap-1 text-blue-600 font-medium">
              → {livraison.heure_precise.slice(0, 5)}
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
        {/* Telephone */}
        {livraison.client?.telephone && (
          <a href={`tel:${livraison.client.telephone}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
            <Phone className="h-3.5 w-3.5" />
            {livraison.client.telephone}
          </a>
        )}
        {/* Adresse + complement */}
        {livraison.adresse_livraison_ligne1 && (
          <p className="text-xs text-gray-500 flex items-start gap-1">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {[livraison.adresse_livraison_ligne1, livraison.adresse_livraison_cp, livraison.adresse_livraison_ville].filter(Boolean).join(', ')}
          </p>
        )}
        {livraison.complement_adresse && (
          <p className="text-xs text-gray-500 ml-4 italic">{livraison.complement_adresse}</p>
        )}
        {/* Heure precise — inline edit */}
        <div className="flex items-center gap-2 text-xs" onClick={e => e.stopPropagation()}>
          {editingHeure ? (
            <>
              <input type="time" value={heureValue} onChange={e => setHeureValue(e.target.value)} className="border rounded px-1.5 py-0.5 text-xs w-24" />
              <button onClick={saveHeurePrecise} disabled={savingHeure} className="text-green-600 hover:text-green-700">
                {savingHeure ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); setEditingHeure(false) }} className="text-red-500">
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setHeureValue(livraison.heure_precise || ''); setEditingHeure(true) }} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {livraison.heure_precise ? `Heure: ${livraison.heure_precise.slice(0, 5)}` : 'Définir heure précise'}
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
        {/* Preferences client — inline edit */}
        <div className="text-xs" onClick={e => e.stopPropagation()}>
          {editingPrefs ? (
            <div className="flex gap-1">
              <textarea value={prefsValue} onChange={e => setPrefsValue(e.target.value)} className="flex-1 text-xs border rounded px-1.5 py-0.5 resize-none" rows={2} placeholder="Préférences..." />
              <div className="flex flex-col gap-0.5">
                <button onClick={savePreferences} disabled={savingPrefs} className="text-green-600">
                  {savingPrefs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditingPrefs(false) }} className="text-red-500">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            livraison.client?.preferences_livraison ? (
              <div className="flex items-start gap-1 text-blue-600 bg-blue-50 rounded px-2 py-1">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="flex-1">{livraison.client.preferences_livraison}</span>
                <button onClick={(e) => { e.stopPropagation(); setPrefsValue(livraison.client?.preferences_livraison || ''); setEditingPrefs(true) }} className="text-gray-400 hover:text-blue-600">
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); setPrefsValue(''); setEditingPrefs(true) }} className="text-gray-400 hover:text-blue-600 flex items-center gap-1">
                <Info className="h-3 w-3" /> Ajouter préférences <Pencil className="h-3 w-3" />
              </button>
            )
          )}
        </div>
        {livraison.notes_admin && (
          <p className="text-xs text-gray-400 italic line-clamp-2">{livraison.notes_admin}</p>
        )}
      </div>
    )
  }

  return (
    <Link
      href={livraison.client_id ? `/admin/clients/${livraison.client_id}` : '#'}
      className="block"
    >
      <div className="border rounded p-1.5 hover:bg-gray-50 transition-colors cursor-pointer space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-medium line-clamp-1 flex-1">
            {clientName}
          </span>
          <Badge
            variant="secondary"
            className={`text-[10px] px-1 py-0 shrink-0 ${getStatutColor(livraison.statut)}`}
          >
            {getStatutLabel(livraison.statut)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          {heureDebut && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {heureDebut}{heureFin ? `-${heureFin}` : ''}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Bike className="h-2.5 w-2.5" />
            {nbVelos} vélo{nbVelos > 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </Link>
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
  isOpen,
  isToday,
  onUpdateLivraison,
}: {
  day: Date
  livraisons: PlanningLivraison[]
  velosDay: number
  capaciteJour: number
  isOpen: boolean
  isToday: boolean
  onUpdateLivraison?: (id: string, data: Partial<PlanningLivraison>) => void
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

  // Sort livraisons by time
  const sorted = [...livraisons].sort((a, b) => {
    const ta = a.creneau_heure_debut || '99:99'
    const tb = b.creneau_heure_debut || '99:99'
    return ta.localeCompare(tb)
  })

  const ratio = capaciteJour > 0 ? velosDay / capaciteJour : 0

  return (
    <div className="space-y-4">
      {/* Day capacity summary */}
      {capaciteJour > 0 && (
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Bike className="h-5 w-5 text-gray-600" />
            <span className="text-sm font-medium">
              {velosDay} / {capaciteJour} vélos
            </span>
          </div>
          <div className="flex-1 bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${
                ratio > 0.9
                  ? 'bg-red-500'
                  : ratio > 0.7
                    ? 'bg-amber-500'
                    : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-600">
            {Math.round(ratio * 100)}%
          </span>
        </div>
      )}

      {/* Livraisons list */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Truck className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucune livraison programmée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((livraison) => (
            <LivraisonCard key={livraison.id} livraison={livraison} expanded onUpdate={onUpdateLivraison} />
          ))}
        </div>
      )}
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
