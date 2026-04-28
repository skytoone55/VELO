'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Loader2,
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  CheckCircle2,
  Circle,
  Mail,
  FileText,
  Wallet,
  Truck,
  UserCog,
  X,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { getCommercialName } from '@/lib/tenants/commercial'
import { getTenantId } from '@/lib/tenants'

// =====================================================
// Types
// =====================================================
interface PaiementClient {
  id: string
  raison_sociale: string | null
  reference_retina: string | null
  telephone: string | null
  email: string | null
  adresse_societe_ligne1: string | null
  adresse_societe_cp: string | null
  adresse_societe_ville: string | null
  departement: string | null
  commercial_assigne: string | null
  commercial_code: string | null
  monday_board_id: string | null
  depot_retrait_id: string | null
  depot_logistique_id: string | null
  paiement_livreur_id: string | null
  statut_enemat: string | null
  date_depot_enemat: string | null
  date_apf_enemat: string | null
  date_paye_enemat: string | null
  // Champs virtuels (calcules server-side depuis statut_enemat)
  enemat_paye: boolean | null
  enemat_paye_le: string | null
  commercial_apf_envoye: boolean | null
  commercial_apf_envoye_le: string | null
  commercial_paye: boolean | null
  commercial_paye_le: string | null
  livreur_apf_envoye: boolean | null
  livreur_apf_envoye_le: string | null
  livreur_paye: boolean | null
  livreur_paye_le: string | null
  paiement_notes: string | null
  numero_lot_enemat: string | null
  numero_facture_enemat: string | null
  velo_valide: number | null
  depot?: { id: string; nom: string } | null
  commercial?: { code: string; nom: string; parent_code: string | null } | null
  livreur?: { id: string; nom: string; prenom: string; email: string } | null
}

interface DepotOption {
  id: string
  nom: string
}

interface LivreurOption {
  id: string
  nom: string
  prenom: string
  depot_id?: string | null
  depot_ids?: string[] | null
}

interface CommercialOption {
  id: string
  code: string
  nom: string
  parent_code: string | null
  enfants?: CommercialOption[]
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

// =====================================================
// Helpers
// =====================================================
function formatDate(d: string | null | undefined): string {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type TriState = 'all' | 'oui' | 'non'

function triLabel(v: TriState): string {
  if (v === 'oui') return 'Oui'
  if (v === 'non') return 'Non'
  return 'Tous'
}

// Badge 3 états : vert = payé, orange = APF envoyé, gris = à faire
function StatusBadge({
  paye,
  apfEnvoye,
  label,
}: {
  paye: boolean | null
  apfEnvoye?: boolean | null
  label: string
}) {
  if (paye) {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        {label} payé
      </Badge>
    )
  }
  if (apfEnvoye) {
    return (
      <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200">
        <Mail className="h-3 w-3 mr-1" />
        APF envoyé
      </Badge>
    )
  }
  return (
    <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200">
      <Circle className="h-3 w-3 mr-1" />
      {label} à faire
    </Badge>
  )
}

// Badge ENEMAT : miroir du statut du module ENEMAT (lecture seule)
// 4 valeurs : a_deposer / depose / apf / paye — couleurs alignees sur la page ENEMAT
function EnematBadge({ statut }: { statut: string | null }) {
  if (statut === 'paye_enemat') {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Payé
      </Badge>
    )
  }
  if (statut === 'apf_enemat') {
    return (
      <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-indigo-200">
        <Mail className="h-3 w-3 mr-1" />
        APF reçu
      </Badge>
    )
  }
  if (statut === 'depose_enemat') {
    return (
      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200">
        <Circle className="h-3 w-3 mr-1" />
        Déposé
      </Badge>
    )
  }
  if (statut === 'a_deposer_enemat') {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200">
        <Circle className="h-3 w-3 mr-1" />
        À déposer
      </Badge>
    )
  }
  return (
    <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200">
      <Circle className="h-3 w-3 mr-1" />
      —
    </Badge>
  )
}

// Filtre ENEMAT : 4 statuts visibles dans Paiements (a_deposer exclu cote API)
type EnematStatutFiltre = 'all' | 'depose_enemat' | 'apf_enemat' | 'paye_enemat'

const ENEMAT_FILTRE_OPTIONS: { value: EnematStatutFiltre; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'depose_enemat', label: 'Déposé' },
  { value: 'apf_enemat', label: 'APF reçu' },
  { value: 'paye_enemat', label: 'Payé' },
]

function enematFiltreLabel(v: EnematStatutFiltre): string {
  return ENEMAT_FILTRE_OPTIONS.find(o => o.value === v)?.label ?? 'Tous'
}

// =====================================================
// Main page
// =====================================================
export default function AdminPaiementsPage() {
  const user = useAdminUser()
  const router = useRouter()
  const tenantId = getTenantId()

  // Garde-fou acces super_admin (double de admin-nav + layout, defense en profondeur)
  useEffect(() => {
    if (user && user.role !== 'super_admin' && !user.is_super_admin) {
      toast.error('Accès réservé au super admin')
      router.replace('/admin')
    }
  }, [user, router])

  // Data
  const [clients, setClients] = useState<PaiementClient[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 1 })

  // Lookups
  const [depots, setDepots] = useState<DepotOption[]>([])
  const [livreurs, setLivreurs] = useState<LivreurOption[]>([])
  const [commerciaux, setCommerciaux] = useState<CommercialOption[]>([])

  // Filtres
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [depotFilter, setDepotFilter] = useState<string[]>([])
  const [zoneFilter, setZoneFilter] = useState<string[]>([])
  const [livreurFilter, setLivreurFilter] = useState<string[]>([])
  const [commercialFilter, setCommercialFilter] = useState<string[]>([])
  const [enematFilter, setEnematFilter] = useState<EnematStatutFiltre>('all')
  const [commercialPayeFilter, setCommercialPayeFilter] = useState<TriState>('all')
  const [livreurPayeFilter, setLivreurPayeFilter] = useState<TriState>('all')
  const [commercialApfFilter, setCommercialApfFilter] = useState<TriState>('all')
  const [livreurApfFilter, setLivreurApfFilter] = useState<TriState>('all')
  const [lotFilter, setLotFilter] = useState<string>('')
  const [factureFilter, setFactureFilter] = useState<string>('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [totalVelosValides, setTotalVelosValides] = useState(0)

  // Sélection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  // Dialogs
  const [showAttribLivreurDialog, setShowAttribLivreurDialog] = useState(false)
  const [livreurDialogValue, setLivreurDialogValue] = useState<string>('')
  // Contexte du dialog : soit bulk (selectedIds), soit single (un clientId explicite)
  const [livreurDialogTargetIds, setLivreurDialogTargetIds] = useState<string[]>([])
  const [showCommercialDialog, setShowCommercialDialog] = useState(false)
  const [commercialDialogValue, setCommercialDialogValue] = useState<string>('')

  // Filtres figés
  const { loadPinned, saveFilters } = usePinnedFilters(user?.id, 'paiements')
  const [isPinned, setIsPinned] = useState(false)
  const pinnedLoaded = useRef(false)
  const [filtersReady, setFiltersReady] = useState(false)

  // ========== Load pinned on mount ==========
  useEffect(() => {
    if (pinnedLoaded.current) return
    pinnedLoaded.current = true
    const pinned = loadPinned()
    if (pinned) {
      setIsPinned(true)
      // Retrocompat : anciens filtres stockes en string ('all' = rien) -> array
      const toArr = (v: any): string[] => {
        if (Array.isArray(v)) return v
        if (typeof v === 'string' && v && v !== 'all') return [v]
        return []
      }
      if (pinned.depot !== undefined) setDepotFilter(toArr(pinned.depot))
      if (pinned.zone !== undefined) setZoneFilter(toArr(pinned.zone))
      if (pinned.livreur !== undefined) setLivreurFilter(toArr(pinned.livreur))
      if (pinned.commercial !== undefined) setCommercialFilter(toArr(pinned.commercial))
      if (pinned.enemat) {
        // Retrocompat : ancien tri-state ('oui'/'non'/'all') -> nouveau filtre 4 valeurs
        const v = pinned.enemat
        if (v === 'oui') setEnematFilter('paye_enemat')
        else if (v === 'depose_enemat' || v === 'apf_enemat' || v === 'paye_enemat' || v === 'all') {
          setEnematFilter(v)
        }
        // 'non' ou autre -> on garde 'all' (defaut)
      }
      if (pinned.commercialPaye) setCommercialPayeFilter(pinned.commercialPaye)
      if (pinned.livreurPaye) setLivreurPayeFilter(pinned.livreurPaye)
      if (pinned.pageSize) setPageSize(pinned.pageSize)
    }
    setFiltersReady(true)
  }, [loadPinned])

  const handlePinFilters = () => {
    saveFilters({
      depot: depotFilter,
      zone: zoneFilter,
      livreur: livreurFilter,
      commercial: commercialFilter,
      enemat: enematFilter,
      commercialPaye: commercialPayeFilter,
      livreurPaye: livreurPayeFilter,
      pageSize,
    })
    setIsPinned(true)
    toast.success('Filtres figés comme vue par défaut')
  }

  // ========== Load dépôts ==========
  useEffect(() => {
    fetch('/api/admin/depots')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.depots)) setDepots(d.depots)
      })
      .catch(() => {})
  }, [])

  // ========== Load commerciaux ==========
  useEffect(() => {
    fetch(`/api/admin/commerciaux?tenant=${tenantId}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.parents)) {
          setCommerciaux(d.parents)
        }
      })
      .catch(() => {})
  }, [tenantId])

  // ========== Load livreurs (users_profile) + depots associes ==========
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('users_profile')
      .select('id, nom, prenom, depot_id, depot_ids')
      .or('role.eq.livreur,and(role.eq.agent_secteur,est_aussi_livreur.eq.true)')
      .eq('actif', true)
      .order('nom')
      .then(({ data }) => {
        if (data) setLivreurs(data as LivreurOption[])
      })
  }, [])

  // ========== Debounce recherche ==========
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 500)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Reset page 1 quand filtres changent
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, depotFilter, zoneFilter, livreurFilter, commercialFilter, enematFilter, commercialPayeFilter, livreurPayeFilter, commercialApfFilter, livreurApfFilter, lotFilter, factureFilter, pageSize])

  // ========== Fetch clients ==========
  const fetchClients = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(currentPage))
      params.set('limit', String(pageSize))
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (depotFilter.length > 0) params.set('depot_ids', depotFilter.join(','))
      if (zoneFilter.length > 0) params.set('zone', zoneFilter.join(','))
      if (livreurFilter.length > 0) params.set('livreur_ids', livreurFilter.join(','))
      if (commercialFilter.length > 0) params.set('commercial_codes', commercialFilter.join(','))
      if (enematFilter !== 'all') params.set('statut_enemat', enematFilter)
      if (commercialPayeFilter !== 'all') params.set('commercial_paye', commercialPayeFilter === 'oui' ? 'true' : 'false')
      if (livreurPayeFilter !== 'all') params.set('livreur_paye', livreurPayeFilter === 'oui' ? 'true' : 'false')
      if (commercialApfFilter !== 'all') params.set('commercial_apf_envoye', commercialApfFilter === 'oui' ? 'true' : 'false')
      if (livreurApfFilter !== 'all') params.set('livreur_apf_envoye', livreurApfFilter === 'oui' ? 'true' : 'false')
      if (lotFilter) params.set('lot', lotFilter)
      if (factureFilter) params.set('facture', factureFilter)

      const res = await fetch(`/api/admin/paiements?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur chargement')

      setClients(data.clients || [])
      setTotalVelosValides(data.totalVelosValides || 0)
      setPagination({
        page: data.page || 1,
        limit: data.limit || pageSize,
        total: data.total || 0,
        totalPages: Math.max(1, Math.ceil((data.total || 0) / (data.limit || pageSize))),
      })
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!filtersReady) return
    fetchClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, debouncedSearch, depotFilter, zoneFilter, livreurFilter, commercialFilter, enematFilter, commercialPayeFilter, livreurPayeFilter, commercialApfFilter, livreurApfFilter, lotFilter, factureFilter, filtersReady])

  // ========== Sélection ==========
  const allSelectedOnPage = clients.length > 0 && clients.every(c => selectedIds.has(c.id))
  const toggleSelectAll = () => {
    const next = new Set(selectedIds)
    if (allSelectedOnPage) {
      clients.forEach(c => next.delete(c.id))
    } else {
      clients.forEach(c => next.add(c.id))
    }
    setSelectedIds(next)
  }
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // ========== Bulk actions ==========
  const runBulkOnIds = async (
    ids: string[],
    updates: Record<string, any>,
    successMsg: string
  ) => {
    if (ids.length === 0) {
      toast.error('Aucune ligne sélectionnée')
      return
    }
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/paiements/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: ids, updates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur mise à jour')
      const alreadyDone = data.alreadyDone || 0
      let msg = `${successMsg} — ${data.updated} ligne(s) mise(s) à jour`
      if (alreadyDone > 0) msg += ` · ${alreadyDone} déjà traité(s), ignoré(s)`
      toast.success(msg)
      setSelectedIds(new Set())
      await fetchClients()
    } catch (e: any) {
      toast.error(e.message || 'Erreur mise à jour')
    } finally {
      setBulkLoading(false)
    }
  }

  const runBulk = (updates: Record<string, any>, successMsg: string) =>
    runBulkOnIds(Array.from(selectedIds), updates, successMsg)

  // ========== Generation APF (xlsx + pdf zippes) ==========
  const runApf = async (mode: 'livreur' | 'commercial') => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('Aucune ligne sélectionnée')
      return
    }
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/paiements/apf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: ids, mode }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur génération APF' }))
        throw new Error(err.error || 'Erreur génération APF')
      }
      const groups = Number(res.headers.get('X-Apf-Groups') || '1')
      const validCount = Number(res.headers.get('X-Apf-Valid') || String(ids.length))
      const rejectedCount = Number(res.headers.get('X-Apf-Rejected') || '0')
      const rejApf = Number(res.headers.get('X-Apf-Rejected-Apf') || '0')
      const rejPaye = Number(res.headers.get('X-Apf-Rejected-Paye') || '0')
      const rejSans = Number(res.headers.get('X-Apf-Rejected-Sans') || '0')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      // Recupere le filename du Content-Disposition
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      const today = new Date()
      const dd = String(today.getDate()).padStart(2, '0')
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const yyyy = today.getFullYear()
      const fallback = `apf-${mode === 'livreur' ? 'livraison' : 'montage'}-${dd}-${mm}-${yyyy}.zip`
      a.href = url
      a.download = match ? match[1] : fallback
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      // Toast : nb fichiers = 2 * groupes (xlsx + pdf)
      const fileCount = groups * 2
      const label = mode === 'livreur' ? 'livreur' : 'commercial'
      let msg = `APF ${label} — ${fileCount} fichier(s) dans ${groups} groupe(s)`
      if (rejectedCount > 0) {
        const parts: string[] = []
        if (rejApf > 0) parts.push(`${rejApf} APF déjà envoyé`)
        if (rejPaye > 0) parts.push(`${rejPaye} déjà payé(s)`)
        if (rejSans > 0) parts.push(`${rejSans} sans ${label}`)
        msg += ` · ${rejectedCount} ignoré(s) : ${parts.join(', ')}`
      }
      toast.success(msg)
      setSelectedIds(new Set())
      await fetchClients()
    } catch (e: any) {
      toast.error(e.message || 'Erreur génération APF')
    } finally {
      setBulkLoading(false)
    }
  }

  // Toggle individuel sur une ligne
  const runToggleSingle = async (
    clientId: string,
    field:
      | 'commercial_apf_envoye'
      | 'commercial_paye'
      | 'livreur_apf_envoye'
      | 'livreur_paye',
    newValue: boolean
  ) => {
    try {
      const res = await fetch('/api/admin/paiements/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_ids: [clientId],
          updates: { [field]: newValue },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur mise à jour')
      toast.success('Statut mis à jour')
      await fetchClients()
    } catch (e: any) {
      toast.error(e.message || 'Erreur')
    }
  }

  // ========== Export XLSX ==========
  const handleExport = async (mode: 'commercial' | 'livreur' | 'depot') => {
    try {
      const body: Record<string, any> = {
        tenant: tenantId,
        export_mode: mode,
      }
      if (depotFilter.length > 0) body.depot_ids = depotFilter
      if (zoneFilter.length > 0) body.zone = zoneFilter.join(',')
      if (livreurFilter.length > 0) body.livreur_ids = livreurFilter
      if (commercialFilter.length > 0) body.commercial_codes = commercialFilter
      if (enematFilter !== 'all') body.statut_enemat = enematFilter
      if (commercialPayeFilter !== 'all') body.commercial_paye = commercialPayeFilter === 'oui'
      if (livreurPayeFilter !== 'all') body.livreur_paye = livreurPayeFilter === 'oui'
      if (commercialApfFilter !== 'all') body.commercial_apf_envoye = commercialApfFilter === 'oui'
      if (livreurApfFilter !== 'all') body.livreur_apf_envoye = livreurApfFilter === 'oui'
      if (lotFilter) body.lot = lotFilter
      if (factureFilter) body.facture = factureFilter
      if (debouncedSearch) body.search = debouncedSearch

      const res = await fetch('/api/admin/paiements/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur export' }))
        throw new Error(err.error || 'Erreur export')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `paiements-${mode}-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Export téléchargé')
    } catch (e: any) {
      toast.error(e.message || 'Erreur export')
    }
  }

  // ========== Reset filtres ==========
  const resetFilters = () => {
    setDepotFilter([])
    setZoneFilter([])
    setLivreurFilter([])
    setCommercialFilter([])
    setEnematFilter('all')
    setCommercialPayeFilter('all')
    setLivreurPayeFilter('all')
    setLotFilter('')
    setFactureFilter('')
    setSearchQuery('')
  }

  const hasActiveFilters = useMemo(() => {
    return depotFilter.length > 0 || zoneFilter.length > 0 || livreurFilter.length > 0 || commercialFilter.length > 0 ||
      enematFilter !== 'all' || commercialPayeFilter !== 'all' || livreurPayeFilter !== 'all' ||
      !!lotFilter || !!factureFilter ||
      searchQuery.length > 0
  }, [depotFilter, zoneFilter, livreurFilter, commercialFilter, enematFilter, commercialPayeFilter, livreurPayeFilter, commercialApfFilter, livreurApfFilter, lotFilter, factureFilter, searchQuery])

  const selectedCount = selectedIds.size

  // ========== Stats bar (clients filtres actuels + total velos valides page courante) ==========
  // Pour un total exact sur TOUS les clients filtres (pas seulement la page), on reflete pagination.total
  // et on somme velo_valide sur la page en cours comme indicateur de batch visuel.
  const totalVelosPage = useMemo(
    () => clients.reduce((acc, c) => acc + (c.velo_valide ?? 0), 0),
    [clients]
  )

  // ========== Calcul des livreurs eligibles pour le dialog d'attribution ==========
  // Regle : un livreur est eligible si son depot_id OU son depot_ids contient AU MOINS UN
  //         des depots concernes par la selection. On prefere l'INTERSECTION (livreurs communs
  //         a TOUS les depots) quand la selection couvre plusieurs depots differents.
  const attribContext = useMemo(() => {
    const targetIds = livreurDialogTargetIds
    if (targetIds.length === 0) {
      return { depotIds: [] as string[], eligibleLivreurs: livreurs, multiDepot: false }
    }
    const targetClients = clients.filter(c => targetIds.includes(c.id))
    // Collecter les depots uniques de la selection (retrait + logistique)
    const depotSet = new Set<string>()
    for (const c of targetClients) {
      if (c.depot_retrait_id) depotSet.add(c.depot_retrait_id)
      if (c.depot_logistique_id) depotSet.add(c.depot_logistique_id)
    }
    const depotIds = Array.from(depotSet)

    if (depotIds.length === 0) {
      return { depotIds, eligibleLivreurs: livreurs, multiDepot: false }
    }

    const livreurDepots = (l: LivreurOption): string[] => {
      const arr: string[] = []
      if (l.depot_id) arr.push(l.depot_id)
      if (Array.isArray(l.depot_ids)) arr.push(...l.depot_ids.filter(Boolean))
      return arr
    }

    let eligibleLivreurs: LivreurOption[]
    const multiDepot = depotIds.length > 1

    if (multiDepot) {
      // Intersection : livreurs couvrant TOUS les depots concernes
      eligibleLivreurs = livreurs.filter(l => {
        const ld = livreurDepots(l)
        return depotIds.every(d => ld.includes(d))
      })
    } else {
      // Union (un seul depot) : livreurs couvrant ce depot
      eligibleLivreurs = livreurs.filter(l => {
        const ld = livreurDepots(l)
        return ld.includes(depotIds[0])
      })
    }
    return { depotIds, eligibleLivreurs, multiDepot }
  }, [livreurDialogTargetIds, clients, livreurs])

  const openAttribLivreur = (targetIds: string[]) => {
    setLivreurDialogTargetIds(targetIds)
    setLivreurDialogValue('')
    setShowAttribLivreurDialog(true)
  }

  // ========== Render ==========
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Paiements
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestion des APF commerciaux et livreurs pour les clients déposés ENEMAT.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchClients()} className="h-9">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Download className="h-4 w-4" />
                Exporter
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mode d&apos;export</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport('commercial')}>
                <UserCog className="h-4 w-4 mr-2" />
                Par commercial
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('livreur')}>
                <Truck className="h-4 w-4 mr-2" />
                Par livreur
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('depot')}>
                <FileText className="h-4 w-4 mr-2" />
                Par dépôt
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Recherche */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher raison sociale ou réf. Retina…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* Dépôt — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3 shrink-0">
                  Dépôt {depotFilter.length > 0 && `(${depotFilter.length})`}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="max-h-60 overflow-y-auto">
                  {depots.map(d => (
                    <label key={d.id} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                      <input
                        type="checkbox"
                        checked={depotFilter.includes(d.id)}
                        onChange={(e) => {
                          setDepotFilter(prev =>
                            e.target.checked ? [...prev, d.id] : prev.filter(v => v !== d.id)
                          )
                        }}
                        className="rounded border-gray-300"
                      />
                      {d.nom}
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

            {/* Zone — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3 shrink-0">
                  Zone {zoneFilter.length > 0 && `(${zoneFilter.length})`}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="max-h-60 overflow-y-auto">
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
                </div>
                {zoneFilter.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setZoneFilter([])}>
                    Effacer
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            {/* Livreur — multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3 shrink-0">
                  Livreur {livreurFilter.length > 0 && `(${livreurFilter.length})`}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-60 overflow-y-auto">
                  {livreurs.map(l => (
                    <label key={l.id} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                      <input
                        type="checkbox"
                        checked={livreurFilter.includes(l.id)}
                        onChange={(e) => {
                          setLivreurFilter(prev =>
                            e.target.checked ? [...prev, l.id] : prev.filter(v => v !== l.id)
                          )
                        }}
                        className="rounded border-gray-300"
                      />
                      {l.prenom} {l.nom}
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

            {/* Commercial — multi-select hierarchique */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3 shrink-0">
                  Commercial {commercialFilter.length > 0 && `(${commercialFilter.length})`}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-72 overflow-y-auto">
                  {commerciaux.map(parent => (
                    <div key={parent.id}>
                      <label className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded font-medium">
                        <input
                          type="checkbox"
                          checked={commercialFilter.includes(parent.code)}
                          onChange={(e) => {
                            setCommercialFilter(prev =>
                              e.target.checked ? [...prev, parent.code] : prev.filter(v => v !== parent.code)
                            )
                          }}
                          className="rounded border-gray-300"
                        />
                        {parent.nom}
                      </label>
                      {(parent.enfants || []).map(child => (
                        <label key={child.id} className="flex items-center gap-2 pl-6 pr-2 py-1 text-sm cursor-pointer hover:bg-muted rounded">
                          <input
                            type="checkbox"
                            checked={commercialFilter.includes(child.code)}
                            onChange={(e) => {
                              setCommercialFilter(prev =>
                                e.target.checked ? [...prev, child.code] : prev.filter(v => v !== child.code)
                              )
                            }}
                            className="rounded border-gray-300"
                          />
                          ↳ {child.nom}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                {commercialFilter.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setCommercialFilter([])}>
                    Effacer
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            {/* Filtre ENEMAT : statut complet (miroir du module ENEMAT, lecture seule) */}
            <Select value={enematFilter} onValueChange={(v) => setEnematFilter(v as EnematStatutFiltre)}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue>Statut ENEMAT : {enematFiltreLabel(enematFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ENEMAT_FILTRE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tri-states (autres filtres binaires) */}

            <Select value={commercialPayeFilter} onValueChange={(v) => setCommercialPayeFilter(v as TriState)}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue>Commercial payé : {triLabel(commercialPayeFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>

            <Select value={livreurPayeFilter} onValueChange={(v) => setLivreurPayeFilter(v as TriState)}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue>Livreur payé : {triLabel(livreurPayeFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>

            <Select value={commercialApfFilter} onValueChange={(v) => setCommercialApfFilter(v as TriState)}>
              <SelectTrigger className="h-9 w-[210px]">
                <SelectValue>APF commercial : {triLabel(commercialApfFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="oui">Envoyé</SelectItem>
                <SelectItem value="non">Non envoyé</SelectItem>
              </SelectContent>
            </Select>

            <Select value={livreurApfFilter} onValueChange={(v) => setLivreurApfFilter(v as TriState)}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue>APF livreur : {triLabel(livreurApfFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="oui">Envoyé</SelectItem>
                <SelectItem value="non">Non envoyé</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtre Lot ENEMAT */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`h-9 px-3 ${lotFilter ? 'border-primary text-primary' : ''}`}>
                  Lot {lotFilter && '●'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-2">
                  <Input
                    placeholder="N° de lot..."
                    className="h-8 text-xs"
                    value={lotFilter && !lotFilter.startsWith('__') ? lotFilter : ''}
                    onChange={(e) => setLotFilter(e.target.value)}
                  />
                  <div className="flex flex-col gap-1">
                    <Button variant={lotFilter === '__any__' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs justify-start" onClick={() => setLotFilter('__any__')}>Avec lot</Button>
                    <Button variant={lotFilter === '__none__' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs justify-start" onClick={() => setLotFilter('__none__')}>Sans lot</Button>
                  </div>
                  {lotFilter && (
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLotFilter('')}>Effacer</Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Filtre N° facture ENEMAT */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`h-9 px-3 ${factureFilter ? 'border-primary text-primary' : ''}`}>
                  N° facture {factureFilter && '●'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-2">
                  <Input
                    placeholder="N° de facture..."
                    className="h-8 text-xs"
                    value={factureFilter && !factureFilter.startsWith('__') ? factureFilter : ''}
                    onChange={(e) => setFactureFilter(e.target.value)}
                  />
                  <div className="flex flex-col gap-1">
                    <Button variant={factureFilter === '__any__' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs justify-start" onClick={() => setFactureFilter('__any__')}>Avec facture</Button>
                    <Button variant={factureFilter === '__none__' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs justify-start" onClick={() => setFactureFilter('__none__')}>Sans facture</Button>
                  </div>
                  {factureFilter && (
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setFactureFilter('')}>Effacer</Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Par page — inline */}
            <div className="flex items-center gap-1.5 ml-auto">
              <Label className="text-xs text-muted-foreground">Par page</Label>
              <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[20, 50, 100, 200, 500].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1.5">
                <X className="h-3.5 w-3.5" />
                Réinitialiser
              </Button>
            )}

            <PinFiltersButton onPin={handlePinFilters} isPinned={isPinned} />
          </div>
        </CardContent>
      </Card>

      {/* Bulk bar */}
      {selectedCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">
                {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
              </Badge>

              {/* ENEMAT : plus de bouton ici (lecture seule — gere par module ENEMAT) */}

              <Button size="sm" variant="outline" disabled={bulkLoading}
                onClick={() => runApf('commercial')}>
                <FileText className="h-4 w-4 mr-1.5" />
                Générer APF commercial
              </Button>
              <Button size="sm" variant="outline" disabled={bulkLoading}
                onClick={() => runBulk({ commercial_paye: true }, 'Commercial marqué payé')}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Commercial payé
              </Button>

              <span className="w-px h-5 bg-border" />

              <Button size="sm" variant="outline" disabled={bulkLoading}
                onClick={() => runApf('livreur')}>
                <FileText className="h-4 w-4 mr-1.5" />
                Générer APF livreur
              </Button>
              <Button size="sm" variant="outline" disabled={bulkLoading}
                onClick={() => runBulk({ livreur_paye: true }, 'Livreur marqué payé')}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Livreur payé
              </Button>

              <span className="w-px h-5 bg-border" />

              <Button size="sm" variant="outline" disabled={bulkLoading}
                onClick={() => openAttribLivreur(Array.from(selectedIds))}>
                <Truck className="h-4 w-4 mr-1.5" />
                Attribuer livreur
              </Button>
              <Button size="sm" variant="outline" disabled={bulkLoading}
                onClick={() => { setCommercialDialogValue(''); setShowCommercialDialog(true) }}>
                <UserCog className="h-4 w-4 mr-1.5" />
                Forcer commercial
              </Button>

              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="ml-auto">
                <X className="h-4 w-4 mr-1.5" />
                Tout désélectionner
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tableau */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clients.length === 0 ? (
            <div className="py-16 text-center">
              <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Aucun client déposé ENEMAT ne correspond aux filtres.
              </p>
            </div>
          ) : (
            <>
            {/* Stats compact bar */}
            <div className="px-4 py-2 border-b flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{pagination.total}</span> client{pagination.total > 1 ? 's' : ''}
                {' · '}
                <span className="font-medium text-blue-600">{totalVelosValides}</span> vélos validés
              </span>
              <span>{pagination.page}/{pagination.totalPages}</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelectedOnPage} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Dépôt</TableHead>
                    <TableHead>Date dépôt</TableHead>
                    <TableHead>Commercial</TableHead>
                    <TableHead>Livreur</TableHead>
                    <TableHead>ENEMAT</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>N° facture</TableHead>
                    <TableHead>Commercial</TableHead>
                    <TableHead>Livreur</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map(c => {
                    const commercialLabel = getCommercialName({
                      monday_board_id: c.monday_board_id,
                      commercial_assigne: c.commercial_assigne,
                      commercial_code: c.commercial_code,
                      email: c.email,
                    })
                    // Sous-commercial : toujours visible si commercial_code est un enfant
                    // (parent_code non null). Independant du filtre courant.
                    const sousCommercialNom = c.commercial?.parent_code ? c.commercial?.nom : null
                    const livreurLabel = c.livreur
                      ? `${c.livreur.prenom ?? ''} ${c.livreur.nom ?? ''}`.trim()
                      : ''

                    return (
                      <TableRow key={c.id} data-selected={selectedIds.has(c.id)}
                        className={selectedIds.has(c.id) ? 'bg-primary/5' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleSelect(c.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/clients/${c.id}`}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {c.raison_sociale || 'Sans nom'}
                          </Link>
                          {c.reference_retina && (
                            <div className="text-xs text-muted-foreground">
                              {c.reference_retina}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{c.depot?.nom || '-'}</TableCell>
                        <TableCell>{formatDate(c.date_depot_enemat)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{commercialLabel}</span>
                            {sousCommercialNom && (
                              <span className="text-xs text-muted-foreground">
                                ↳ {sousCommercialNom}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {/* Plus de bouton "Attribuer" ici — action via dropdown "..." */}
                          {livreurLabel ? (
                            <span className="text-sm">{livreurLabel}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Non attribué</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <EnematBadge statut={c.statut_enemat} />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono">{c.numero_lot_enemat || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono">{c.numero_facture_enemat || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            paye={c.commercial_paye}
                            apfEnvoye={c.commercial_apf_envoye}
                            label="Commercial"
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            paye={c.livreur_paye}
                            apfEnvoye={c.livreur_apf_envoye}
                            label="Livreur"
                          />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                              <DropdownMenuLabel>Actions rapides</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={!!c.commercial_apf_envoye || !!c.commercial_paye}
                                onClick={() => runToggleSingle(c.id, 'commercial_apf_envoye', true)}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                {c.commercial_apf_envoye ? 'APF commercial déjà envoyé' :
                                 c.commercial_paye ? 'Déjà payé (APF inutile)' :
                                 'Marquer APF commercial envoyé'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!!c.commercial_paye}
                                onClick={() => runToggleSingle(c.id, 'commercial_paye', true)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                {c.commercial_paye ? 'Commercial déjà payé' : 'Marquer commercial payé'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={!!c.livreur_apf_envoye || !!c.livreur_paye}
                                onClick={() => runToggleSingle(c.id, 'livreur_apf_envoye', true)}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                {c.livreur_apf_envoye ? 'APF livreur déjà envoyé' :
                                 c.livreur_paye ? 'Déjà payé (APF inutile)' :
                                 'Marquer APF livreur envoyé'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!!c.livreur_paye}
                                onClick={() => runToggleSingle(c.id, 'livreur_paye', true)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                {c.livreur_paye ? 'Livreur déjà payé' : 'Marquer livreur payé'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openAttribLivreur([c.id])}
                              >
                                <Truck className="h-4 w-4 mr-2" />
                                Attribuer un livreur
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/clients/${c.id}`}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Ouvrir fiche client
                                </Link>
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {pagination.total === 0
            ? 'Aucun résultat'
            : `${(pagination.page - 1) * pagination.limit + 1}–${Math.min(
                pagination.page * pagination.limit,
                pagination.total
              )} sur ${pagination.total}`}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            disabled={currentPage >= pagination.totalPages}
            onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dialog : Attribuer un livreur (filtre par depot) */}
      <Dialog open={showAttribLivreurDialog} onOpenChange={setShowAttribLivreurDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attribuer un livreur</DialogTitle>
            <DialogDescription>
              Affecter un livreur de paiement à {livreurDialogTargetIds.length} client(s).
              {attribContext.depotIds.length > 0 && (
                <span className="block text-xs mt-1">
                  Dépôts concernés : {attribContext.depotIds.length}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {attribContext.multiDepot && (
            <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                La sélection couvre <strong>plusieurs dépôts différents</strong>. Seuls les livreurs
                affectés à TOUS ces dépôts sont proposés (intersection).
              </div>
            </div>
          )}

          <div className="py-3">
            <Label className="text-sm">Livreur</Label>
            <Select value={livreurDialogValue} onValueChange={setLivreurDialogValue}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sélectionner un livreur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Retirer l&apos;attribution —</SelectItem>
                {attribContext.eligibleLivreurs.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Aucun livreur éligible pour le(s) dépôt(s) concernés.
                  </div>
                ) : (
                  attribContext.eligibleLivreurs.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.prenom} {l.nom}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAttribLivreurDialog(false)}>Annuler</Button>
            <Button
              disabled={!livreurDialogValue || bulkLoading}
              onClick={async () => {
                const value = livreurDialogValue === '__none__' ? null : livreurDialogValue
                await runBulkOnIds(livreurDialogTargetIds, { paiement_livreur_id: value }, 'Livreur attribué')
                setShowAttribLivreurDialog(false)
              }}
            >
              {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Valider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : Forcer un commercial */}
      <Dialog open={showCommercialDialog} onOpenChange={setShowCommercialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forcer un commercial</DialogTitle>
            <DialogDescription>
              Changer le commercial assigné sur {selectedCount > 0 ? `${selectedCount} client(s)` : 'la sélection'}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Label className="text-sm">Commercial</Label>
            <Select value={commercialDialogValue} onValueChange={setCommercialDialogValue}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sélectionner un commercial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Retirer l&apos;attribution —</SelectItem>
                {commerciaux.map(parent => (
                  <div key={parent.id}>
                    <SelectItem value={parent.code}>{parent.nom}</SelectItem>
                    {(parent.enfants || []).map(child => (
                      <SelectItem key={child.id} value={child.code}>
                        &nbsp;&nbsp;↳ {child.nom}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCommercialDialog(false)}>Annuler</Button>
            <Button
              disabled={!commercialDialogValue || bulkLoading}
              onClick={async () => {
                const value = commercialDialogValue === '__none__' ? null : commercialDialogValue
                await runBulk({ commercial_code: value }, 'Commercial mis à jour')
                setShowCommercialDialog(false)
              }}
            >
              {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Valider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
