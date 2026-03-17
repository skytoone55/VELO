'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2, Search, Truck, MapPin, Calendar, Phone, RefreshCw,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Eye, X, Send, Mail, CheckCircle, ChevronDown, CalendarCheck, Copy,
  Download, RotateCcw, FileCheck,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { getTenantId, getTenantConfig } from '@/lib/tenants'
import { exportToXlsx } from '@/lib/export-xlsx'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { usePinnedFilters, PinFiltersButton } from '@/components/admin/pin-filters'
import {
  getCommercialName, getDepartementLabel,
  getStaticDepartementOptions, getStaticCommercialOptions,
} from '@/lib/tenants/commercial'

interface LivraisonRow {
  id: string
  client_id: string | null
  mode_livraison: string
  adresse_livraison_ligne1: string | null
  adresse_livraison_cp: string | null
  adresse_livraison_ville: string | null
  complement_adresse: string | null
  creneau_date: string | null
  creneau_heure_debut: string | null
  creneau_heure_fin: string | null
  date_programmation: string | null
  date_livraison: string | null
  statut: string | null
  confirmation_statut: string | null
  tournee_id: string | null
  depot_id: string | null
  created_at: string
  client: {
    id: string
    raison_sociale: string
    siret: string
    email: string | null
    email_beneficiaire: string | null
    telephone: string | null
    departement: string | null
    adresse_societe_cp: string | null
    monday_board_id: string | null
    statut_commercial: string | null
    velo_devis: number
    velo_valide: number | null
    type_de_zone: string | null
    depot_retrait_id: string | null
    depot_logistique_id: string | null
    reference_retina: string | null
    monday_item_id: string | null
    in_enemat?: boolean
  } | null
  cq_valide?: boolean
  depot: { id: string; nom: string } | null
}

const statutOptions = [
  { value: 'all', label: 'Statut' },
  { value: 'a_livrer', label: 'À livrer' },
  { value: 'programmee', label: 'Programmée' },
  { value: 'en_livraison', label: 'En livraison' },
  { value: 'livree', label: 'Livré' },
  { value: 'probleme_livraison', label: 'Problème livraison' },
  { value: 'a_relivrer', label: 'À relivrer' },
  { value: 'retrait_planifie', label: 'Retrait planifié' },
  { value: 'retrait_effectue', label: 'Retrait effectué' },
  { value: 'annulee', label: 'Annulé' },
  { value: 'refuse', label: 'Refusé' },
]

const statutColors: Record<string, string> = {
  a_livrer: 'bg-amber-100 text-amber-800',
  programmee: 'bg-blue-100 text-blue-800',
  en_livraison: 'bg-orange-100 text-orange-800',
  livree: 'bg-green-100 text-green-800',
  probleme_livraison: 'bg-red-100 text-red-800',
  a_relivrer: 'bg-pink-100 text-pink-800',
  retrait_planifie: 'bg-indigo-100 text-indigo-800',
  retrait_effectue: 'bg-teal-100 text-teal-800',
  annulee: 'bg-gray-100 text-gray-500',
  refuse: 'bg-slate-100 text-slate-600',
}

const statutLabels: Record<string, string> = {
  a_livrer: 'À livrer',
  programmee: 'Programmée',
  en_livraison: 'En livraison',
  livree: 'Livré',
  probleme_livraison: 'Problème livraison',
  a_relivrer: 'À relivrer',
  retrait_planifie: 'Retrait planifié',
  retrait_effectue: 'Retrait effectué',
  annulee: 'Annulé',
  refuse: 'Refusé',
}

function SortableHeader({ label, column, currentSort, currentOrder, onSort, className }: {
  label: string; column: string; currentSort: string; currentOrder: 'asc' | 'desc'; onSort: (col: string) => void; className?: string
}) {
  const isActive = currentSort === column
  return (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 ${className || ''}`} onClick={() => onSort(column)}>
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          currentOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  )
}

export default function AdminLivraisonsPage() {
  const tenantId = getTenantId()
  const adminUser = useAdminUser()
  const [livraisons, setLivraisons] = useState<LivraisonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState<string[]>([])
  const [depotFilter, setDepotFilter] = useState<string[]>([])
  const [commercialFilter, setCommercialFilter] = useState<string[]>([])
  const [departementFilter, setDepartementFilter] = useState<string[]>([])
  const [zoneFilter, setZoneFilter] = useState<string[]>([])
  const [controleFilter, setControleFilter] = useState<string[]>([])
  const [enematFilter, setEnematFilter] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState({ totalPages: 0, totalFiltered: 0, startIndex: 0, endIndex: 0 })

  const [selectedLivraisons, setSelectedLivraisons] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [mailLivraisonLoading, setMailLivraisonLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const bulkMessageTimerRef = useRef<NodeJS.Timeout>(null)

  // SAV reactivation
  const [reactivateTarget, setReactivateTarget] = useState<LivraisonRow | null>(null)
  const [reactivateComment, setReactivateComment] = useState('')
  const [reactivateLoading, setReactivateLoading] = useState(false)

  const handleReactivate = async () => {
    if (!reactivateTarget || !reactivateComment.trim()) return
    setReactivateLoading(true)
    try {
      const res = await fetch(`/api/admin/livraisons/${reactivateTarget.id}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: reactivateComment.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur')
      }
      toast.success('Dossier réactivé — il réapparaît dans le contrôle qualité')
      setReactivateTarget(null)
      setReactivateComment('')
      fetchLivraisons()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setReactivateLoading(false)
    }
  }

  // Export Excel
  const handleExport = () => {
    const tenant = getTenantConfig()
    const today = new Date().toISOString().slice(0, 10)
    exportToXlsx(livraisons, [
      { header: 'Raison sociale', accessor: r => r.client?.raison_sociale },
      { header: 'Réf. Retina', accessor: r => r.client?.reference_retina },
      { header: 'Contact nom', accessor: r => r.client?.contact_nom },
      { header: 'Contact prénom', accessor: r => r.client?.contact_prenom },
      { header: 'Téléphone', accessor: r => r.client?.telephone },
      { header: 'Adresse', accessor: r => r.adresse_livraison_ligne1 },
      { header: 'CP', accessor: r => r.adresse_livraison_cp },
      { header: 'Ville', accessor: r => r.adresse_livraison_ville },
      { header: 'Dépôt', accessor: r => r.depot?.nom },
      { header: 'Département', accessor: r => r.client?.departement },
      { header: 'Nb vélos', accessor: r => r.client?.velo_valide },
      { header: 'Date', accessor: r => r.creneau_date || r.date_livraison },
    ], `Export-Livraisons-${tenant.name}-${today}.xlsx`)
  }

  const showBulkMessage = (text: string, isError = false) => {
    if (bulkMessageTimerRef.current) clearTimeout(bulkMessageTimerRef.current)
    setBulkMessage({ text, isError })
    bulkMessageTimerRef.current = setTimeout(() => setBulkMessage(null), 5000)
  }

  // Filtres figés par utilisateur
  const { loadPinned, saveFilters, hasPinned } = usePinnedFilters(adminUser?.id, 'livraisons')
  const [isPinned, setIsPinned] = useState(false)
  const pinnedLoaded = useRef(false)
  const [filtersReady, setFiltersReady] = useState(false)

  useEffect(() => {
    if (pinnedLoaded.current) return
    pinnedLoaded.current = true
    const pinned = loadPinned()
    if (pinned) {
      setIsPinned(true)
      if (pinned.statut) setStatutFilter(pinned.statut)
      if (pinned.depot) setDepotFilter(pinned.depot)
      if (pinned.commercial) setCommercialFilter(pinned.commercial)
      if (pinned.departement) setDepartementFilter(Array.isArray(pinned.departement) ? pinned.departement : [pinned.departement])
      if (pinned.zone) setZoneFilter(pinned.zone)
      if (pinned.controle) setControleFilter(pinned.controle)
      if (pinned.enemat) setEnematFilter(pinned.enemat)
      if (pinned.pageSize) setPageSize(pinned.pageSize)
    }
    setFiltersReady(true)
  }, [loadPinned])

  const handlePinFilters = () => {
    saveFilters({
      statut: statutFilter,
      depot: depotFilter,
      commercial: commercialFilter,
      departement: departementFilter,
      zone: zoneFilter,
      controle: controleFilter,
      enemat: enematFilter,
      pageSize,
    })
    setIsPinned(true)
  }

  const [depotOptions, setDepotOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Dépôt' }])
  const [commercialOptions, setCommercialOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Commercial' }])
  const [deptOptions, setDeptOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Départements' }])

  // Load filter options
  useEffect(() => {
    // Depots — filtrer par depot_ids pour agent_secteur
    fetch('/api/depots').then(r => r.json()).then(data => {
      let depots: { id: string; nom: string }[] = Array.isArray(data) ? data : data.depots || []
      if (adminUser?.role === 'agent_secteur' && adminUser.depot_ids?.length) {
        depots = depots.filter(d => adminUser.depot_ids!.includes(d.id))
      }
      setDepotOptions([
        { value: 'all', label: 'Dépôt' },
        ...depots.map((d) => ({ value: d.id, label: d.nom }))
      ])
    }).catch(() => {})

    // Commercials
    const staticCom = getStaticCommercialOptions()
    if (staticCom) {
      setCommercialOptions([{ value: 'all', label: 'Commercial' }, ...staticCom])
    } else {
      fetch('/api/clients/commercials').then(r => r.json()).then((emails: string[]) => {
        if (Array.isArray(emails)) {
          setCommercialOptions([{ value: 'all', label: 'Commercial' }, ...emails.map(e => ({ value: e, label: e }))])
        }
      }).catch(() => {})
    }

    // Departements
    const staticDept = getStaticDepartementOptions()
    if (staticDept) {
      setDeptOptions([{ value: 'all', label: 'Départements' }, ...staticDept])
    } else {
      fetch('/api/clients/departements').then(r => r.json()).then((depts: { value: string; label: string }[]) => {
        if (Array.isArray(depts)) {
          setDeptOptions([{ value: 'all', label: 'Départements' }, ...depts])
        }
      }).catch(() => {})
    }
  }, [])

  const fetchLivraisons = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('pageSize', pageSize.toString())
      if (searchQuery) params.set('search', searchQuery)
      if (statutFilter.length > 0) params.set('statut', statutFilter.join(','))
      if (depotFilter.length > 0) params.set('depot', depotFilter.join(','))
      if (commercialFilter.length > 0) params.set('commercial', commercialFilter.join(','))
      if (departementFilter.length > 0) params.set('departement', departementFilter.join(','))
      if (zoneFilter.length > 0) params.set('zone', zoneFilter.join(','))
      if (controleFilter.length > 0) params.set('controle', controleFilter.join(','))
      if (enematFilter) params.set('enemat', enematFilter)
      if (sortBy !== 'created_at' || sortOrder !== 'desc') {
        params.set('sortBy', sortBy)
        params.set('sortOrder', sortOrder)
      }

      const res = await fetch(`/api/livraisons?${params.toString()}`)
      const data = await res.json()

      if (!res.ok) {
        console.error('Erreur API livraisons:', data.error || res.status)
      }

      setLivraisons(data.livraisons || [])
      setPagination(data.pagination || { totalPages: 0, totalFiltered: 0, startIndex: 0, endIndex: 0 })
    } catch (err) {
      console.error('Erreur chargement livraisons:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchQuery, statutFilter, depotFilter, commercialFilter, departementFilter, zoneFilter, controleFilter, enematFilter, sortBy, sortOrder])

  // Debounce search
  const searchTimerRef = useRef<NodeJS.Timeout>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchQuery])

  // Filter change = reset to page 1
  const prevFilters = useRef({
    statutFilter: statutFilter.join(','),
    depotFilter: depotFilter.join(','),
    commercialFilter: commercialFilter.join(','),
    departementFilter: departementFilter.join(','),
    zoneFilter: zoneFilter.join(','),
    controleFilter: controleFilter.join(','),
    sortBy,
    sortOrder,
  })
  useEffect(() => {
    const prev = prevFilters.current
    const cur = {
      statutFilter: statutFilter.join(','),
      depotFilter: depotFilter.join(','),
      commercialFilter: commercialFilter.join(','),
      departementFilter: departementFilter.join(','),
      zoneFilter: zoneFilter.join(','),
      controleFilter: controleFilter.join(','),
      sortBy,
      sortOrder,
    }
    if (
      prev.statutFilter !== cur.statutFilter || prev.depotFilter !== cur.depotFilter ||
      prev.commercialFilter !== cur.commercialFilter || prev.departementFilter !== cur.departementFilter ||
      prev.zoneFilter !== cur.zoneFilter || prev.controleFilter !== cur.controleFilter ||
      prev.sortBy !== cur.sortBy || prev.sortOrder !== cur.sortOrder
    ) {
      setPage(1)
      prevFilters.current = cur
    }
  }, [statutFilter, depotFilter, commercialFilter, departementFilter, zoneFilter, controleFilter, sortBy, sortOrder])

  useEffect(() => {
    if (!filtersReady) return
    fetchLivraisons()
  }, [fetchLivraisons, debouncedSearch, filtersReady])

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const resetFilters = () => {
    setSearchQuery('')
    setStatutFilter([])
    setDepotFilter([])
    setCommercialFilter([])
    setDepartementFilter([])
    setZoneFilter([])
    setControleFilter([])
    setEnematFilter('')
    setSortBy('created_at')
    setSortOrder('desc')
    setPage(1)
  }

  const hasActiveFilters = searchQuery || statutFilter.length > 0 || depotFilter.length > 0 ||
    commercialFilter.length > 0 || departementFilter.length > 0 || zoneFilter.length > 0 || controleFilter.length > 0 || !!enematFilter

  const handleToggleSelect = (livraisonId: string) => {
    const newSelected = new Set(selectedLivraisons)
    if (newSelected.has(livraisonId)) {
      newSelected.delete(livraisonId)
    } else {
      newSelected.add(livraisonId)
    }
    setSelectedLivraisons(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedLivraisons.size === livraisons.length) {
      setSelectedLivraisons(new Set())
    } else {
      setSelectedLivraisons(new Set(livraisons.map(l => l.id)))
    }
  }

  const handleClearSelection = () => setSelectedLivraisons(new Set())

  const handleBulkAction = async (action: string, params?: Record<string, string>) => {
    if (selectedLivraisons.size === 0) return
    setBulkActionLoading(true)
    try {
      const clientIds = livraisons
        .filter(l => selectedLivraisons.has(l.id) && l.client_id)
        .map(l => l.client_id!)

      if (action === 'send_formulaire_retrait') {
        let successCount = 0
        let errorCount = 0
        for (const cId of clientIds) {
          try {
            const res = await fetch('/api/admin/clients/send-formulaire-livraison', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId: cId }),
            })
            if (res.ok) successCount++
            else errorCount++
          } catch { errorCount++ }
        }
        showBulkMessage(
          `Formulaire retrait envoyé : ${successCount} succès${errorCount > 0 ? `, ${errorCount} erreur(s)` : ''}`,
          errorCount > 0,
        )
      } else if (action === 'send_mail_livraison') {
        setMailLivraisonLoading(true)
        let successCount = 0
        let errorCount = 0
        for (const livId of Array.from(selectedLivraisons)) {
          const liv = livraisons.find(l => l.id === livId)
          if (!liv?.client) continue
          try {
            const res = await fetch('/api/admin/livraisons/send-mail-livraison', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId: liv.client.id }),
            })
            if (res.ok) successCount++
            else errorCount++
          } catch {
            errorCount++
          }
        }
        setMailLivraisonLoading(false)
        showBulkMessage(
          errorCount === 0
            ? `Mail livraison envoyé à ${successCount} client${successCount > 1 ? 's' : ''}`
            : `${successCount} envoyé${successCount > 1 ? 's' : ''}, ${errorCount} erreur${errorCount > 1 ? 's' : ''}`,
          errorCount > 0,
        )
      } else if (action === 'send_mail_planning') {
        const livIds = Array.from(selectedLivraisons)
        try {
          const res = await fetch('/api/admin/livraisons/send-mail-planning', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ livraisonIds: livIds }),
          })
          if (!res.ok) {
            showBulkMessage(`Erreur serveur (${res.status})`, true)
          } else {
            const data = await res.json()
            showBulkMessage(
              data.errors === 0
                ? `Mail planning envoyé à ${data.sent} client${data.sent > 1 ? 's' : ''}`
                : `${data.sent} envoyé${data.sent > 1 ? 's' : ''}, ${data.errors} erreur${data.errors > 1 ? 's' : ''}`,
              data.errors > 0,
            )
          }
        } catch {
          showBulkMessage('Erreur lors de l\'envoi des mails planning', true)
        }
      }
      if (action === 'enter_enemat') {
        try {
          const res = await fetch('/api/admin/enemat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_ids: clientIds }),
          })
          if (!res.ok) {
            const err = await res.json()
            showBulkMessage(err.error || 'Erreur', true)
          } else {
            const data = await res.json()
            showBulkMessage(`${data.count} client${data.count > 1 ? 's' : ''} bascule${data.count > 1 ? 's' : ''} vers ENEMAT`)
          }
        } catch {
          showBulkMessage('Erreur lors du basculement ENEMAT', true)
        }
      }
      if (action !== 'send_formulaire_retrait' && action !== 'send_mail_livraison') {
        setSelectedLivraisons(new Set())
        fetchLivraisons()
      }
    } catch (err) {
      console.error('Erreur bulk action:', err)
    } finally {
      setBulkActionLoading(false)
    }
  }

  // Computed helpers for bulk action button states
  const selectedLivraisonsData = livraisons.filter(l => selectedLivraisons.has(l.id))

  // "Formulaire retrait" — enabled only if ALL selected clients have depot_retrait_id (retrait clients)
  const canSendFormulaireRetrait = selectedLivraisonsData.length > 0 &&
    selectedLivraisonsData.every(l => l.client?.depot_retrait_id)

  // "Mail livraison" — enabled only if ALL selected clients do NOT have depot_retrait_id (domicile/logistique)
  const canSendMailLivraison = selectedLivraisonsData.length > 0 &&
    selectedLivraisonsData.every(l => !l.client?.depot_retrait_id)

  // "Mail planning" — enabled only if ALL selected livraisons have statut 'en_livraison' (= programmé)
  const canSendMailPlanning = selectedLivraisonsData.length > 0 &&
    selectedLivraisonsData.every(l => l.statut === 'en_livraison')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Livraisons</h1>
        <Button variant="outline" size="sm" onClick={fetchLivraisons} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Stats inline */}
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold">{pagination.totalFiltered} <span className="text-muted-foreground font-normal">livraisons</span></span>
        <span className="text-muted-foreground">—</span>
        <span className="font-semibold text-blue-600">{(pagination as any).velosValidesFiltered ?? 0} <span className="text-muted-foreground font-normal">vélos validés</span></span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[140px] flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            className="pl-8 h-8 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {/* Statut multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Statut {statutFilter.length > 0 && `(${statutFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            <div className="max-h-60 overflow-y-auto">
              {statutOptions.filter(o => o.value !== 'all').map(o => (
                <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                  <input
                    type="checkbox"
                    checked={statutFilter.includes(o.value)}
                    onChange={(e) => {
                      setStatutFilter(prev =>
                        e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                      )
                    }}
                    className="rounded border-gray-300"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {statutFilter.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setStatutFilter([])}>
                Effacer
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {/* Dépôt multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Dépôt {depotFilter.length > 0 && `(${depotFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="max-h-60 overflow-y-auto">
              {depotOptions.filter(o => o.value !== 'all').map(o => (
                <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                  <input
                    type="checkbox"
                    checked={depotFilter.includes(o.value)}
                    onChange={(e) => {
                      setDepotFilter(prev =>
                        e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                      )
                    }}
                    className="rounded border-gray-300"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {depotFilter.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setDepotFilter([])}>
                Effacer
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {/* Commercial multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Commercial {commercialFilter.length > 0 && `(${commercialFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            <div className="max-h-60 overflow-y-auto">
              {commercialOptions.filter(o => o.value !== 'all').map(o => (
                <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                  <input
                    type="checkbox"
                    checked={commercialFilter.includes(o.value)}
                    onChange={(e) => {
                      setCommercialFilter(prev =>
                        e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                      )
                    }}
                    className="rounded border-gray-300"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {commercialFilter.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setCommercialFilter([])}>
                Effacer
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {/* Département multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Département {departementFilter.length > 0 && `(${departementFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            <div className="max-h-60 overflow-y-auto">
              {deptOptions.filter(o => o.value !== 'all').map(o => (
                <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                  <input
                    type="checkbox"
                    checked={departementFilter.includes(o.value)}
                    onChange={(e) => {
                      setDepartementFilter(prev =>
                        e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                      )
                    }}
                    className="rounded border-gray-300"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {departementFilter.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setDepartementFilter([])}>
                Effacer
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {/* Zone multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Zone {zoneFilter.length > 0 && `(${zoneFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="start">
            {[{ value: 'dans_la_zone', label: 'En zone' }, { value: 'hors_zone', label: 'Hors zone' }].map(o => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                <input
                  type="checkbox"
                  checked={zoneFilter.includes(o.value)}
                  onChange={(e) => {
                    setZoneFilter(prev =>
                      e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                    )
                  }}
                  className="rounded border-gray-300"
                />
                {o.label}
              </label>
            ))}
            {zoneFilter.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setZoneFilter([])}>
                Effacer
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {/* Controle filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={controleFilter.length > 0 ? 'default' : 'outline'} size="sm" className="h-8 text-xs px-2 shrink-0">
              CQ {controleFilter.length > 0 && `(${controleFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="start">
            {[{ value: 'ok', label: 'CQ Validé' }, { value: 'en_cours', label: 'CQ En cours' }, { value: 'attente', label: 'En attente' }].map(o => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                <input
                  type="checkbox"
                  checked={controleFilter.includes(o.value)}
                  onChange={(e) => {
                    setControleFilter(prev =>
                      e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                    )
                  }}
                  className="rounded border-gray-300"
                />
                {o.label}
              </label>
            ))}
            {controleFilter.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setControleFilter([])}>
                Effacer
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {/* ENEMAT filter */}
        <Select value={enematFilter || 'all'} onValueChange={(v) => { setEnematFilter(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className={`h-8 w-[90px] text-xs px-2 shrink-0 ${enematFilter ? 'bg-violet-100 text-violet-800 border-violet-300' : ''}`}>
            <SelectValue placeholder="ENEMAT" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ENEMAT</SelectItem>
            <SelectItem value="oui">Oui</SelectItem>
            <SelectItem value="non">Non</SelectItem>
          </SelectContent>
        </Select>
        {/* PageSize selector */}
        <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
          <SelectTrigger className="h-8 w-[52px] text-xs px-2 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 50, 100, 200, 500].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs text-muted-foreground px-2">
            Réinitialiser
          </Button>
        )}
        <PinFiltersButton onPin={handlePinFilters} isPinned={isPinned} />

        {adminUser?.role !== 'livreur' && (
          <Button variant="outline" size="sm" onClick={handleExport} disabled={livraisons.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12" />
          ) : livraisons.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucune livraison</h3>
              <p className="text-muted-foreground text-sm">
                {hasActiveFilters ? 'Aucune livraison ne correspond aux filtres' : 'Les livraisons apparaitront ici'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={livraisons.length > 0 && selectedLivraisons.size === livraisons.length}
                      onCheckedChange={handleSelectAll}
                      aria-label="Tout sélectionner"
                    />
                  </TableHead>
                  <SortableHeader label="Société" column="created_at" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Réf. Retina" column="reference_retina" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden xl:table-cell" />
                  <SortableHeader label="Tél." column="telephone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden xl:table-cell" />
                  <SortableHeader label="Commercial" column="commercial" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
                  <SortableHeader label="Dép." column="departement" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="Zone" column="zone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="Dépôt" column="depot" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="Mode" column="mode_livraison" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="Adresse" column="adresse" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
                  <SortableHeader label="Vélos" column="velos" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell w-14 text-center" />
                  <SortableHeader label="Date prévue" column="creneau_date" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Statut" column="statut" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {livraisons.map((liv) => (
                  <TableRow key={liv.id} className={selectedLivraisons.has(liv.id) ? 'bg-muted/50' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedLivraisons.has(liv.id)}
                        onCheckedChange={() => handleToggleSelect(liv.id)}
                        aria-label={`Sélectionner ${liv.client?.raison_sociale || ''}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      {liv.client?.id ? (
                        <a href={`/admin/clients/${liv.client.id}`} className="font-medium truncate block text-blue-600 hover:underline" title={liv.client.raison_sociale || ''}>{liv.client.raison_sociale || 'N/A'}</a>
                      ) : (
                        <div className="font-medium truncate" title="">N/A</div>
                      )}
                      <div className="text-xs text-muted-foreground truncate">{liv.client?.siret}</div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono text-muted-foreground">
                          {liv.client?.reference_retina || '-'}
                        </span>
                        {liv.client?.reference_retina && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(liv.client!.reference_retina!) }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copier"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {liv.client?.telephone ? (
                        <a href={`tel:${liv.client.telephone}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {liv.client.telephone}
                        </a>
                      ) : <span className="text-sm text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline" className="text-xs font-normal">
                        {liv.client ? getCommercialName(liv.client) : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {getDepartementLabel(liv.client?.departement, liv.client?.adresse_societe_cp)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {liv.client?.type_de_zone ? (
                        <Badge className={
                          liv.client.type_de_zone === 'dans_la_zone'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800'
                        } variant="outline">
                          {liv.client.type_de_zone === 'dans_la_zone' ? 'En zone' : 'Hors zone'}
                        </Badge>
                      ) : <span className="text-sm text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm">
                        {liv.depot?.nom || depotOptions.find(d => d.value === (liv.client?.depot_retrait_id || liv.client?.depot_logistique_id))?.label || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1 text-sm">
                        {liv.mode_livraison === 'domicile' ? (
                          <><Truck className="h-3 w-3" /> Domicile</>
                        ) : (
                          <><MapPin className="h-3 w-3" /> Relais</>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="text-sm">
                        {liv.adresse_livraison_cp || liv.client?.adresse_societe_cp
                          ? `${liv.adresse_livraison_cp || liv.client?.adresse_societe_cp || ''} ${liv.adresse_livraison_ville || ''}`
                          : '-'}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-center">
                      <div className="text-sm">
                        <span className="font-medium">{liv.client?.velo_valide || liv.client?.velo_devis || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const dateLivraison = (liv as any).date_livraison
                        const creneauDate = (liv as any).creneau_date
                        const isLivre = liv.statut === 'livree'
                        const dateToShow = (isLivre && dateLivraison) ? dateLivraison : (creneauDate || dateLivraison)
                        if (!dateToShow) return <span className="text-sm text-muted-foreground">-</span>
                        try {
                          return (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {new Date(dateToShow + (dateToShow.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              {!isLivre && liv.creneau_heure_debut && (
                                <span className="text-muted-foreground text-xs ml-1">
                                  {liv.creneau_heure_debut}
                                </span>
                              )}
                            </div>
                          )
                        } catch { return <span className="text-sm text-muted-foreground">{dateToShow}</span> }
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          {liv.client?.in_enemat ? (
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" title="ENEMAT" />
                          ) : (liv as any).cq_valide ? (
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="Contrôle qualité validé" />
                          ) : (liv as any).cq_en_cours ? (
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" title="Contrôle en cours — à finaliser" />
                          ) : null}
                          <Badge className={statutColors[liv.statut || 'a_livrer']}>
                            {statutLabels[liv.statut || 'a_livrer'] || liv.statut}
                          </Badge>
                        </div>
                        {liv.confirmation_statut && (
                          <Badge className={
                            liv.confirmation_statut === 'confirmee' ? 'bg-emerald-100 text-emerald-800' :
                            liv.confirmation_statut === 'refusee' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          } variant="outline">
                            {liv.confirmation_statut === 'confirmee' ? '✓ Confirmée' :
                             liv.confirmation_statut === 'refusee' ? '✗ Refusée' :
                             '⏳ En attente'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right flex items-center gap-1 justify-end">
                      {liv.statut === 'a_livrer' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const depotId = liv.depot_id || liv.client?.depot_retrait_id || liv.client?.depot_logistique_id
                            window.location.href = `/admin/planning${depotId ? `?depot_id=${depotId}` : ''}`
                          }}
                          title="Programmer la livraison"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 active:scale-90 transition-all"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                      )}
                      {liv.statut !== 'livree' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const tenant = getTenantConfig()
                            // ECOVOLT UNIQUEMENT : redirige vers l'app externe de l'associe
                            // PPE utilise le module interne /admin/livraisons/deliver
                            if (tenant.externalRetraitUrl) {
                              const mondayId = liv.client?.monday_item_id || ''
                              const url = `${tenant.externalRetraitUrl}?monday_id=${mondayId}&livraison_id=${liv.id}`
                              window.open(url, '_blank')
                            } else {
                              window.location.href = `/admin/livraisons/deliver?id=${liv.id}`
                            }
                          }}
                          title="Module de livraison"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 active:scale-90 transition-all"
                        >
                          <Truck className="h-4 w-4" />
                        </Button>
                      )}
                      {liv.statut === 'livree' && (liv as any).cq_valide && ['super_admin', 'admin'].includes(adminUser?.role || '') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setReactivateTarget(liv); setReactivateComment('') }}
                          title="Réactivation SAV — renvoyer en contrôle qualité"
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 active:scale-90 transition-all"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.location.href = `/admin/clients/${liv.client_id}`}
                        title="Voir la fiche"
                        className="active:scale-90 transition-all"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {pagination.totalFiltered > 0
            ? `${pagination.startIndex}-${pagination.endIndex} sur ${pagination.totalFiltered}`
            : '0 résultats'}
        </div>
        <div className="flex items-center gap-2">
          {pagination.totalPages > 1 && (
            <>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs">{page}/{pagination.totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      {/* Barre d'actions bulk flottante */}
      {selectedLivraisons.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Card className="shadow-lg border-2">
            <CardContent className="flex items-center gap-3 py-3 px-4 flex-wrap">
              <span className="font-medium text-sm whitespace-nowrap">
                {selectedLivraisons.size} livraison{selectedLivraisons.size > 1 ? 's' : ''} sélectionnée{selectedLivraisons.size > 1 ? 's' : ''}
              </span>
              <div className="h-6 w-px bg-border" />
              <div
                title={!canSendFormulaireRetrait ? 'Uniquement pour clients en retrait' : undefined}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('send_formulaire_retrait')}
                  disabled={bulkActionLoading || !canSendFormulaireRetrait}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Formulaire retrait
                </Button>
              </div>
              <div
                title={!canSendMailLivraison ? 'Uniquement pour clients en livraison à domicile' : undefined}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('send_mail_livraison')}
                  disabled={bulkActionLoading || mailLivraisonLoading || !canSendMailLivraison}
                >
                  {mailLivraisonLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Mail livraison
                </Button>
              </div>
              <div
                title={!canSendMailPlanning ? 'Uniquement pour clients au statut "programmé"' : undefined}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('send_mail_planning')}
                  disabled={bulkActionLoading || !canSendMailPlanning}
                >
                  <CalendarCheck className="h-4 w-4 mr-2" />
                  Mail planning
                </Button>
              </div>
              {adminUser?.role === 'super_admin' && (() => {
                const selectedLivs = livraisons.filter(l => selectedLivraisons.has(l.id))
                const allCQValide = selectedLivs.length > 0 && selectedLivs.every(l => (l as any).cq_valide === true)
                return allCQValide ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkAction('enter_enemat')}
                    disabled={bulkActionLoading}
                    className="text-violet-700 hover:text-violet-800 hover:bg-violet-50 border-violet-300"
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    Basculer vers ENEMAT
                  </Button>
                ) : null
              })()}
              {bulkMessage && (
                <span className={`text-xs font-medium px-2 py-1 rounded ${bulkMessage.isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {bulkMessage.text}
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={handleClearSelection} disabled={bulkActionLoading}>
                <X className="h-4 w-4" />
              </Button>
              {bulkActionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog réactivation SAV */}
      <AlertDialog open={!!reactivateTarget} onOpenChange={(open) => { if (!open) setReactivateTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réactivation SAV</AlertDialogTitle>
            <AlertDialogDescription>
              Le dossier <strong>{reactivateTarget?.client?.raison_sociale}</strong> sera renvoyé en contrôle qualité.
              Tous les checks seront remis à zéro. Cette action est tracée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motif de réactivation (obligatoire)..."
            value={reactivateComment}
            onChange={e => setReactivateComment(e.target.value)}
            className="min-h-[80px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reactivateLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReactivate}
              disabled={!reactivateComment.trim() || reactivateLoading}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {reactivateLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Confirmer la réactivation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
