'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdminUser } from '@/components/admin/admin-user-provider'
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
import { Loader2, Search, Filter, Building2, MapPin, Send, Mail, ExternalLink, Copy, Check, RefreshCw, Pencil, Trash2, MoreHorizontal, Navigation, Eye, Phone, KeyRound, X, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
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
import { getTenantId } from '@/lib/tenants'
import { getCommercialName, getDepartementLabel, getStaticDepartementOptions, getStaticCommercialOptions } from '@/lib/tenants/commercial'
import { getSimpleZoneStatus, type DepotWithCoords } from '@/lib/geo/utils'

// Options filtre NAF (ENEMAT)
const nafOptions = [
  { value: 'all', label: 'Tous les NAF' },
  { value: 'valide', label: 'NAF Validé' },
  { value: 'bloque', label: 'NAF Bloqué' },
  { value: 'en_attente', label: 'NAF En attente' },
]

// Statuts pour filtre - chargés dynamiquement depuis l'API
const defaultStatutOptions = [{ value: 'all', label: 'Tous les statuts' }]

// Départements - clés Supabase (codes postaux DOM-TOM)
const departementOptions = [
  { value: 'all', label: 'Tous les départements' },
  { value: '974', label: 'La Réunion (974)' },
  { value: '972', label: 'Martinique (972)' },
  { value: '971', label: 'Guadeloupe (971)' },
  { value: '973', label: 'Guyane (973)' },
  { value: '976', label: 'Mayotte (976)' },
  { value: 'hors_dom', label: 'Hors DOM' },
]

// Mapping Supabase -> label Monday et couleur
const statutConfig: Record<string, { label: string; color: string }> = {
  dossier_complet: { label: 'DOSSIER COMPLET', color: 'bg-lime-100 text-lime-800' },
  devis_signe: { label: 'DEVIS SIGNÉ', color: 'bg-green-100 text-green-800' },
  devis_cree: { label: 'DEVIS CREE', color: 'bg-blue-100 text-blue-800' },
  controle_valide: { label: 'CONTROLE VALIDÉ', color: 'bg-purple-100 text-purple-800' },
  controle_a_regulariser: { label: 'CONTROLE A REGULARISER', color: 'bg-pink-100 text-pink-800' },
  controle_a_jour: { label: 'CONTROLE A JOUR', color: 'bg-fuchsia-100 text-fuchsia-800' },
  client_contacte: { label: 'CLIENT CONTACTÉ', color: 'bg-sky-100 text-sky-800' },
  client_injoignable: { label: 'CLIENT INJOIGNABLE', color: 'bg-violet-100 text-violet-800' },
  client_hs: { label: 'CLIENT HS', color: 'bg-red-100 text-red-800' },
  ah_signee: { label: 'AH SIGNÉE', color: 'bg-yellow-100 text-yellow-800' },
  livre: { label: 'LIVRÉ', color: 'bg-emerald-100 text-emerald-800' },
  paye: { label: 'PAYÉ', color: 'bg-amber-100 text-amber-800' },
  doublon: { label: 'DOUBLON', color: 'bg-rose-100 text-rose-800' },
  inconnu: { label: 'Inconnu', color: 'bg-gray-100 text-gray-800' },
  franck: { label: 'FRANCK', color: 'bg-orange-100 text-orange-800' },
  code_envoye: { label: 'CODE ENVOYÉ', color: 'bg-indigo-100 text-indigo-800' },
  formulaire_envoye: { label: 'FORMULAIRE ENVOYÉ', color: 'bg-cyan-100 text-cyan-800' },
  formulaire_valide: { label: 'FORMULAIRE VALIDÉ', color: 'bg-teal-100 text-teal-800' },
  a_livrer: { label: 'À LIVRER', color: 'bg-orange-100 text-orange-800' },
  en_livraison: { label: 'EN LIVRAISON', color: 'bg-blue-200 text-blue-900' },
}

// Helper pour obtenir le label et la couleur d'un statut
function getStatutDisplay(statut: string | null | undefined): { label: string; color: string } {
  if (!statut) return { label: 'Inconnu', color: 'bg-gray-100 text-gray-800' }
  return statutConfig[statut] || { label: statut, color: 'bg-gray-100 text-gray-800' }
}

// Options de pagination
const pageSizeOptions = [
  { value: 20, label: '20 par page' },
  { value: 50, label: '50 par page' },
  { value: 100, label: '100 par page' },
  { value: 250, label: '250 par page' },
  { value: 500, label: '500 par page' },
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
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [statutOptions, setStatutOptions] = useState(defaultStatutOptions)
  const [nafFilter, setNafFilter] = useState('all')
  const [departementFilter, setDepartementFilter] = useState('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [commercialFilter, setCommercialFilter] = useState('all')
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [commercialOptions, setCommercialOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Tous les commerciaux' }])
  const [dynamicDeptOptions, setDynamicDeptOptions] = useState<{value: string; label: string}[] | null>(null)
  const [depots, setDepots] = useState<DepotWithCoords[]>([])
  const tenantId = getTenantId()

  // Pagination côté serveur
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

  // Sélection multiple
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  // Source de données: Supabase (cache rapide) ou Monday (source de vérité)
  // Par défaut Supabase car beaucoup plus rapide
  const [dataSource, setDataSource] = useState<'monday' | 'supabase'>('supabase')

  // Info cache
  const [cacheInfo, setCacheInfo] = useState<{
    cached: boolean
    cacheAge: number
    cacheExpiresIn: number
  } | null>(null)

  // Charger les statuts dynamiquement depuis l'API
  useEffect(() => {
    fetch('/api/clients/statuses')
      .then(res => res.json())
      .then((statuses: string[]) => {
        if (Array.isArray(statuses)) {
          const options = statuses.map(s => ({
            value: s,
            label: statutConfig[s]?.label ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          }))
          setStatutOptions([{ value: 'all', label: 'Tous les statuts' }, ...options])
        }
      })
      .catch(() => {}) // Keep defaults on error
  }, [])

  // Load commercial options
  useEffect(() => {
    const staticOpts = getStaticCommercialOptions()
    if (staticOpts) {
      setCommercialOptions([{ value: 'all', label: 'Tous les commerciaux' }, ...staticOpts])
    } else {
      fetch('/api/clients/commercials')
        .then(res => res.json())
        .then((emails: string[]) => {
          if (Array.isArray(emails)) {
            setCommercialOptions([
              { value: 'all', label: 'Tous les commerciaux' },
              ...emails.map(e => ({ value: e, label: e }))
            ])
          }
        })
        .catch(() => {})
    }
  }, [])

  // Load dynamic department options
  useEffect(() => {
    const staticDepts = getStaticDepartementOptions()
    if (staticDepts) {
      setDynamicDeptOptions([{ value: 'all', label: 'Tous les departements' }, ...staticDepts])
    } else {
      fetch('/api/clients/departements')
        .then(res => res.json())
        .then((depts: string[]) => {
          if (Array.isArray(depts)) {
            setDynamicDeptOptions([
              { value: 'all', label: 'Tous les departements' },
              ...depts.map(d => ({ value: d, label: d }))
            ])
          }
        })
        .catch(() => {})
    }
  }, [])

  // Load depots for zone calculation
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('depots')
      .select('id, nom, latitude, longitude, rayon_couverture_km, rayon_livraison_payant_km, prix_livraison_payante, type, agence')
      .then(({ data }) => {
        if (data) setDepots(data as DepotWithCoords[])
      })
  }, [])

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
      if (statutFilter !== 'all') params.set('statut', statutFilter)
      if (departementFilter !== 'all') params.set('departement', departementFilter)
      if (nafFilter !== 'all') params.set('naf', nafFilter)
      if (zoneFilter !== 'all') params.set('zone', zoneFilter)
      if (commercialFilter !== 'all') params.set('commercial', commercialFilter)
      if (sortBy !== 'updated_at' || sortOrder !== 'desc') {
        params.set('sortBy', sortBy)
        params.set('sortOrder', sortOrder)
      }

      // Choisir l'API selon la source de données
      // - supabase: /api/clients (cache local, rapide)
      // - monday: /api/monday/clients (source de vérité, plus lent)
      const endpoint = dataSource === 'supabase'
        ? `/api/clients?${params.toString()}`
        : `/api/monday/clients?${params.toString()}`

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

      // Stocker les infos de cache (uniquement pour Monday)
      if (result.cached !== undefined) {
        setCacheInfo({
          cached: result.cached,
          cacheAge: result.cacheAge || 0,
          cacheExpiresIn: result.cacheExpiresIn || 0,
        })
      } else {
        setCacheInfo(null)
      }

      const sourceLabel = result.source === 'supabase' ? 'Supabase' : 'Monday'
      console.log(`✓ ${result.pagination?.totalFiltered || result.clients?.length} clients chargés depuis ${sourceLabel}`)

      if (forceRefresh && dataSource === 'monday') {
        toast.success('Données rafraîchies depuis Monday')
      }
    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors du chargement des clients')

      // Fallback: si Supabase échoue, essayer Monday
      if (dataSource === 'supabase') {
        toast.info('Tentative de chargement depuis Monday...')
        setDataSource('monday')
      }
    } finally {
      setLoading(false)
    }
  }

  // Rafraîchir depuis Monday (ignorer le cache)
  const handleForceRefresh = () => {
    fetchClients(true)
  }

  // Reset page quand les filtres ou la recherche changent
  const [prevSearch, setPrevSearch] = useState(debouncedSearch)
  const [prevStatut, setPrevStatut] = useState(statutFilter)
  const [prevDept, setPrevDept] = useState(departementFilter)
  const [prevPageSize, setPrevPageSize] = useState(pageSize)
  const [prevNaf, setPrevNaf] = useState(nafFilter)
  const [prevZone, setPrevZone] = useState(zoneFilter)
  const [prevCommercial, setPrevCommercial] = useState(commercialFilter)
  const [prevSortBy, setPrevSortBy] = useState(sortBy)
  const [prevSortOrder, setPrevSortOrder] = useState(sortOrder)

  useEffect(() => {
    // Detect filter change (not page)
    if (debouncedSearch !== prevSearch || statutFilter !== prevStatut ||
        departementFilter !== prevDept || pageSize !== prevPageSize ||
        nafFilter !== prevNaf || zoneFilter !== prevZone ||
        commercialFilter !== prevCommercial || sortBy !== prevSortBy || sortOrder !== prevSortOrder) {
      setCurrentPage(1) // Reset to page 1
      setPrevSearch(debouncedSearch)
      setPrevStatut(statutFilter)
      setPrevDept(departementFilter)
      setPrevPageSize(pageSize)
      setPrevNaf(nafFilter)
      setPrevZone(zoneFilter)
      setPrevCommercial(commercialFilter)
      setPrevSortBy(sortBy)
      setPrevSortOrder(sortOrder)
    }
  }, [debouncedSearch, statutFilter, departementFilter, pageSize, nafFilter, zoneFilter, commercialFilter, sortBy, sortOrder])

  // Charger les clients quand les paramètres changent
  useEffect(() => {
    fetchClients(false, currentPage, pageSize)
  }, [dataSource, currentPage, pageSize, debouncedSearch, statutFilter, departementFilter, nafFilter, zoneFilter, commercialFilter, sortBy, sortOrder])

  const handleSendForm = async (client: Client) => {
    setSendingEmail(true)

    try {
      const response = await fetch('/api/clients/send-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'envoi')
      }

      toast.success(`Email envoyé à ${client.email}`)

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

  const handleClearSelection = () => {
    setSelectedClients(new Set())
  }

  // === Actions groupées ===
  const handleBulkAction = async (action: 'send_code' | 'send_form' | 'change_status', data?: { statut?: string }) => {
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

  // Les clients sont déjà filtrés et paginés côté serveur
  // On utilise directement la liste reçue
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
      // Utiliser l'API Supabase pour les stats (plus rapide)
      // ou Monday si on est en mode Monday
      const statsEndpoint = dataSource === 'supabase'
        ? '/api/clients/stats'
        : '/api/monday/clients/stats'

      const response = await fetch(statsEndpoint)
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
  }, [dataSource])

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
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground">
            Gérez les dossiers clients et envoyez les formulaires
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Indicateur source de données et cache */}
          {dataSource === 'monday' && cacheInfo && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {cacheInfo.cached ? (
                <Badge variant="outline" className="text-xs">
                  Cache ({Math.floor(cacheInfo.cacheAge / 60)}:{String(cacheInfo.cacheAge % 60).padStart(2, '0')})
                </Badge>
              ) : (
                <Badge variant="default" className="bg-green-500 text-xs">
                  Live
                </Badge>
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleForceRefresh}
            disabled={loading}
            title="Rafraîchir depuis Monday"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total clients */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total clients</div>
          </CardContent>
        </Card>

        {/* Vélos validés (total) */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-blue-600">{stats.velosValides}</div>
            <div className="text-sm text-muted-foreground">Vélos validés</div>
          </CardContent>
        </Card>

        {/* Vélos livrés (total) */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.velosLivres}</div>
            <div className="text-sm text-muted-foreground">Vélos livrés</div>
          </CardContent>
        </Card>

        {/* Sélecteur de statut + Clients de ce statut */}
        <Card>
          <CardContent className="pt-3 pb-3">
            <Select value={selectedStatutClients} onValueChange={setSelectedStatutClients}>
              <SelectTrigger className="h-7 text-xs mb-2">
                <SelectValue placeholder="Choisir un statut" />
              </SelectTrigger>
              <SelectContent>
                {availableStatuts.map((statut) => (
                  <SelectItem key={statut} value={statut}>
                    {statut} ({globalStats?.statsByStatut?.[statut]?.clients || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-2xl font-bold text-purple-600">{stats.clientsStatut}</div>
            <div className="text-sm text-muted-foreground">Clients</div>
          </CardContent>
        </Card>

        {/* Sélecteur de statut + Vélos de ce statut */}
        <Card>
          <CardContent className="pt-3 pb-3">
            <Select value={selectedStatutVelos} onValueChange={setSelectedStatutVelos}>
              <SelectTrigger className="h-7 text-xs mb-2">
                <SelectValue placeholder="Choisir un statut" />
              </SelectTrigger>
              <SelectContent>
                {availableStatuts.map((statut) => (
                  <SelectItem key={statut} value={statut}>
                    {statut} ({globalStats?.statsByStatut?.[statut]?.velos || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-2xl font-bold text-amber-600">{stats.velosStatut}</div>
            <div className="text-sm text-muted-foreground">Vélos</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, SIRET ou email..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="w-full lg:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                {statutOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={departementFilter} onValueChange={setDepartementFilter}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Département" />
              </SelectTrigger>
              <SelectContent>
                {(dynamicDeptOptions || [{ value: 'all', label: 'Tous les departements' }]).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={nafFilter} onValueChange={setNafFilter}>
              <SelectTrigger className="w-full lg:w-48">
                <Filter className="h-4 w-4 mr-2" />
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
              <SelectTrigger className="w-full lg:w-48">
                <MapPin className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les zones</SelectItem>
                <SelectItem value="dans_la_zone">Dans la zone</SelectItem>
                <SelectItem value="hors_zone">Hors zone</SelectItem>
              </SelectContent>
            </Select>
            <Select value={commercialFilter} onValueChange={setCommercialFilter}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Commercial" />
              </SelectTrigger>
              <SelectContent>
                {commercialOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Selecteur nombre par page */}
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-full lg:w-40">
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
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {paginatedClients.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucun client</h3>
              <p className="text-muted-foreground text-sm">
                {searchQuery || statutFilter !== 'all' || departementFilter !== 'all'
                  ? 'Aucun client ne correspond à vos critères'
                  : 'Les clients apparaîtront ici après synchronisation avec Monday'}
              </p>
            </div>
          ) : (
            <>
            {/* Info pagination */}
            <div className="px-4 py-3 border-b flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {totalFiltered} client{totalFiltered > 1 ? 's' : ''} trouvé{totalFiltered > 1 ? 's' : ''}
                {pagination && totalFiltered !== pagination.totalClients && ` (sur ${pagination.totalClients} total)`}
              </span>
              <span>
                Page {currentPage} sur {totalPages}
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
                  <SortableHeader label="Email client" column="email_beneficiaire" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden xl:table-cell" />
                  <SortableHeader label="Téléphone" column="telephone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden xl:table-cell" />
                  <SortableHeader label="Commercial" column="monday_board_id" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
                  <SortableHeader label="Dép." column="departement" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="Velos" column="velo_devis" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="NAF" column="validation_naf" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableHeader label="Statut" column="statut_commercial" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Zone" column="type_de_zone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
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
                    <TableCell>
                      <div>
                        <div className="font-medium">{client.raison_sociale}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {client.siret || '-'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="text-sm">
                        {(client.email_beneficiaire || client.email) ? (
                          <div className="text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {client.email_beneficiaire || client.email}
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
                        const display = getStatutDisplay(client.statut_commercial)
                        return (
                          <Badge className={display.color}>
                            {display.label}
                          </Badge>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {(() => {
                        const zone = client.type_de_zone || getSimpleZoneStatus(client, depots)
                        if (zone === 'dans_la_zone') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Zone</Badge>
                        if (zone === 'hors_zone') return <Badge variant="outline" className="text-xs text-muted-foreground">Hors zone</Badge>
                        return <span className="text-sm text-muted-foreground">-</span>
                      })()}
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
                            <DropdownMenuItem onClick={() => handleEditClient(client)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            {client.email && (
                              <DropdownMenuItem onClick={() => setSelectedClient(client)}>
                                <Send className="h-4 w-4 mr-2" />
                                Envoyer formulaire
                              </DropdownMenuItem>
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
                onClick={() => handleBulkAction('send_code')}
                disabled={bulkActionLoading}
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Envoyer codes
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction('send_form')}
                disabled={bulkActionLoading}
              >
                <Send className="h-4 w-4 mr-2" />
                Envoyer formulaires
              </Button>
              <Select
                onValueChange={(value) => handleBulkAction('change_status', { statut: value })}
                disabled={bulkActionLoading}
              >
                <SelectTrigger className="w-52 h-9">
                  <SelectValue placeholder="Changer statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dossier_complet">Dossier complet</SelectItem>
                  <SelectItem value="devis_signe">Devis signé</SelectItem>
                  <SelectItem value="controle_valide">Contrôle validé</SelectItem>
                  <SelectItem value="controle_a_regulariser">Contrôle à régulariser</SelectItem>
                  <SelectItem value="client_contacte">Client contacté</SelectItem>
                  <SelectItem value="client_injoignable">Client injoignable</SelectItem>
                  <SelectItem value="code_envoye">Code envoyé</SelectItem>
                  <SelectItem value="formulaire_envoye">Formulaire envoyé</SelectItem>
                  <SelectItem value="formulaire_valide">Formulaire validé</SelectItem>
                  <SelectItem value="livre">Livré</SelectItem>
                </SelectContent>
              </Select>
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
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px]">
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
                      <SelectItem value="dossier_complet">Dossier complet</SelectItem>
                      <SelectItem value="devis_signe">Devis signé</SelectItem>
                      <SelectItem value="devis_cree">Devis créé</SelectItem>
                      <SelectItem value="controle_valide">Contrôle validé</SelectItem>
                      <SelectItem value="controle_a_regulariser">Contrôle à régulariser</SelectItem>
                      <SelectItem value="controle_a_jour">Contrôle à jour</SelectItem>
                      <SelectItem value="client_contacte">Client contacté</SelectItem>
                      <SelectItem value="client_injoignable">Client injoignable</SelectItem>
                      <SelectItem value="client_hs">Client HS</SelectItem>
                      <SelectItem value="ah_signee">AH signée</SelectItem>
                      <SelectItem value="livre">Livré</SelectItem>
                      <SelectItem value="paye">Payé</SelectItem>
                      <SelectItem value="doublon">Doublon</SelectItem>
                      <SelectItem value="code_envoye">Code envoyé</SelectItem>
                      <SelectItem value="formulaire_envoye">Formulaire envoyé</SelectItem>
                      <SelectItem value="formulaire_valide">Formulaire validé</SelectItem>
                      <SelectItem value="inconnu">Inconnu</SelectItem>
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
    </div>
  )
}
