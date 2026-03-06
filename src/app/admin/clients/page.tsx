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
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 250, label: '250' },
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
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [statutOptions, setStatutOptions] = useState(defaultStatutOptions)
  const [nafFilter, setNafFilter] = useState('all')
  const [departementFilter, setDepartementFilter] = useState('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [commercialFilter, setCommercialFilter] = useState('all')
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [commercialOptions, setCommercialOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Commercial' }])
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
            label: s === '__null__' ? 'Non défini' : (statutConfig[s]?.label ?? s),
          }))
          setStatutOptions([{ value: 'all', label: 'Statut' }, ...options])
        }
      })
      .catch(() => {}) // Keep defaults on error
  }, [])

  // Load commercial options
  useEffect(() => {
    const staticOpts = getStaticCommercialOptions()
    if (staticOpts) {
      setCommercialOptions([{ value: 'all', label: 'Commercial' }, ...staticOpts])
    } else {
      fetch('/api/clients/commercials')
        .then(res => res.json())
        .then((emails: string[]) => {
          if (Array.isArray(emails)) {
            setCommercialOptions([
              { value: 'all', label: 'Commercial' },
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
      setDynamicDeptOptions([{ value: 'all', label: 'Départements' }, ...staticDepts])
    } else {
      fetch('/api/clients/departements')
        .then(res => res.json())
        .then((depts: string[]) => {
          if (Array.isArray(depts)) {
            setDynamicDeptOptions([
              { value: 'all', label: 'Départements' },
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
  }, [currentPage, pageSize, debouncedSearch, statutFilter, departementFilter, dataSource, nafFilter, zoneFilter, commercialFilter, sortBy, sortOrder])

  // Sauvegarder un client (edit)
  const handleSaveClient = async () => {
    if (!editingClient) return
    setSavingClient(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('clients')
        .update({
          raison_sociale: editingClient.raison_sociale,
          email: editingClient.email,
          telephone: editingClient.telephone,
          adresse_societe_voie: editingClient.adresse_societe_voie,
          adresse_societe_cp: editingClient.adresse_societe_cp,
          adresse_societe_ville: editingClient.adresse_societe_ville,
          nombre_salaries: editingClient.nombre_salaries,
          siret: editingClient.siret,
          code_naf: editingClient.code_naf,
          nom_beneficiaire: editingClient.nom_beneficiaire,
          prenom_beneficiaire: editingClient.prenom_beneficiaire,
          email_beneficiaire: editingClient.email_beneficiaire,
          telephone_beneficiaire: editingClient.telephone_beneficiaire,
          velo_modele: editingClient.velo_modele,
          velo_taille: editingClient.velo_taille,
          velo_couleur: editingClient.velo_couleur,
          velo_options: editingClient.velo_options,
          velo_devis: editingClient.velo_devis,
          statut_commercial: editingClient.statut_commercial,
        })
        .eq('id', editingClient.id)

      if (error) throw error

      toast.success('Client mis à jour')
      setShowEditDialog(false)
      setEditingClient(null)
      fetchClients(false, currentPage, pageSize)
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSavingClient(false)
    }
  }

  // Supprimer un client
  const handleDeleteClient = async () => {
    if (!clientToDelete) return
    setDeletingClient(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientToDelete.id)

      if (error) throw error

      toast.success('Client supprimé')
      setShowDeleteDialog(false)
      setClientToDelete(null)
      fetchClients(false, currentPage, pageSize)
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la suppression')
    } finally {
      setDeletingClient(false)
    }
  }

  // Envoyer l'email avec le formulaire
  const handleSendEmail = async (client: Client) => {
    const targetEmail = client.email || client.email_beneficiaire
    if (!targetEmail) {
      toast.error('Pas d\'email disponible pour ce client')
      return
    }

    setSendingEmail(true)
    try {
      const response = await fetch('/api/formulaire/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          email: targetEmail,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error)

      toast.success(`Email envoyé à ${targetEmail}`)
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'envoi')
    } finally {
      setSendingEmail(false)
    }
  }

  // Générer un lien formulaire
  const handleGenerateLink = (client: Client) => {
    const baseUrl = window.location.origin
    const link = `${baseUrl}/formulaire?code=${client.code_enemat || ''}&client_id=${client.id}`
    setGeneratedLink(link)
    setShowLinkDialog(true)
    setCopied(false)
  }

  // Copier le lien
  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    toast.success('Lien copié !')
    setTimeout(() => setCopied(false), 2000)
  }

  // Handle sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  // Vélos validés
  const velosValidesFiltered = pagination?.velosValidesFiltered ?? clients.reduce((sum, c) => sum + (Number(c.velo_valide) || 0), 0)

  // Préparer les options de département effectives
  const effectiveDeptOptions = dynamicDeptOptions || departementOptions

  // Zone options
  const zoneOptions = [
    { value: 'all', label: 'Zone' },
    { value: 'Zone couverte', label: 'Zone couverte' },
    { value: 'Zone payante', label: 'Zone payante' },
    { value: 'Hors zone', label: 'Hors zone' },
  ]

  // Check if any filter is active
  const hasActiveFilters = statutFilter !== 'all' || departementFilter !== 'all' || nafFilter !== 'all' || zoneFilter !== 'all' || commercialFilter !== 'all' || searchQuery !== ''

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('')
    setStatutFilter('all')
    setDepartementFilter('all')
    setNafFilter('all')
    setZoneFilter('all')
    setCommercialFilter('all')
    setSortBy('updated_at')
    setSortOrder('desc')
  }

  return (
    <div className="space-y-4">
      {/* Barre de stats */}
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total clients</div>
            <div className="text-2xl font-bold">
              {pagination?.totalClients ?? '...'}
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">
              {hasActiveFilters ? 'Résultats filtrés' : 'Affichés'}
            </div>
            <div className="text-2xl font-bold">
              {pagination?.totalFiltered ?? clients.length}
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Vélos validés</div>
            <div className="text-2xl font-bold text-green-600">
              {velosValidesFiltered}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher (société, SIRET, email, tél)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        <Select value={statutFilter} onValueChange={setStatutFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            {statutOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departementFilter} onValueChange={setDepartementFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Département" />
          </SelectTrigger>
          <SelectContent>
            {effectiveDeptOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={nafFilter} onValueChange={setNafFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="NAF" />
          </SelectTrigger>
          <SelectContent>
            {nafOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={zoneFilter} onValueChange={setZoneFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            {zoneOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={commercialFilter} onValueChange={setCommercialFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Commercial" />
          </SelectTrigger>
          <SelectContent>
            {commercialOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-9 text-xs">
            <X className="h-3 w-3 mr-1" /> Réinitialiser
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleForceRefresh}
          disabled={loading}
          className="h-9"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Sync
        </Button>
      </div>

      {/* Tableau clients */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Chargement...
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Building2 className="h-8 w-8 mb-2" />
              <p>Aucun client trouvé</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={handleResetFilters} className="mt-2">
                  Réinitialiser les filtres
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedClients.size === clients.length && clients.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedClients(new Set(clients.map(c => c.id)))
                          } else {
                            setSelectedClients(new Set())
                          }
                        }}
                      />
                    </TableHead>
                    <SortableHeader label="Société" column="raison_sociale" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="min-w-[200px]" />
                    <SortableHeader label="Email" column="email" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Tél" column="telephone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Dép." column="departement" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    {tenantId !== 'ppe' && (
                      <SortableHeader label="Zone" column="type_de_zone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    )}
                    <SortableHeader label="Vélos" column="velo_devis" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Statut" column="statut_commercial" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="NAF" column="validation_naf" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Commercial" column="monday_board_id" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const statutDisplay = getStatutDisplay(client.statut_commercial)
                    // Zone: use stored value or compute on-the-fly
                    const zoneStatus = client.type_de_zone
                      ? { zone: client.type_de_zone as 'Zone couverte' | 'Zone payante' | 'Hors zone', depot: client.depot_le_plus_proche || undefined, distance: client.distance_depot_km || undefined, livraison_payante: undefined }
                      : (client.latitude && client.longitude ? getSimpleZoneStatus(client.latitude, client.longitude, depots) : null)
                    return (
                      <TableRow
                        key={client.id}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedClients.has(client.id) ? 'bg-blue-50' : ''}`}
                        onClick={() => setSelectedClient(client)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedClients.has(client.id)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedClients)
                              if (checked) newSet.add(client.id)
                              else newSet.delete(client.id)
                              setSelectedClients(newSet)
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="max-w-[200px] truncate" title={client.raison_sociale || ''}>
                            {client.raison_sociale || '-'}
                          </div>
                          {client.siret && (
                            <div className="text-xs text-muted-foreground">{client.siret}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[180px] truncate text-xs" title={client.email || ''}>
                            {client.email || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">{client.telephone || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {getDepartementLabel(client.departement || client.adresse_societe_cp?.substring(0, 3) || '-')}
                          </div>
                        </TableCell>
                        {tenantId !== 'ppe' && (
                          <TableCell>
                            {zoneStatus ? (
                              <Badge variant="outline" className={`text-xs whitespace-nowrap ${
                                zoneStatus.zone === 'Zone couverte' ? 'border-green-300 text-green-700 bg-green-50' :
                                zoneStatus.zone === 'Zone payante' ? 'border-orange-300 text-orange-700 bg-orange-50' :
                                'border-red-300 text-red-700 bg-red-50'
                              }`}>
                                {zoneStatus.zone === 'Zone couverte' ? '✓' : zoneStatus.zone === 'Zone payante' ? '€' : '✗'}
                                {zoneStatus.distance ? ` ${zoneStatus.distance}km` : ''}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="text-xs">
                            {client.velo_devis || '-'}
                            {client.velo_valide ? (
                              <span className="ml-1 text-green-600" title={`${client.velo_valide} validé(s)`}>✓{client.velo_valide}</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${statutDisplay.color}`}>
                            {statutDisplay.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {client.validation_naf === 'OUI' ? (
                            <Badge className="text-xs bg-green-100 text-green-800">✓</Badge>
                          ) : client.validation_naf === 'NON' ? (
                            <Badge className="text-xs bg-red-100 text-red-800">✗</Badge>
                          ) : client.validation_naf === 'A VERIFIER' ? (
                            <Badge className="text-xs bg-yellow-100 text-yellow-800">?</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground truncate max-w-[100px]" title={getCommercialName(client.monday_board_id || client.email || '')}>
                            {getCommercialName(client.monday_board_id || client.email || '') || '-'}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedClient(client)}>
                                <Eye className="h-4 w-4 mr-2" /> Voir
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setEditingClient({ ...client })
                                setShowEditDialog(true)
                              }}>
                                <Pencil className="h-4 w-4 mr-2" /> Modifier
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleGenerateLink(client)}>
                                <ExternalLink className="h-4 w-4 mr-2" /> Lien formulaire
                              </DropdownMenuItem>
                              {(client.email || client.email_beneficiaire) && (
                                <DropdownMenuItem onClick={() => handleSendEmail(client)}>
                                  <Send className="h-4 w-4 mr-2" /> Envoyer formulaire
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setClientToDelete(client)
                                  setShowDeleteDialog(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {pagination.startIndex}-{pagination.endIndex} sur {pagination.totalFiltered}
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {currentPage} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pagination.totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialog détail client */}
      <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedClient?.raison_sociale || 'Client'}
            </DialogTitle>
            <DialogDescription>
              {selectedClient?.siret && `SIRET: ${selectedClient.siret}`}
              {selectedClient?.code_naf && ` — NAF: ${selectedClient.code_naf}`}
            </DialogDescription>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-4">
              {/* Infos société */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email société</Label>
                  <div className="text-sm flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {selectedClient.email || '-'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Téléphone</Label>
                  <div className="text-sm flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedClient.telephone || '-'}
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Adresse</Label>
                  <div className="text-sm flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[selectedClient.adresse_societe_voie, selectedClient.adresse_societe_cp, selectedClient.adresse_societe_ville].filter(Boolean).join(', ') || '-'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Validation NAF</Label>
                  <div className="text-sm">
                    {selectedClient.validation_naf === 'OUI' ? (
                      <Badge className="bg-green-100 text-green-800">Validé</Badge>
                    ) : selectedClient.validation_naf === 'NON' ? (
                      <Badge className="bg-red-100 text-red-800">Bloqué</Badge>
                    ) : selectedClient.validation_naf === 'A VERIFIER' ? (
                      <Badge className="bg-yellow-100 text-yellow-800">À vérifier</Badge>
                    ) : (
                      '-'
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Statut commercial</Label>
                  <div className="text-sm">
                    <Badge className={getStatutDisplay(selectedClient.statut_commercial).color}>
                      {getStatutDisplay(selectedClient.statut_commercial).label}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Bénéficiaire */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">Bénéficiaire</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nom</Label>
                    <div className="text-sm">{selectedClient.nom_beneficiaire || '-'} {selectedClient.prenom_beneficiaire || ''}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <div className="text-sm">{selectedClient.email_beneficiaire || '-'}</div>
                  </div>
                </div>
              </div>

              {/* Vélo */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">Vélo</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Modèle</Label>
                    <div className="text-sm">{selectedClient.velo_modele || '-'}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Taille</Label>
                    <div className="text-sm">{selectedClient.velo_taille || '-'}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Couleur</Label>
                    <div className="text-sm">{selectedClient.velo_couleur || '-'}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Montant devis</Label>
                    <div className="text-sm">{selectedClient.velo_devis ? `${selectedClient.velo_devis} €` : '-'}</div>
                  </div>
                </div>
              </div>

              {/* Codes et identifiants */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">Identifiants</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Code ENEMAT</Label>
                    <div className="text-sm font-mono flex items-center gap-1">
                      <KeyRound className="h-3 w-3" />
                      {selectedClient.code_enemat || '-'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Réf. dossier</Label>
                    <div className="text-sm font-mono">{selectedClient.reference_dossier || '-'}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Monday Item ID</Label>
                    <div className="text-sm font-mono">{selectedClient.monday_item_id || '-'}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Monday Board</Label>
                    <div className="text-sm font-mono">
                      {getCommercialName(selectedClient.monday_board_id || '')}
                      {selectedClient.monday_board_id && (
                        <span className="text-muted-foreground ml-1">({selectedClient.monday_board_id})</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t pt-3 flex gap-2">
                <Button size="sm" onClick={() => handleGenerateLink(selectedClient)}>
                  <ExternalLink className="h-4 w-4 mr-1" /> Lien formulaire
                </Button>
                {(selectedClient.email || selectedClient.email_beneficiaire) && (
                  <Button size="sm" variant="outline" onClick={() => handleSendEmail(selectedClient)} disabled={sendingEmail}>
                    {sendingEmail ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                    Envoyer email
                  </Button>
                )}
                {selectedClient.monday_item_id && selectedClient.monday_board_id && (
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`https://crm-oreka.monday.com/boards/${selectedClient.monday_board_id}/pulses/${selectedClient.monday_item_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Navigation className="h-4 w-4 mr-1" /> Monday
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog lien formulaire */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien formulaire</DialogTitle>
            <DialogDescription>Copiez ce lien pour le partager au client</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input value={generatedLink} readOnly className="font-mono text-xs" />
            <Button size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog édition client */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditingClient(null) } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le client</DialogTitle>
            <DialogDescription>Modifiez les informations du client</DialogDescription>
          </DialogHeader>
          {editingClient && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Raison sociale</Label>
                  <Input
                    value={editingClient.raison_sociale || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, raison_sociale: e.target.value })}
                  />
                </div>
                <div>
                  <Label>SIRET</Label>
                  <Input
                    value={editingClient.siret || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, siret: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editingClient.email || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input
                    value={editingClient.telephone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, telephone: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Adresse</Label>
                  <AddressAutocomplete
                    defaultValue={[editingClient.adresse_societe_voie, editingClient.adresse_societe_cp, editingClient.adresse_societe_ville].filter(Boolean).join(', ')}
                    onSelect={(address) => {
                      setEditingClient({
                        ...editingClient,
                        adresse_societe_voie: address.voie,
                        adresse_societe_cp: address.codePostal,
                        adresse_societe_ville: address.ville,
                      })
                    }}
                  />
                </div>
                <div>
                  <Label>Code NAF</Label>
                  <Input
                    value={editingClient.code_naf || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, code_naf: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Nombre de salariés</Label>
                  <Input
                    type="number"
                    value={editingClient.nombre_salaries || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, nombre_salaries: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">Bénéficiaire</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nom</Label>
                    <Input
                      value={editingClient.nom_beneficiaire || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, nom_beneficiaire: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Prénom</Label>
                    <Input
                      value={editingClient.prenom_beneficiaire || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, prenom_beneficiaire: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={editingClient.email_beneficiaire || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, email_beneficiaire: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Téléphone</Label>
                    <Input
                      value={editingClient.telephone_beneficiaire || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, telephone_beneficiaire: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-sm font-medium mb-2">Vélo</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Modèle</Label>
                    <Input
                      value={editingClient.velo_modele || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, velo_modele: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Taille</Label>
                    <Input
                      value={editingClient.velo_taille || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, velo_taille: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Couleur</Label>
                    <Input
                      value={editingClient.velo_couleur || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, velo_couleur: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Montant devis (€)</Label>
                    <Input
                      type="number"
                      value={editingClient.velo_devis || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, velo_devis: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <Label>Statut commercial</Label>
                <Select
                  value={editingClient.statut_commercial || 'inconnu'}
                  onValueChange={(v) => setEditingClient({ ...editingClient, statut_commercial: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statutConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingClient(null) }}>Annuler</Button>
            <Button onClick={handleSaveClient} disabled={savingClient}>
              {savingClient ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog suppression */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le client &quot;{clientToDelete?.raison_sociale}&quot; sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClient} disabled={deletingClient} className="bg-red-600 hover:bg-red-700">
              {deletingClient ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
