'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { usePinnedFilters, PinFiltersButton } from '@/components/admin/pin-filters'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Search, Building2, Mail, Copy, Check, RefreshCw, MoreHorizontal, Eye, Phone, X, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Download, Database, Upload, Ban } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Client } from '@/lib/types/database'
import { toast } from 'sonner'
import { getTenantId, getTenantConfig } from '@/lib/tenants'
import { exportToXlsx } from '@/lib/export-xlsx'
import { getCommercialName, getDepartementLabel, getStaticDepartementOptions, getStaticCommercialOptions } from '@/lib/tenants/commercial'

// Statuts Data Client
const DATA_STATUTS: Record<string, string> = {
  'CONTROL VALIDE': 'Control validé',
  'CONTROLE VALIDE': 'Contrôle validé',
  'DEVIS SIGNE': 'Devis signé',
  'ATTENTE DOCUMENT': 'Attente document',
  'CONTROLE A REGULARISER': 'Contrôle à régulariser',
  'DOSSIER COMPLET': 'Dossier complet',
  'CONTROLE A JOUR': 'Contrôle à jour',
  'CLIENT INJOIGNABLE': 'Client injoignable',
  'CLIENT HS': 'Client HS',
  'LIVRE': 'Livré',
  'FORMULAIRE ENVOYE': 'Formulaire envoyé',
  'HS': 'HS',
  'retour_client': 'Retour client',
  'en_attente': 'En attente',
}

const DATA_STATUT_COLORS: Record<string, string> = {
  'CONTROL VALIDE': 'bg-green-100 text-green-800',
  'CONTROLE VALIDE': 'bg-green-100 text-green-800',
  'DEVIS SIGNE': 'bg-blue-100 text-blue-800',
  'ATTENTE DOCUMENT': 'bg-yellow-100 text-yellow-800',
  'CONTROLE A REGULARISER': 'bg-orange-100 text-orange-800',
  'DOSSIER COMPLET': 'bg-emerald-100 text-emerald-800',
  'CONTROLE A JOUR': 'bg-emerald-100 text-emerald-800',
  'CLIENT INJOIGNABLE': 'bg-red-100 text-red-800',
  'CLIENT HS': 'bg-red-100 text-red-800',
  'LIVRE': 'bg-purple-100 text-purple-800',
  'FORMULAIRE ENVOYE': 'bg-cyan-100 text-cyan-800',
  'HS': 'bg-red-100 text-red-800',
  'retour_client': 'bg-blue-100 text-blue-800',
  'en_attente': 'bg-gray-100 text-gray-800',
}

// Options filtre NAF (ENEMAT)
const nafOptions = [
  { value: 'all', label: 'NAF' },
  { value: 'valide', label: 'NAF Validé' },
  { value: 'bloque', label: 'NAF Bloqué' },
  { value: 'en_attente', label: 'NAF En attente' },
]

// Statuts pour filtre
const defaultStatutOptions = [{ value: 'all', label: 'Statut' }]

// Helper pour obtenir le label et la couleur d'un statut data
function getStatutDisplay(statut: string | null | undefined): { label: string; color: string } {
  if (!statut) return { label: 'Inconnu', color: 'bg-gray-100 text-gray-800' }
  const label = DATA_STATUTS[statut]
  const color = DATA_STATUT_COLORS[statut]
  if (label && color) return { label: label.toUpperCase(), color }
  // Fallback pour statuts inconnus
  return { label: statut.toUpperCase().replace(/_/g, ' '), color: 'bg-gray-100 text-gray-800' }
}

// Options de pagination
const pageSizeOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 500, label: '500' },
]

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

export default function DataClientPage() {
  const user = useAdminUser()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedRef, setCopiedRef] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState<string[]>([])
  const [statutOptions, setStatutOptions] = useState(defaultStatutOptions)
  const [nafFilter, setNafFilter] = useState('all')
  const [departementFilter, setDepartementFilter] = useState<string[]>([])
  const [commercialFilter, setCommercialFilter] = useState<string[]>([])
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [commercialOptions, setCommercialOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Commercial' }])
  const [dynamicDeptOptions, setDynamicDeptOptions] = useState<{value: string; label: string}[] | null>(null)
  const tenantId = getTenantId()

  // Pagination cote serveur
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState<{
    page: number
    pageSize: number
    totalPages: number
    totalFiltered: number
    totalClients: number
    startIndex: number
    endIndex: number
    velosValidesFiltered?: number
  } | null>(null)

  // HS dialog states
  const [hsDialogOpen, setHsDialogOpen] = useState(false)
  const [hsConfirmOpen, setHsConfirmOpen] = useState(false)
  const [hsComment, setHsComment] = useState('')
  const [hsLoading, setHsLoading] = useState(false)
  const [hsClient, setHsClient] = useState<Client | null>(null)

  // Import dialog
  const [importLoading, setImportLoading] = useState(false)

  // Selection multiple
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  // Bulk HS dialog
  const [bulkHsDialogOpen, setBulkHsDialogOpen] = useState(false)
  const [bulkHsConfirmOpen, setBulkHsConfirmOpen] = useState(false)
  const [bulkHsComment, setBulkHsComment] = useState('')
  const [bulkHsLoading, setBulkHsLoading] = useState(false)

  // Filtres figes par utilisateur
  const { loadPinned, saveFilters, hasPinned } = usePinnedFilters(user?.id, 'data-clients')
  const [isPinned, setIsPinned] = useState(false)
  const pinnedLoaded = useRef(false)
  const [filtersReady, setFiltersReady] = useState(false)

  // Role check — super_admin et admin uniquement
  const isAuthorized = user?.role === 'super_admin' || user?.role === 'admin'

  useEffect(() => {
    if (pinnedLoaded.current) return
    pinnedLoaded.current = true
    const pinned = loadPinned()
    if (pinned) {
      setIsPinned(true)
      if (pinned.statut) setStatutFilter(Array.isArray(pinned.statut) ? pinned.statut : pinned.statut.split(',').filter(Boolean))
      if (pinned.departement) setDepartementFilter(Array.isArray(pinned.departement) ? pinned.departement : [pinned.departement])
      if (pinned.naf) setNafFilter(pinned.naf)
      if (pinned.commercial) setCommercialFilter(Array.isArray(pinned.commercial) ? pinned.commercial : pinned.commercial.split(',').filter(Boolean))
      if (pinned.pageSize) setPageSize(pinned.pageSize)
    }
    setFiltersReady(true)
  }, [loadPinned])

  const handlePinFilters = () => {
    saveFilters({
      statut: statutFilter.join(','),
      departement: departementFilter,
      naf: nafFilter,
      commercial: commercialFilter.join(','),
      pageSize,
    })
    setIsPinned(true)
    toast.success('Filtres figés comme vue par défaut')
  }

  // Charger les statuts data comme options de filtre
  useEffect(() => {
    const options = Object.entries(DATA_STATUTS).map(([value, label]) => ({
      value,
      label,
    }))
    setStatutOptions([{ value: 'all', label: 'Statut' }, ...options])
  }, [])

  // Load commercial options from data_clients distinct values
  useEffect(() => {
    fetch('/api/admin/data-clients?distinct=commercial_assigne')
      .then(res => res.json())
      .then((data) => {
        const commercials: string[] = data.commercials || []
        if (commercials.length > 0) {
          setCommercialOptions([
            { value: 'all', label: 'Commercial' },
            ...commercials.map(c => ({ value: c, label: c }))
          ])
        }
      })
      .catch(() => {
        // Fallback : options statiques
        const staticOpts = getStaticCommercialOptions()
        if (staticOpts) {
          setCommercialOptions([{ value: 'all', label: 'Commercial' }, ...staticOpts])
        }
      })
  }, [])

  // Load dynamic department options
  useEffect(() => {
    const staticDepts = getStaticDepartementOptions()
    if (staticDepts) {
      setDynamicDeptOptions([{ value: 'all', label: 'Départements' }, ...staticDepts])
    } else {
      fetch('/api/clients/departements')
        .then(res => res.json())
        .then((depts: { value: string; label: string }[]) => {
          if (Array.isArray(depts)) {
            setDynamicDeptOptions([
              { value: 'all', label: 'Départements' },
              ...depts,
            ])
          }
        })
        .catch(() => {})
    }
  }, [])

  // Debounce pour la recherche
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 600)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchClients = async (forceRefresh = false, page = currentPage, size = pageSize) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(size))

      if (forceRefresh) params.set('refresh', 'true')
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statutFilter.length > 0) params.set('statut', statutFilter.join(','))
      if (departementFilter.length > 0) params.set('departement', departementFilter.join(','))
      if (nafFilter !== 'all') params.set('naf', nafFilter)
      if (commercialFilter.length > 0) params.set('commercial', commercialFilter.join(','))
      if (sortBy !== 'updated_at' || sortOrder !== 'desc') {
        params.set('sortBy', sortBy)
        params.set('sortOrder', sortOrder)
      }

      const endpoint = `/api/admin/data-clients?${params.toString()}`

      const response = await fetch(endpoint)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors du chargement')
      }

      setClients(result.clients || [])

      if (result.pagination) {
        setPagination(result.pagination)
      }

    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors du chargement des clients data')
    } finally {
      setLoading(false)
    }
  }

  const handleForceRefresh = () => {
    fetchClients(true)
  }

  // Export Excel
  const handleExportClients = () => {
    const tenant = getTenantConfig()
    const today = new Date().toISOString().slice(0, 10)
    exportToXlsx(clients, [
      { header: 'Raison sociale', accessor: r => r.raison_sociale },
      { header: 'Réf. Retina', accessor: r => r.reference_retina },
      { header: 'Contact nom', accessor: r => r.contact_nom },
      { header: 'Contact prénom', accessor: r => r.contact_prenom },
      { header: 'Téléphone', accessor: r => r.telephone },
      { header: 'Adresse', accessor: r => r.adresse_societe_ligne1 },
      { header: 'CP', accessor: r => r.adresse_societe_cp },
      { header: 'Ville', accessor: r => r.adresse_societe_ville },
      { header: 'Département', accessor: r => r.departement },
      { header: 'Nb vélos', accessor: r => r.velo_valide || r.velo_confirme || 0 },
      { header: 'Statut Data', accessor: r => (r as any).statut_data },
    ], `Export-DataClients-${tenant.name}-${today}.xlsx`)
  }

  // Reset page quand les filtres changent
  const prevFilters = useRef({
    search: debouncedSearch,
    statut: statutFilter.join(','),
    dept: departementFilter.join(','),
    pageSize,
    naf: nafFilter,
    commercial: commercialFilter.join(','),
    sortBy,
    sortOrder,
  })

  useEffect(() => {
    const prev = prevFilters.current
    const cur = {
      search: debouncedSearch,
      statut: statutFilter.join(','),
      dept: departementFilter.join(','),
      pageSize,
      naf: nafFilter,
      commercial: commercialFilter.join(','),
      sortBy,
      sortOrder,
    }
    if (
      prev.search !== cur.search || prev.statut !== cur.statut ||
      prev.dept !== cur.dept || prev.pageSize !== cur.pageSize ||
      prev.naf !== cur.naf ||
      prev.commercial !== cur.commercial ||
      prev.sortBy !== cur.sortBy || prev.sortOrder !== cur.sortOrder
    ) {
      setCurrentPage(1)
      prevFilters.current = cur
    }
  }, [debouncedSearch, statutFilter, departementFilter, pageSize, nafFilter, commercialFilter, sortBy, sortOrder])

  // Charger les clients quand les parametres changent
  useEffect(() => {
    if (!filtersReady) return
    fetchClients(false, currentPage, pageSize)
  }, [currentPage, pageSize, debouncedSearch, statutFilter, departementFilter, nafFilter, commercialFilter, sortBy, sortOrder, filtersReady])

  // === Selection multiple ===
  const handleToggleSelect = (clientId: string) => {
    const newSelected = new Set(selectedClients)
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId)
    } else {
      newSelected.add(clientId)
    }
    setSelectedClients(newSelected)
  }

  const paginatedClients = clients

  const handleSelectAll = () => {
    if (selectedClients.size === paginatedClients.length) {
      setSelectedClients(new Set())
    } else {
      setSelectedClients(new Set(paginatedClients.map(c => c.id)))
    }
  }

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref)
    setCopiedRef(ref)
    setTimeout(() => setCopiedRef(null), 2000)
  }

  const handleClearSelection = () => {
    setSelectedClients(new Set())
  }

  // === Importer vers Client (individuel) ===
  const handleImportToClient = async (client: Client) => {
    setImportLoading(true)
    try {
      const response = await fetch('/api/admin/data-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [client.id] }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'import')
      }
      if (result.errors?.length) {
        toast.error(`Erreur : ${result.errors.join(', ')}`)
      } else {
        toast.success(`${client.raison_sociale} importé vers Clients`)
      }
      await fetchClients()
    } catch (error: any) {
      console.error('Erreur import:', error)
      toast.error(error.message || 'Erreur lors de l\'import')
    } finally {
      setImportLoading(false)
    }
  }

  // === Importer vers Client (bulk) ===
  const handleBulkImport = async () => {
    if (selectedClients.size === 0) return
    setBulkActionLoading(true)
    try {
      const response = await fetch('/api/admin/data-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedClients) }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'import')
      }
      if (result.failed === 0) {
        toast.success(`${result.success} client(s) importé(s)`)
      } else {
        toast.warning(`${result.success} importé(s), ${result.failed} échec(s)`)
      }
      await fetchClients()
      setSelectedClients(new Set())
    } catch (error: any) {
      console.error('Erreur bulk import:', error)
      toast.error(error.message || 'Erreur lors de l\'import groupé')
    } finally {
      setBulkActionLoading(false)
    }
  }

  // === Client HS (individuel) ===
  const handleClientHS = async () => {
    if (!hsClient || !hsComment.trim()) return
    setHsLoading(true)
    try {
      const response = await fetch(`/api/admin/data-clients/${hsClient.id}/hs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: hsComment }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors du passage en HS')
      }
      toast.success(`${hsClient.raison_sociale} passé en HS`)
      setHsConfirmOpen(false)
      setHsDialogOpen(false)
      setHsComment('')
      setHsClient(null)
      await fetchClients()
    } catch (error: any) {
      console.error('Erreur HS:', error)
      toast.error(error.message || 'Erreur lors du passage en HS')
    } finally {
      setHsLoading(false)
    }
  }

  // === Client HS (bulk) ===
  const handleBulkHS = async () => {
    if (selectedClients.size === 0 || !bulkHsComment.trim()) return
    setBulkHsLoading(true)
    try {
      const ids = Array.from(selectedClients)
      let success = 0
      let failed = 0
      for (const id of ids) {
        try {
          const response = await fetch(`/api/admin/data-clients/${id}/hs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: bulkHsComment }),
          })
          if (response.ok) {
            success++
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }
      if (failed === 0) {
        toast.success(`${success} client(s) passé(s) en HS`)
      } else {
        toast.warning(`${success} passé(s) en HS, ${failed} échec(s)`)
      }
      setBulkHsConfirmOpen(false)
      setBulkHsDialogOpen(false)
      setBulkHsComment('')
      setSelectedClients(new Set())
      await fetchClients()
    } catch (error: any) {
      console.error('Erreur bulk HS:', error)
      toast.error(error.message || 'Erreur lors du passage en HS groupé')
    } finally {
      setBulkHsLoading(false)
    }
  }

  // Valeurs de pagination
  const totalPages = pagination?.totalPages || 1
  const totalFiltered = pagination?.totalFiltered || clients.length
  const startIndex = pagination?.startIndex || 1
  const endIndex = pagination?.endIndex || clients.length

  // Stats globales
  const [globalStats, setGlobalStats] = useState<{
    total: number
    velosTotal: number
  } | null>(null)

  useEffect(() => {
    // On pourrait appeler un endpoint stats dédié si besoin
    // Pour l'instant on utilise les données de pagination
  }, [])

  // Premier chargement — spinner
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(() => {
    if (!loading && initialLoad) {
      setInitialLoad(false)
    }
  }, [loading, initialLoad])

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  // Access check
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Ban className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-medium mb-1">Accès restreint</h3>
          <p className="text-muted-foreground text-sm">
            Cette page est réservée aux administrateurs.
          </p>
        </div>
      </div>
    )
  }

  if (initialLoad && loading) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold">Data Client</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleForceRefresh}
            disabled={loading}
            title="Rafraîchir"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats inline */}
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold">{pagination?.totalFiltered ?? pagination?.totalClients ?? 0} <span className="text-muted-foreground font-normal">clients data</span></span>
        <span className="text-muted-foreground">|</span>
        <span className="font-semibold text-blue-600">{pagination?.velosValidesFiltered ?? 0} <span className="text-muted-foreground font-normal">vélos</span></span>
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
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Département {departementFilter.length > 0 && `(${departementFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            <div className="max-h-60 overflow-y-auto">
              {(dynamicDeptOptions || []).filter(o => o.value !== 'all').map(o => (
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
        <Select value={nafFilter} onValueChange={setNafFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[60px] text-xs px-2 shrink-0">
            <SelectValue placeholder="NAF" />
          </SelectTrigger>
          <SelectContent>
            {nafOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[52px] text-xs px-2 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <PinFiltersButton onPin={handlePinFilters} isPinned={isPinned} />

        <Button variant="outline" size="sm" onClick={handleExportClients} disabled={clients.length === 0}>
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {paginatedClients.length === 0 ? (
            <div className="text-center py-12">
              <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucun client data</h3>
              <p className="text-muted-foreground text-sm">
                {searchQuery || statutFilter.length > 0 || departementFilter.length > 0
                  ? 'Aucun client ne correspond à vos critères'
                  : 'Aucun client data dans la base'}
              </p>
            </div>
          ) : (
            <>
            {/* Info pagination */}
            <div className="px-4 py-2 border-b flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{totalFiltered}</span> client{totalFiltered > 1 ? 's' : ''} data
                {pagination && totalFiltered !== pagination.totalClients && ` / ${pagination.totalClients}`}
                {' · '}
                <span className="font-medium text-blue-600">{pagination?.velosValidesFiltered ?? 0}</span> vélos
              </span>
              <span>
                {currentPage}/{totalPages}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={paginatedClients.length > 0 && selectedClients.size === paginatedClients.length}
                      onCheckedChange={handleSelectAll}
                      aria-label="Tout sélectionner"
                    />
                  </TableHead>
                  <SortableHeader label="Société" column="raison_sociale" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Ref. Retina" column="reference_retina" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden xl:table-cell" />
                  <SortableHeader label="Email client" column="email_beneficiaire" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden xl:table-cell" />
                  <SortableHeader label="Téléphone" column="telephone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden xl:table-cell" />
                  <SortableHeader label="Commercial" column="monday_board_id" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
                  <SortableHeader label="Dép." column="departement" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="Velos" column="velo_devis" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="NAF" column="validation_naf" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="Statut" column="statut_data" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={loading ? 'opacity-50' : ''}>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && paginatedClients.map((client: any) => (
                  <TableRow key={client.id} className={selectedClients.has(client.id) ? 'bg-muted/50' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedClients.has(client.id)}
                        onCheckedChange={() => handleToggleSelect(client.id)}
                        aria-label={`Sélectionner ${client.raison_sociale}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <div>
                        <a href={`/admin/settings/data-client/${client.id}`} className="font-medium truncate block text-blue-600 hover:underline" title={client.raison_sociale}>{client.raison_sociale}</a>
                        <div className="text-sm text-muted-foreground font-mono truncate">
                          {client.siret || '-'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {client.reference_retina ? (
                        <button
                          onClick={() => copyRef(client.reference_retina!)}
                          className="flex items-center gap-1 text-xs font-mono hover:text-blue-600 transition-colors"
                          title="Copier"
                        >
                          {client.reference_retina}
                          {copiedRef === client.reference_retina ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="text-sm">
                        {client.email_beneficiaire ? (
                          <div className="text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {client.email_beneficiaire}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {client.telephone ? (
                        <a href={`tel:${client.telephone}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {client.telephone}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline" className="text-xs font-normal">
                        {getCommercialName(client)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {client.departement ? (
                        <Badge variant="outline">
                          {getDepartementLabel(client.departement, client.adresse_societe_cp)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-sm">
                        <span className="font-medium">{client.velo_valide || client.velo_confirme || 0}</span>
                        <span className="text-muted-foreground"> / {client.velo_devis || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {(() => {
                        if (client.validation_naf === 'OUI') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">OUI</Badge>
                        if (client.validation_naf === 'NON') return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">NON</Badge>
                        return <Badge variant="outline" className="text-muted-foreground">A vérifier</Badge>
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const display = getStatutDisplay(client.statut_data)
                        return (
                          <Badge className={display.color}>
                            {display.label}
                          </Badge>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <a href={`/admin/settings/data-client/${client.id}`}>
                          <Button variant="ghost" size="sm" title="Voir la fiche">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </a>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleImportToClient(client)}
                              disabled={importLoading}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Importer vers Client
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setHsClient(client)
                                setHsDialogOpen(true)
                              }}
                              className="text-red-600"
                            >
                              <X className="h-4 w-4 mr-2" />
                              Passer en HS
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination en bas du tableau */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Affichage {startIndex} - {endIndex} sur {totalFiltered}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Précédent
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? 'default' : 'outline'}
                          size="sm"
                          className="w-9"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Barre d'actions groupees flottante */}
      {selectedClients.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Card className="shadow-lg border-2">
            <CardContent className="flex items-center gap-4 py-3 px-4">
              <span className="font-medium text-sm">
                {selectedClients.size} client{selectedClients.size > 1 ? 's' : ''} sélectionné{selectedClients.size > 1 ? 's' : ''}
              </span>
              <div className="h-6 w-px bg-border" />
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleBulkImport}
                disabled={bulkActionLoading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Importer vers Client
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkHsDialogOpen(true)}
                disabled={bulkActionLoading}
              >
                <X className="h-4 w-4 mr-2" />
                Passer en HS
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleClearSelection}
                disabled={bulkActionLoading}
              >
                <X className="h-4 w-4" />
              </Button>
              {bulkActionLoading && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog HS individuel — etape 1 : commentaire */}
      <Dialog open={hsDialogOpen} onOpenChange={(open) => { if (!open) { setHsDialogOpen(false); setHsComment(''); setHsClient(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passer le client en HS</DialogTitle>
            <DialogDescription>
              Cette action marquera le client comme annulé (HS). Veuillez indiquer la raison.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <label className="text-sm font-medium mb-2 block">Raison de l&apos;annulation *</label>
            <textarea
              className="w-full border rounded-md p-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Ex: Client ne répond plus, entreprise fermée, rétractation..."
              value={hsComment}
              onChange={(e) => setHsComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setHsDialogOpen(false); setHsComment(''); setHsClient(null) }}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={!hsComment.trim()}
              onClick={() => { setHsDialogOpen(false); setHsConfirmOpen(true) }}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog HS individuel — etape 2 : confirmation */}
      <AlertDialog open={hsConfirmOpen} onOpenChange={setHsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le passage en HS</AlertDialogTitle>
            <AlertDialogDescription>
              Le client <strong>{hsClient?.raison_sociale}</strong> sera marqué comme HS (annulé).<br />
              Raison : &quot;{hsComment}&quot;<br /><br />
              Cette action est enregistrée avec votre nom et la date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hsLoading} onClick={() => { setHsConfirmOpen(false); setHsDialogOpen(true) }}>Retour</AlertDialogCancel>
            <AlertDialogAction
              disabled={hsLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClientHS}
            >
              {hsLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Oui, passer en HS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog HS bulk — etape 1 : commentaire */}
      <Dialog open={bulkHsDialogOpen} onOpenChange={(open) => { if (!open) { setBulkHsDialogOpen(false); setBulkHsComment('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passer {selectedClients.size} client{selectedClients.size > 1 ? 's' : ''} en HS</DialogTitle>
            <DialogDescription>
              Cette action marquera les clients sélectionnés comme annulés (HS). Veuillez indiquer la raison.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <label className="text-sm font-medium mb-2 block">Raison de l&apos;annulation *</label>
            <textarea
              className="w-full border rounded-md p-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Ex: Client ne répond plus, entreprise fermée, rétractation..."
              value={bulkHsComment}
              onChange={(e) => setBulkHsComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkHsDialogOpen(false); setBulkHsComment('') }}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={!bulkHsComment.trim()}
              onClick={() => { setBulkHsDialogOpen(false); setBulkHsConfirmOpen(true) }}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog HS bulk — etape 2 : confirmation */}
      <AlertDialog open={bulkHsConfirmOpen} onOpenChange={setBulkHsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le passage en HS</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedClients.size}</strong> client{selectedClients.size > 1 ? 's' : ''} seront marqué{selectedClients.size > 1 ? 's' : ''} comme HS (annulé{selectedClients.size > 1 ? 's' : ''}).<br />
              Raison : &quot;{bulkHsComment}&quot;<br /><br />
              Cette action est enregistrée avec votre nom et la date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkHsLoading} onClick={() => { setBulkHsConfirmOpen(false); setBulkHsDialogOpen(true) }}>Retour</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkHsLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkHS}
            >
              {bulkHsLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Oui, passer en HS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
