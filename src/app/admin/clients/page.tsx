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
import { Label } from '@/components/ui/label'
import { Loader2, Search, Filter, Building2, MapPin, Send, Mail, ExternalLink, Copy, Check, RefreshCw, Trash2, MoreHorizontal, Navigation, Eye, Phone, X, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Download } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
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
import { PROCESS_STATUTS, STATUT_COLORS, type ProcessStatut } from '@/lib/constants'
import { getDepartementLabel, getStaticDepartementOptions } from '@/lib/tenants/commercial'
import { useCommerciaux } from '@/lib/tenants/use-commerciaux'
import { CommercialFilter } from '@/components/admin/commercial-filter'
import { CommercialCell } from '@/components/admin/commercial-cell'
import { getSimpleZoneStatus, type DepotWithCoords } from '@/lib/geo/utils'

// Options filtre NAF (ENEMAT)
const nafOptions = [
  { value: 'all', label: 'NAF' },
  { value: 'valide', label: 'NAF Validé' },
  { value: 'bloque', label: 'NAF Bloqué' },
  { value: 'en_attente', label: 'NAF En attente' },
]

// Statuts pour filtre - chargés dynamiquement depuis l'API
const defaultStatutOptions = [{ value: 'all', label: 'Statut' }]

// Départements - clés Supabase (codes postaux DOM-TOM)
const departementOptions = [
  { value: 'all', label: 'Départements' },
  { value: '974', label: 'La Réunion (974)' },
  { value: '972', label: 'Martinique (972)' },
  { value: '971', label: 'Guadeloupe (971)' },
  { value: '973', label: 'Guyane (973)' },
  { value: '976', label: 'Mayotte (976)' },
  { value: 'hors_dom', label: 'Hors DOM' },
]

// Helper pour obtenir le label et la couleur d'un statut (basé sur PROCESS_STATUTS + STATUT_COLORS)
function getStatutDisplay(statut: string | null | undefined): { label: string; color: string } {
  if (!statut) return { label: 'Inconnu', color: 'bg-gray-100 text-gray-800' }
  const label = PROCESS_STATUTS[statut as ProcessStatut]
  const color = STATUT_COLORS[statut as ProcessStatut]
  if (label && color) return { label: label.toUpperCase(), color }
  // Fallback pour statuts legacy ou inconnus
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

// Déterminer l'agence à partir du code postal
function getAgenceFromCodePostal(codePostal: string): string {
  const prefix = codePostal.substring(0, 3)
  switch (prefix) {
    case '974': return 'reunion'
    case '972': return 'martinique'
    case '971': return 'guadeloupe'
    case '973': return 'guyane'
    default: return 'france_metro'
  }
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

export default function AdminClientsPage() {
  const user = useAdminUser()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedRef, setCopiedRef] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState<string[]>([])
  const [statutOptions, setStatutOptions] = useState(defaultStatutOptions)
  const [nafFilter, setNafFilter] = useState('all')
  const [departementFilter, setDepartementFilter] = useState<string[]>([])
  const [zoneFilter, setZoneFilter] = useState('all')
  const [commercialFilter, setCommercialFilter] = useState<string[]>([])
  const [livreurFilter, setLivreurFilter] = useState<string[]>([])
  const [depotFilter, setDepotFilter] = useState('all')
  const [controleFilter, setControleFilter] = useState('all')
  const [enematFilter, setEnematFilter] = useState('all')
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [livreurOptions, setLivreurOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Livreur' }])
  const [dynamicDeptOptions, setDynamicDeptOptions] = useState<{value: string; label: string}[] | null>(null)
  const [depots, setDepots] = useState<DepotWithCoords[]>([])
  const tenantId = getTenantId()
  const { parents: commerciauxParents } = useCommerciaux(tenantId)

  // Pagination côté serveur
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
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

  // Dialog states
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)

  // Edit client dialog
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [savingClient, setSavingClient] = useState(false)

  // Delete client dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null)
  const [deletingClient, setDeletingClient] = useState(false)

  // Bypass livraison dialog (double confirmation)
  const [bypassClient, setBypassClient] = useState<Client | null>(null)
  const [bypassStep, setBypassStep] = useState(0) // 0=closed, 1=first confirm, 2=second confirm
  const [bypassLoading, setBypassLoading] = useState(false)

  // Sélection multiple
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)


  // Filtres figés par utilisateur
  const { loadPinned, saveFilters, hasPinned } = usePinnedFilters(user?.id, 'clients')
  const [isPinned, setIsPinned] = useState(false)
  const pinnedLoaded = useRef(false)
  const [filtersReady, setFiltersReady] = useState(false)

  useEffect(() => {
    if (pinnedLoaded.current) return
    pinnedLoaded.current = true
    const pinned = loadPinned()
    if (pinned) {
      setIsPinned(true)
      if (pinned.statut) setStatutFilter(Array.isArray(pinned.statut) ? pinned.statut : pinned.statut === 'all' ? [] : [pinned.statut])
      if (pinned.departement) setDepartementFilter(Array.isArray(pinned.departement) ? pinned.departement : [pinned.departement])
      if (pinned.naf) setNafFilter(pinned.naf)
      if (pinned.zone) setZoneFilter(pinned.zone)
      if (pinned.commercial) setCommercialFilter(Array.isArray(pinned.commercial) ? pinned.commercial : pinned.commercial === 'all' ? [] : [pinned.commercial])
      if (pinned.livreur) setLivreurFilter(Array.isArray(pinned.livreur) ? pinned.livreur : [])
      if (pinned.depot) setDepotFilter(pinned.depot)
      if (pinned.controle) setControleFilter(pinned.controle)
      if (pinned.enemat) setEnematFilter(pinned.enemat)
      if (pinned.pageSize) setPageSize(pinned.pageSize)
    }
    setFiltersReady(true)
  }, [loadPinned])

  const handlePinFilters = () => {
    saveFilters({
      statut: statutFilter,
      departement: departementFilter,
      naf: nafFilter,
      zone: zoneFilter,
      commercial: commercialFilter,
      livreur: livreurFilter,
      depot: depotFilter,
      controle: controleFilter,
      enemat: enematFilter,
      pageSize,
    })
    setIsPinned(true)
    toast.success('Filtres figés comme vue par défaut')
  }

  // Charger les statuts : utiliser PROCESS_STATUTS comme source de vérité
  useEffect(() => {
    const options = Object.entries(PROCESS_STATUTS).map(([value, label]) => ({
      value,
      label,
    }))
    setStatutOptions([{ value: 'all', label: 'Statut' }, ...options])
  }, [])


  // Load livreur options
  useEffect(() => {
    fetch('/api/admin/livreurs')
      .then(res => res.json())
      .then(data => {
        const livreurs: { id: string; nom: string; prenom: string }[] = data.livreurs || []
        const sorted = [...livreurs].sort((a, b) => {
          const an = `${a.nom} ${a.prenom}`.trim().toLowerCase()
          const bn = `${b.nom} ${b.prenom}`.trim().toLowerCase()
          return an.localeCompare(bn)
        })
        setLivreurOptions([
          { value: 'all', label: 'Livreur' },
          ...sorted.map(u => ({ value: u.id, label: `${u.nom} ${u.prenom}`.trim() || u.id })),
        ])
      })
      .catch(() => {})
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

  // Load depots for zone calculation — filtrer par depot_ids pour agent_secteur
  useEffect(() => {
    const supabase = createClient()
    let query = supabase
      .from('depots')
      .select('id, nom, latitude, longitude, rayon_couverture_km, type, agence')

    if (user?.role === 'agent_secteur' && user.depot_ids?.length) {
      query = query.in('id', user.depot_ids)
    }

    query.then(({ data }) => {
      if (data) setDepots(data as DepotWithCoords[])
    })
  }, [user])

  // Debounce pour la recherche (éviter trop de requêtes)
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 600) // 600ms pour laisser le temps de taper
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchClients = async (forceRefresh = false, page = currentPage, size = pageSize) => {
    setLoading(true)
    try {
      // Construire les paramètres de requête
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(size))

      if (forceRefresh) params.set('refresh', 'true')
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statutFilter.length > 0) params.set('statut', statutFilter.join(','))
      if (departementFilter.length > 0) params.set('departement', departementFilter.join(','))
      if (nafFilter !== 'all') params.set('naf', nafFilter)
      if (zoneFilter !== 'all') params.set('zone', zoneFilter)
      if (commercialFilter.length > 0) params.set('commercial', commercialFilter.join(','))
      if (livreurFilter.length > 0) params.set('livreur', livreurFilter.join(','))
      if (depotFilter !== 'all') params.set('depot', depotFilter)
      if (controleFilter !== 'all') params.set('controle', controleFilter)
      if (enematFilter !== 'all') params.set('enemat', enematFilter)
      if (sortBy !== 'updated_at' || sortOrder !== 'desc') {
        params.set('sortBy', sortBy)
        params.set('sortOrder', sortOrder)
      }

      const endpoint = `/api/clients?${params.toString()}`

      const response = await fetch(endpoint)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors du chargement')
      }

      setClients(result.clients || [])

      // Stocker les infos de pagination
      if (result.pagination) {
        setPagination(result.pagination)
      }

    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors du chargement des clients')
    } finally {
      setLoading(false)
    }
  }

  // Rafraîchir les données
  const handleForceRefresh = () => {
    fetchClients(true)
  }

  // Export Excel — refetch tous les clients filtres (max 5000)
  const [exportLoading, setExportLoading] = useState(false)
  const handleExportClients = async () => {
    if (exportLoading) return
    setExportLoading(true)
    try {
    const tenant = getTenantConfig()
    const today = new Date().toISOString().slice(0, 10)
    const ENEMAT_LABELS: Record<string, string> = {
      a_deposer_enemat: 'À déposer',
      depose_enemat: 'Déposé',
      apf_enemat: 'APF',
      paye_enemat: 'Payé',
    }
    const firstDeliveredDate = (r: any) => {
      const livs = Array.isArray(r.livraisons) ? r.livraisons : []
      const dates = livs
        .map((l: any) => l?.date_livraison_effective)
        .filter((d: any) => !!d)
        .sort()
      return dates[0] || ''
    }
    const params = new URLSearchParams()
    params.set('page', '1')
    params.set('pageSize', '5000')
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (statutFilter.length > 0) params.set('statut', statutFilter.join(','))
    if (departementFilter.length > 0) params.set('departement', departementFilter.join(','))
    if (nafFilter !== 'all') params.set('naf', nafFilter)
    if (zoneFilter !== 'all') params.set('zone', zoneFilter)
    if (commercialFilter.length > 0) params.set('commercial', commercialFilter.join(','))
    if (livreurFilter.length > 0) params.set('livreur', livreurFilter.join(','))
    if (depotFilter !== 'all') params.set('depot', depotFilter)
    if (controleFilter !== 'all') params.set('controle', controleFilter)
    if (enematFilter !== 'all') params.set('enemat', enematFilter)
    if (sortBy !== 'updated_at' || sortOrder !== 'desc') {
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
    }
    const res = await fetch(`/api/clients?${params.toString()}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erreur export')
    const allClients = data.clients || []
    exportToXlsx(allClients, [
      { header: 'Raison sociale', accessor: r => r.raison_sociale },
      { header: 'Réf. Retina', accessor: r => r.reference_retina },
      { header: 'Contact nom', accessor: r => r.contact_nom },
      { header: 'Contact prénom', accessor: r => r.contact_prenom },
      { header: 'Téléphone', accessor: r => r.telephone },
      { header: 'Email', accessor: r => r.email },
      { header: 'Commercial', accessor: r => (r as any).commercial?.nom || r.commercial_code || r.commercial_assigne || '' },
      { header: 'Date livraison', accessor: r => firstDeliveredDate(r) },
      { header: 'ENEMAT', accessor: r => r.in_enemat ? 'Oui' : 'Non' },
      { header: 'Statut ENEMAT', accessor: r => (r.statut_enemat && ENEMAT_LABELS[r.statut_enemat]) || '' },
      { header: 'CQ valide', accessor: r => (Array.isArray(r.livraisons) && r.livraisons.some((l: any) => l?.cq_valide)) ? 'Oui' : 'Non' },
      { header: 'Adresse', accessor: r => r.adresse_societe_ligne1 },
      { header: 'CP', accessor: r => r.adresse_societe_cp },
      { header: 'Ville', accessor: r => r.adresse_societe_ville },
      { header: 'Dépôt', accessor: r => depots.find((d: any) => d.id === (r.depot_retrait_id || r.depot_logistique_id))?.nom },
      { header: 'Département', accessor: r => r.departement },
      { header: 'Vélos validés', accessor: r => r.velo_valide || r.velo_confirme || 0 },
      { header: 'Vélos devis', accessor: r => r.velo_devis || 0 },
      { header: 'Statut', accessor: r => r.statut_commercial },
    ], `Export-Clients-${tenant.name}-${today}.xlsx`)
    toast.success(`Export Clients : ${allClients.length} lignes`)
    } catch (e: any) {
      toast.error(e?.message || 'Erreur export')
    } finally {
      setExportLoading(false)
    }
  }

  // Reset page quand les filtres ou la recherche changent
  const prevFilters = useRef({
    search: debouncedSearch,
    statut: statutFilter.join(','),
    dept: departementFilter.join(','),
    pageSize,
    naf: nafFilter,
    zone: zoneFilter,
    commercial: commercialFilter.join(','),
    livreur: livreurFilter.join(','),
    depot: depotFilter,
    controle: controleFilter,
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
      zone: zoneFilter,
      commercial: commercialFilter.join(','),
      livreur: livreurFilter.join(','),
      depot: depotFilter,
      controle: controleFilter,
      sortBy,
      sortOrder,
    }
    if (
      prev.search !== cur.search || prev.statut !== cur.statut ||
      prev.dept !== cur.dept || prev.pageSize !== cur.pageSize ||
      prev.naf !== cur.naf || prev.zone !== cur.zone ||
      prev.commercial !== cur.commercial || prev.livreur !== cur.livreur ||
      prev.depot !== cur.depot ||
      prev.controle !== cur.controle ||
      prev.sortBy !== cur.sortBy || prev.sortOrder !== cur.sortOrder
    ) {
      setCurrentPage(1)
      prevFilters.current = cur
    }
  }, [debouncedSearch, statutFilter, departementFilter, pageSize, nafFilter, zoneFilter, commercialFilter, livreurFilter, depotFilter, controleFilter, enematFilter, sortBy, sortOrder])

  // Charger les clients quand les paramètres changent (attendre que les filtres figés soient chargés)
  useEffect(() => {
    if (!filtersReady) return
    fetchClients(false, currentPage, pageSize)
  }, [currentPage, pageSize, debouncedSearch, statutFilter, departementFilter, nafFilter, zoneFilter, commercialFilter, livreurFilter, depotFilter, controleFilter, enematFilter, sortBy, sortOrder, filtersReady])

  const handleSendForm = async (client: Client) => {
    setSendingEmail(true)

    try {
      const response = await fetch('/api/admin/clients/send-formulaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'envoi')
      }

      toast.success(`Code + formulaire envoyés à ${client.email_beneficiaire || client.email}`)

      // Rafraîchir la liste
      await fetchClients()

      // Afficher le lien généré
      setGeneratedLink(result.formulaireUrl)
      setShowLinkDialog(true)

    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors de l\'envoi de l\'email')
    } finally {
      setSendingEmail(false)
      setSelectedClient(null)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    toast.success('Lien copié !')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEditClient = (client: Client) => {
    setEditingClient({ ...client })
    setShowEditDialog(true)
  }

  const handleSaveClient = async () => {
    if (!editingClient) return
    setSavingClient(true)

    try {
      const response = await fetch(`/api/admin/clients/${editingClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingClient),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la modification')
      }

      toast.success('Client modifié avec succès')
      setShowEditDialog(false)
      setEditingClient(null)
      fetchClients()
    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors de la modification')
    } finally {
      setSavingClient(false)
    }
  }

  const handleDeleteClient = async () => {
    if (!clientToDelete) return
    setDeletingClient(true)

    try {
      const response = await fetch(`/api/admin/clients/${clientToDelete.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la suppression')
      }

      toast.success('Client supprimé')
      setShowDeleteDialog(false)
      setClientToDelete(null)
      fetchClients()
    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors de la suppression')
    } finally {
      setDeletingClient(false)
    }
  }

  // === Bypass livraison ===
  const handleBypass = async () => {
    const client = bypassClient
    if (!client) return
    setBypassLoading(true)
    try {
      const res = await fetch('/api/admin/clients/bypass-livraison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur bypass')
      }
      toast.success(`${client.raison_sociale} passé en livraison directe`)
      setBypassStep(0)
      setBypassClient(null)
      setBypassLoading(false)
      // Refresh complet de la page pour être sûr
      window.location.reload()
    } catch (error: any) {
      toast.error(error.message)
      setBypassLoading(false)
    }
  }

  // === Sélection multiple ===
  const handleToggleSelect = (clientId: string) => {
    const newSelected = new Set(selectedClients)
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId)
    } else {
      newSelected.add(clientId)
    }
    setSelectedClients(newSelected)
  }

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

  // === Actions groupées ===
  const handleBulkAction = async (action: 'send_form' | 'change_status', data?: { statut?: string }) => {
    if (selectedClients.size === 0) return
    setBulkActionLoading(true)

    try {
      const response = await fetch('/api/admin/clients/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          clientIds: Array.from(selectedClients),
          data,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'action groupée')
      }

      // Afficher le résultat
      if (result.failed === 0) {
        toast.success(`Action réussie pour ${result.success} client(s)`)
      } else {
        toast.warning(`${result.success} réussi(s), ${result.failed} échec(s)`)
      }

      // Rafraîchir et effacer la sélection
      await fetchClients()
      setSelectedClients(new Set())
    } catch (error: any) {
      console.error('Erreur bulk action:', error)
      toast.error(error.message || 'Erreur lors de l\'action groupée')
    } finally {
      setBulkActionLoading(false)
    }
  }

  // Les clients sont déjà filtrés et paginés côté serveur (y compris controle)
  const paginatedClients = clients

  // Valeurs de pagination (depuis l'API ou valeurs par défaut)
  const totalPages = pagination?.totalPages || 1
  const totalFiltered = pagination?.totalFiltered || clients.length
  const startIndex = pagination?.startIndex || 1
  const endIndex = pagination?.endIndex || clients.length

  // Stats globales (chargées une fois séparément)
  const [globalStats, setGlobalStats] = useState<{
    total: number
    velosValides: number
    velosLivres: number
    statsByStatut: Record<string, { clients: number, velos: number }>
  } | null>(null)

  // Charger les stats globales une seule fois (ou au refresh)
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/clients/stats')
      if (response.ok) {
        const stats = await response.json()
        setGlobalStats(stats)
      }
    } catch (error) {
      console.error('Erreur chargement stats:', error)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  // Liste des statuts disponibles (dynamique depuis l'API stats)
  const availableStatuts = useMemo(() => {
    if (!globalStats?.statsByStatut) return []
    return Object.keys(globalStats.statsByStatut).sort((a, b) => {
      // Trier par nombre de clients décroissant
      const countA = globalStats.statsByStatut[a]?.clients || 0
      const countB = globalStats.statsByStatut[b]?.clients || 0
      return countB - countA
    })
  }, [globalStats])

  // Statuts sélectionnés pour les stats dynamiques (2 sélecteurs indépendants)
  const [selectedStatutClients, setSelectedStatutClients] = useState('')
  const [selectedStatutVelos, setSelectedStatutVelos] = useState('')

  // Initialiser les sélecteurs quand les statuts sont chargés
  useEffect(() => {
    if (availableStatuts.length > 0) {
      if (!selectedStatutClients || !globalStats?.statsByStatut?.[selectedStatutClients]) {
        setSelectedStatutClients(availableStatuts[0])
      }
      if (!selectedStatutVelos || !globalStats?.statsByStatut?.[selectedStatutVelos]) {
        setSelectedStatutVelos(availableStatuts[0])
      }
    }
  }, [availableStatuts])

  // Stats basées sur les données globales ou les données paginées
  const stats = {
    total: pagination?.totalClients || globalStats?.total || 0,
    velosValides: globalStats?.velosValides || 0,
    velosLivres: globalStats?.velosLivres || 0,
    // Stats dynamiques - clients par statut
    clientsStatut: globalStats?.statsByStatut?.[selectedStatutClients]?.clients || 0,
    // Stats dynamiques - vélos par statut (sélecteur indépendant)
    velosStatut: globalStats?.statsByStatut?.[selectedStatutVelos]?.velos || 0,
  }

  // Premier chargement seulement - afficher spinner pleine page
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

  if (initialLoad && loading) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Clients</h1>
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
        <span className="font-semibold">{pagination?.totalFiltered ?? stats.total} <span className="text-muted-foreground font-normal">clients</span></span>
        <span className="text-muted-foreground">|</span>
        <span className="font-semibold text-blue-600">{pagination?.velosValidesFiltered ?? stats.velosValides} <span className="text-muted-foreground font-normal">vélos validés</span></span>
        <span className="text-muted-foreground">|</span>
        <span className="font-semibold text-emerald-600">{stats.velosLivres} <span className="text-muted-foreground font-normal">livrés</span></span>
        <span className="text-muted-foreground hidden md:inline">|</span>
        <span className="hidden md:inline-flex items-center gap-1">
          <Select value={selectedStatutClients} onValueChange={setSelectedStatutClients}>
            <SelectTrigger className="h-6 w-auto text-xs px-2 gap-1 border-dashed">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              {availableStatuts.map((statut) => (
                <SelectItem key={statut} value={statut}>
                  {statut} ({globalStats?.statsByStatut?.[statut]?.clients || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="font-semibold text-purple-600">{stats.clientsStatut} <span className="text-muted-foreground font-normal">clients</span></span>
        </span>
        <span className="text-muted-foreground hidden md:inline">|</span>
        <span className="hidden md:inline-flex items-center gap-1">
          <Select value={selectedStatutVelos} onValueChange={setSelectedStatutVelos}>
            <SelectTrigger className="h-6 w-auto text-xs px-2 gap-1 border-dashed">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              {availableStatuts.map((statut) => (
                <SelectItem key={statut} value={statut}>
                  {statut} ({globalStats?.statsByStatut?.[statut]?.velos || 0} vélos)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="font-semibold text-amber-600">{stats.velosStatut} <span className="text-muted-foreground font-normal">vélos</span></span>
        </span>
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
        <Select value={zoneFilter} onValueChange={setZoneFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[60px] text-xs px-2 shrink-0">
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Zone</SelectItem>
            <SelectItem value="dans_la_zone">En zone</SelectItem>
            <SelectItem value="hors_zone">Hors zone</SelectItem>
          </SelectContent>
        </Select>
        <Select value={depotFilter} onValueChange={setDepotFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[70px] text-xs px-2 shrink-0">
            <SelectValue placeholder="Dépôt" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Dépôt</SelectItem>
            {depots.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CommercialFilter
          options={commerciauxParents}
          value={commercialFilter}
          onChange={setCommercialFilter}
          className="h-8 text-xs px-2"
        />
        {/* Livreur multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Livreur {livreurFilter.length > 0 && `(${livreurFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            <div className="max-h-60 overflow-y-auto">
              {livreurOptions.filter(o => o.value !== 'all').map(o => (
                <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                  <input
                    type="checkbox"
                    checked={livreurFilter.includes(o.value)}
                    onChange={(e) => {
                      setLivreurFilter(prev =>
                        e.target.checked ? [...prev, o.value] : prev.filter(v => v !== o.value)
                      )
                    }}
                    className="rounded border-gray-300"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {livreurFilter.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setLivreurFilter([])}>
                Effacer
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <Select value={controleFilter} onValueChange={setControleFilter}>
          <SelectTrigger className="h-8 w-auto min-w-[80px] text-xs px-2 shrink-0">
            <SelectValue placeholder="Contrôle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Contrôle</SelectItem>
            <SelectItem value="ok">CQ Validé</SelectItem>
            <SelectItem value="en_cours">CQ En cours</SelectItem>
            <SelectItem value="attente">CQ En attente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={enematFilter} onValueChange={setEnematFilter}>
          <SelectTrigger className={`h-8 w-auto min-w-[80px] text-xs px-2 shrink-0 ${enematFilter !== 'all' ? 'bg-violet-100 text-violet-800 border-violet-300' : ''}`}>
            <SelectValue placeholder="ENEMAT" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ENEMAT</SelectItem>
            <SelectItem value="oui">Oui</SelectItem>
            <SelectItem value="non">Non</SelectItem>
          </SelectContent>
        </Select>
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

        {user?.role !== 'livreur' && (
          <Button variant="outline" size="sm" onClick={handleExportClients} disabled={exportLoading}>
            {exportLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Export
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {paginatedClients.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucun client</h3>
              <p className="text-muted-foreground text-sm">
                {searchQuery || statutFilter.length > 0 || departementFilter.length > 0
                  ? 'Aucun client ne correspond à vos critères'
                  : 'Aucun client dans la base de données'}
              </p>
            </div>
          ) : (
            <>
            {/* Info pagination */}
            <div className="px-4 py-2 border-b flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{totalFiltered}</span> client{totalFiltered > 1 ? 's' : ''}
                {pagination && totalFiltered !== pagination.totalClients && ` / ${pagination.totalClients}`}
                {' · '}
                <span className="font-medium text-blue-600">{pagination?.velosValidesFiltered ?? 0}</span> vélos validés
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
                  <SortableHeader label="Dépôt" column="depot_logistique_id" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
                  <SortableHeader label="Zone" column="type_de_zone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
                  <SortableHeader label="Statut" column="statut_commercial" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={loading ? 'opacity-50' : ''}>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8">
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
                        <a href={`/admin/clients/${client.id}`} className="font-medium truncate block text-blue-600 hover:underline" title={client.raison_sociale}>{client.raison_sociale}</a>
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
                      <CommercialCell client={client} />
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
                    <TableCell className="hidden lg:table-cell">
                      {(() => {
                        const depot = depots.find((d: any) => d.id === (client.depot_retrait_id || client.depot_logistique_id))
                        return depot ? (
                          <Badge variant="outline" className="text-xs">{depot.nom}</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {(() => {
                        const zone = client.type_de_zone || getSimpleZoneStatus(client, depots)
                        if (zone === 'dans_la_zone') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Zone</Badge>
                        if (zone === 'hors_zone') return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">Hors zone</Badge>
                        return <span className="text-sm text-muted-foreground">-</span>
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {client.in_enemat ? (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" title="ENEMAT" />
                        ) : client.livraisons?.some((l: any) => l.cq_valide) ? (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="Contrôle qualité validé" />
                        ) : client.livraisons?.some((l: any) => l.cq_en_cours) ? (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" title="Contrôle en cours — à finaliser" />
                        ) : null}
                        {(() => {
                          const display = getStatutDisplay(client.statut_commercial)
                          return (
                            <Badge className={display.color}>
                              {display.label}
                            </Badge>
                          )
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* Voir la fiche */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.location.href = `/admin/clients/${client.id}`}
                          title="Voir la fiche"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {/* Bypass formulaire — tous les profils, sauf client HS */}
                        {!['en_livraison', 'livre', 'a_livrer', 'client_hs', 'retractation'].includes(client.statut_commercial || '') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setBypassClient(client); setBypassStep(1) }}
                            title="Passage direct en livraison (bypass formulaire)"
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          >
                            <Navigation className="h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => window.location.href = `/admin/clients/${client.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Voir la fiche
                            </DropdownMenuItem>
                            {client.statut_commercial === 'controle_valide' && ['OUI', 'ok', 'oui'].includes(client.validation_naf || '') && (client.email_beneficiaire || client.email) && (
                              <DropdownMenuItem onClick={() => setSelectedClient(client)}>
                                <Send className="h-4 w-4 mr-2" />
                                Envoyer formulaire
                              </DropdownMenuItem>
                            )}
                            {!['en_livraison', 'livre', 'a_livrer'].includes(client.statut_commercial || '') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setBypassClient(client); setBypassStep(1) }}>
                                  <Navigation className="h-4 w-4 mr-2" />
                                  Passage direct en livraison
                                </DropdownMenuItem>
                              </>
                            )}
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

      {/* Barre d'actions groupées flottante */}
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
                variant="outline"
                onClick={() => handleBulkAction('send_form')}
                disabled={bulkActionLoading}
              >
                <Send className="h-4 w-4 mr-2" />
                Envoyer formulaires
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

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedClient && !showLinkDialog} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Envoyer le formulaire</DialogTitle>
            <DialogDescription>
              Un email avec le lien du formulaire sera envoyé à :
            </DialogDescription>
          </DialogHeader>

          {selectedClient && (
            <div className="py-4">
              <div className="font-medium">{selectedClient.raison_sociale}</div>
              <div className="text-sm text-muted-foreground">
                {selectedClient.contact_prenom} {selectedClient.contact_nom}
              </div>
              <div className="text-sm text-primary">{selectedClient.email_beneficiaire || selectedClient.email}</div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedClient(null)}>
              Annuler
            </Button>
            <Button
              onClick={() => selectedClient && handleSendForm(selectedClient)}
              disabled={sendingEmail}
            >
              {sendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Envoyer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien du formulaire</DialogTitle>
            <DialogDescription>
              Vous pouvez aussi copier ce lien et l&apos;envoyer manuellement au client.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex gap-2">
              <Input
                value={generatedLink}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowLinkDialog(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      {/* Dialog édition supprimé — les données viennent de l'import, pas modifiables dans l'interface */}
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le client</DialogTitle>
            <DialogDescription>
              Modifiez les informations du client.
            </DialogDescription>
          </DialogHeader>

          {editingClient && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_raison_sociale">Raison sociale *</Label>
                  <Input
                    id="edit_raison_sociale"
                    value={editingClient.raison_sociale || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, raison_sociale: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_siret">SIRET *</Label>
                  <Input
                    id="edit_siret"
                    value={editingClient.siret || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, siret: e.target.value })}
                    maxLength={14}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_email_beneficiaire">Email bénéficiaire *</Label>
                  <Input
                    id="edit_email_beneficiaire"
                    type="email"
                    value={editingClient.email_beneficiaire || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, email_beneficiaire: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email agent</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editingClient.email || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_telephone">Téléphone</Label>
                  <Input
                    id="edit_telephone"
                    value={editingClient.telephone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, telephone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_contact_prenom">Prénom du contact</Label>
                  <Input
                    id="edit_contact_prenom"
                    value={editingClient.contact_prenom || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, contact_prenom: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_contact_nom">Nom du contact</Label>
                  <Input
                    id="edit_contact_nom"
                    value={editingClient.contact_nom || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, contact_nom: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_adresse">Adresse</Label>
                <AddressAutocomplete
                  value={editingClient.adresse_societe_ligne1 || ''}
                  onChange={(value) => setEditingClient({ ...editingClient, adresse_societe_ligne1: value })}
                  onSelect={(address) => {
                    const agence = getAgenceFromCodePostal(address.codePostal)
                    setEditingClient({
                      ...editingClient,
                      adresse_societe_ligne1: address.ligne1,
                      adresse_societe_cp: address.codePostal,
                      adresse_societe_ville: address.ville,
                      agence: agence,
                    })
                  }}
                  placeholder="Commencez à taper l'adresse..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_cp">Code postal</Label>
                  <Input
                    id="edit_cp"
                    value={editingClient.adresse_societe_cp || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, adresse_societe_cp: e.target.value })}
                    maxLength={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_ville">Ville</Label>
                  <Input
                    id="edit_ville"
                    value={editingClient.adresse_societe_ville || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, adresse_societe_ville: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_agence">Agence *</Label>
                  <Select
                    value={editingClient.agence || ''}
                    onValueChange={(value) => setEditingClient({ ...editingClient, agence: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reunion">La Réunion</SelectItem>
                      <SelectItem value="martinique">Martinique</SelectItem>
                      <SelectItem value="guadeloupe">Guadeloupe</SelectItem>
                      <SelectItem value="guyane">Guyane</SelectItem>
                      <SelectItem value="france_metro">France Métro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_velo_devis">Nb vélos *</Label>
                  <Input
                    id="edit_velo_devis"
                    type="number"
                    min={1}
                    value={editingClient.velo_devis === 0 ? '' : (editingClient.velo_devis || '')}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditingClient({ ...editingClient, velo_devis: val === '' ? 0 : parseInt(val) || 0 })
                    }}
                    onBlur={(e) => {
                      if (!e.target.value || parseInt(e.target.value) < 1) {
                        setEditingClient({ ...editingClient, velo_devis: 1 })
                      }
                    }}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit_statut">Statut commercial</Label>
                  <Select
                    value={editingClient.statut_commercial || 'inconnu'}
                    onValueChange={(value) => setEditingClient({ ...editingClient, statut_commercial: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROCESS_STATUTS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveClient}
              disabled={savingClient || !editingClient?.raison_sociale || !editingClient?.siret || !editingClient?.email_beneficiaire}
            >
              {savingClient ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le client &quot;{clientToDelete?.raison_sociale}&quot; sera définitivement supprimé ainsi que toutes ses données associées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              disabled={deletingClient}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingClient ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bypass Livraison — Double confirmation */}
      <AlertDialog open={bypassStep === 1} onOpenChange={(open) => { if (!open) { setBypassStep(0); setBypassClient(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passage direct en livraison</AlertDialogTitle>
            <AlertDialogDescription>
              Vous allez bypasser le formulaire pour <strong>{bypassClient?.raison_sociale}</strong> et le passer directement au statut &quot;À livrer&quot;. Cette action est tracée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button onClick={() => setBypassStep(2)}>
              Continuer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bypassStep === 2} onOpenChange={(open) => { if (!open && !bypassLoading) { setBypassStep(0); setBypassClient(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmation finale</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr ? Le client <strong>{bypassClient?.raison_sociale}</strong> (statut actuel : {bypassClient?.statut_commercial}) sera passé à &quot;À livrer&quot; sans formulaire.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bypassLoading}>Annuler</AlertDialogCancel>
            <Button
              onClick={handleBypass}
              disabled={bypassLoading}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {bypassLoading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Bypass en cours...</>
              ) : (
                'Confirmer le bypass'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
