'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Search,
  ClipboardCheck,
  CheckCircle,
  Copy,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Clock,
  ExternalLink,
  Lock,
  Unlock,
  RefreshCw,
  RotateCcw,
  Download,
  Users,
  Bike,
  ChevronDown,
  Tag,
  ListChecks,
} from 'lucide-react'
import Link from 'next/link'
import {
  CQ_CHECKS, CQ_CHECK_KEYS, CQ_CATEGORIES, CQ_CATEGORIE_KEYS, CQ_CATEGORIE_COLORS,
  type CqCheckKey, type CqCategorie,
} from '@/lib/constants'
import { exportToXlsx } from '@/lib/export-xlsx'
import { getTenantConfig } from '@/lib/tenants'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { toast } from 'sonner'
import { usePinnedFilters, PinFiltersButton } from '@/components/admin/pin-filters'
import { getTenantId } from '@/lib/tenants'
import { useCommerciaux } from '@/lib/tenants/use-commerciaux'
import { CommercialFilter } from '@/components/admin/commercial-filter'
import { CommercialCell } from '@/components/admin/commercial-cell'

interface ControleItem {
  id: string
  statut: string
  date_livraison: string | null
  date_livraison_effective: string | null
  livreur_id: string | null
  depot_id: string | null
  cq_piece_identite: boolean
  cq_photo_enemat: boolean
  cq_signature_installateur: boolean
  cq_signature_client: boolean
  cq_fnuci: boolean
  cq_velo: boolean
  cq_valide: boolean
  cq_en_cours: boolean
  cq_commentaire: string | null
  cq_categorie: string | null
  cq_pris_par: string | null
  cq_pris_at: string | null
  cq_pris_par_nom: string | null
  reactivated_at: string | null
  client: {
    id: string
    raison_sociale: string
    contact_nom: string | null
    contact_prenom: string | null
    telephone: string | null
    reference_retina: string | null
    commercial_assigne: string | null
    commercial_code: string | null
    commercial: { code: string; nom: string; parent_code: string | null } | null
    velo_valide: number | null
    fnuci_ids: string[] | null
  } | null
  depot: { id: string; nom: string } | null
  livreur: { nom: string; prenom: string } | null
}

interface AgentOption {
  id: string
  nom: string
  prenom: string
}

interface Stats {
  non_traites: number
  en_cours: number
  sav: number
  premier_controle: number
  total: number
  clients_filtered: number
  velos_valides_filtered: number
}

export default function ControlePage() {
  const user = useAdminUser()
  const [items, setItems] = useState<ControleItem[]>([])
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [stats, setStats] = useState<Stats>({ non_traites: 0, en_cours: 0, sav: 0, premier_controle: 0, total: 0, clients_filtered: 0, velos_valides_filtered: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [categorieFilter, setCategorieFilter] = useState<string[]>([])
  const [commercialFilter, setCommercialFilter] = useState<string[]>([])
  const tenantId = getTenantId()
  const { parents: commerciauxParents } = useCommerciaux(tenantId)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [validating, setValidating] = useState<string | null>(null)
  const [locking, setLocking] = useState<string | null>(null)
  const [copiedRef, setCopiedRef] = useState<string | null>(null)
  const [editingComment, setEditingComment] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [savingComment, setSavingComment] = useState(false)
  const [alertsCount, setAlertsCount] = useState(0)

  // Filtres figés par utilisateur
  const { loadPinned, saveFilters, hasPinned } = usePinnedFilters(user?.id, 'controle')
  const [isPinned, setIsPinned] = useState(false)
  const pinnedLoaded = useRef(false)
  const [filtersReady, setFiltersReady] = useState(false)

  useEffect(() => {
    if (pinnedLoaded.current) return
    pinnedLoaded.current = true
    const pinned = loadPinned()
    if (pinned) {
      setIsPinned(true)
      if (pinned.filter) setFilter(pinned.filter)
      if (pinned.agentFilter) setAgentFilter(pinned.agentFilter)
      if (Array.isArray(pinned.categorieFilter)) setCategorieFilter(pinned.categorieFilter)
      if (Array.isArray(pinned.commercialFilter)) setCommercialFilter(pinned.commercialFilter)
      if (pinned.pageSize) setPageSize(pinned.pageSize)
    }
    setFiltersReady(true)
  }, [loadPinned])

  const handlePinFilters = () => {
    saveFilters({
      filter,
      agentFilter,
      categorieFilter,
      commercialFilter,
      pageSize,
    })
    setIsPinned(true)
    toast.success('Filtres figés comme vue par défaut')
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        filter,
        search,
        agent: agentFilter,
        page: String(page),
        pageSize: String(pageSize),
      })
      if (categorieFilter.length > 0) params.set('categorie', categorieFilter.join(','))
      if (commercialFilter.length > 0) params.set('commercial', commercialFilter.join(','))
      const res = await fetch(`/api/admin/controle?${params}`)
      if (!res.ok) throw new Error('Erreur chargement')
      const data = await res.json()
      setItems(data.items || [])
      setAgents(data.agents || [])
      setStats(data.stats || { non_traites: 0, en_cours: 0, sav: 0, premier_controle: 0, total: 0, clients_filtered: 0, velos_valides_filtered: 0 })
      setTotal(data.pagination?.total || 0)
      setAlertsCount(data.alerts_count || 0)
    } catch (err) {
      console.error('Erreur fetch controle:', err)
    } finally {
      setLoading(false)
    }
  }, [filter, agentFilter, categorieFilter, commercialFilter, search, page, pageSize])

  useEffect(() => { if (filtersReady) fetchData() }, [fetchData, filtersReady])
  useEffect(() => { setPage(1) }, [filter, agentFilter, categorieFilter, commercialFilter, search])

  // --- Lock / Unlock ---
  const handleLock = async (livraisonId: string, action: 'lock' | 'unlock') => {
    setLocking(livraisonId)
    try {
      const res = await fetch(`/api/admin/controle/${livraisonId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Erreur verrouillage')
        return
      }
      // Refresh data to get updated lock state + agents list
      await fetchData()
      toast.success(action === 'lock' ? 'Dossier pris' : 'Dossier libéré')
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLocking(null)
    }
  }

  // --- Check individual ---
  const handleCheck = async (livraisonId: string, field: CqCheckKey, value: boolean) => {
    setItems(prev => prev.map(item =>
      item.id === livraisonId ? { ...item, [field]: value } : item
    ))
    try {
      const res = await fetch(`/api/admin/controle/${livraisonId}/check`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Erreur')
        setItems(prev => prev.map(item =>
          item.id === livraisonId ? { ...item, [field]: !value } : item
        ))
      } else {
        const data = await res.json()
        setItems(prev => prev.map(item =>
          item.id === livraisonId ? { ...item, cq_en_cours: data.cq_en_cours } : item
        ))
      }
    } catch {
      setItems(prev => prev.map(item =>
        item.id === livraisonId ? { ...item, [field]: !value } : item
      ))
    }
  }

  // --- Check all ---
  const handleCheckAll = async (livraisonId: string, checkAll: boolean) => {
    setItems(prev => prev.map(item =>
      item.id === livraisonId
        ? { ...item, ...Object.fromEntries(CQ_CHECK_KEYS.map(k => [k, checkAll])) }
        : item
    ))
    try {
      const results = await Promise.all(
        CQ_CHECK_KEYS.map(key =>
          fetch(`/api/admin/controle/${livraisonId}/check`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field: key, value: checkAll }),
          })
        )
      )
      if (results.some(r => !r.ok)) {
        toast.error('Erreur lors du cochage')
        fetchData()
      } else {
        setItems(prev => prev.map(item =>
          item.id === livraisonId
            ? { ...item, cq_en_cours: checkAll }
            : item
        ))
      }
    } catch {
      fetchData()
    }
  }

  // --- Validate ---
  const handleValidate = async (livraisonId: string) => {
    setValidating(livraisonId)
    try {
      const res = await fetch(`/api/admin/controle/${livraisonId}/validate`, {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('Contrôle validé')
        setTimeout(() => {
          setItems(prev => prev.filter(item => item.id !== livraisonId))
          setStats(prev => ({
            ...prev,
            en_cours: Math.max(0, prev.en_cours - 1),
          }))
        }, 300)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erreur validation')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setValidating(null)
    }
  }

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref)
    setCopiedRef(ref)
    setTimeout(() => setCopiedRef(null), 2000)
  }

  const handleSaveComment = async (livraisonId: string) => {
    setSavingComment(true)
    try {
      const res = await fetch(`/api/admin/controle/${livraisonId}/check`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentaire: commentDraft }),
      })
      if (res.ok) {
        setItems(prev => prev.map(item =>
          item.id === livraisonId ? { ...item, cq_commentaire: commentDraft || null } : item
        ))
        setEditingComment(null)
      }
    } catch {
      // silently fail
    } finally {
      setSavingComment(false)
    }
  }

  // --- Catégorie (tag CQ) ---
  const handleSaveCategorie = async (livraisonId: string, value: string) => {
    const categorie = value === '__none__' ? null : value
    const previous = items.find(i => i.id === livraisonId)?.cq_categorie ?? null
    setItems(prev => prev.map(item =>
      item.id === livraisonId ? { ...item, cq_categorie: categorie } : item
    ))
    try {
      const res = await fetch(`/api/admin/controle/${livraisonId}/check`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorie }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Erreur catégorie')
        setItems(prev => prev.map(item =>
          item.id === livraisonId ? { ...item, cq_categorie: previous } : item
        ))
      }
    } catch {
      toast.error('Erreur réseau')
      setItems(prev => prev.map(item =>
        item.id === livraisonId ? { ...item, cq_categorie: previous } : item
      ))
    }
  }

  const getCheckedCount = (item: ControleItem) =>
    CQ_CHECK_KEYS.filter(key => item[key]).length

  // Export Excel
  const handleExportControle = () => {
    const tenant = getTenantConfig()
    const today = new Date().toISOString().slice(0, 10)
    exportToXlsx(items, [
      { header: 'Date livraison', accessor: r => {
        const d = r.date_livraison_effective || r.date_livraison
        if (!d) return ''
        const raw = String(d)
        const dt = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
        return dt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
      }},
      { header: 'Société', accessor: r => r.client?.raison_sociale || '' },
      { header: 'Nom', accessor: r => r.client?.contact_nom || '' },
      { header: 'Prénom', accessor: r => r.client?.contact_prenom || '' },
      { header: 'Téléphone', accessor: r => r.client?.telephone || '' },
      { header: 'Réf. Retina', accessor: r => r.client?.reference_retina || '' },
      { header: 'Commercial', accessor: r => r.client?.commercial?.nom || r.client?.commercial_assigne || '' },
      { header: 'Dépôt', accessor: r => r.depot?.nom || '' },
      { header: 'Livreur', accessor: r => r.livreur ? `${r.livreur.prenom} ${r.livreur.nom}` : '' },
      { header: 'Nb vélos', accessor: r => r.client?.velo_valide || 0 },
      { header: 'Pris par', accessor: r => r.cq_pris_par_nom || '' },
      ...CQ_CHECK_KEYS.map(key => ({
        header: CQ_CHECKS[key].label,
        accessor: (r: ControleItem) => r[key] ? 'OUI' : 'NON',
      })),
      { header: 'Commentaire', accessor: r => r.cq_commentaire || '' },
      { header: 'Catégorie', accessor: r => r.cq_categorie ? (CQ_CATEGORIES[r.cq_categorie as CqCategorie] || r.cq_categorie) : '' },
      { header: 'Contrôle validé', accessor: r => r.cq_valide ? 'OUI' : 'NON' },
    ], `Export-Controle-${tenant.name}-${today}.xlsx`)
  }

  // Can this user interact with this item's checks?
  // Il faut d'abord "Prendre" le dossier pour pouvoir cocher les cases
  const canEdit = (item: ControleItem) => {
    if (user?.role === 'super_admin') return true
    if (!item.cq_pris_par) return false // Pas pris = personne ne peut modifier
    if (item.cq_pris_par === user?.id) return true
    return false
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6" />
          Contrôle qualité
        </h1>
        <p className="text-muted-foreground mt-1">
          Vérification post-livraison : 6 points de contrôle par dossier
        </p>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 border border-slate-200 bg-slate-50/50 rounded-lg px-4 py-2">
          <Users className="h-5 w-5 text-slate-500" />
          <span className="text-sm text-muted-foreground">Clients</span>
          <span className="text-lg font-bold text-slate-700">{stats.clients_filtered}</span>
        </div>
        <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50/50 rounded-lg px-4 py-2">
          <Bike className="h-5 w-5 text-emerald-500" />
          <span className="text-sm text-muted-foreground">Vélos validés</span>
          <span className="text-lg font-bold text-emerald-700">{stats.velos_valides_filtered}</span>
        </div>
        <div className="flex items-center gap-2 border border-blue-200 bg-blue-50/50 rounded-lg px-4 py-2">
          <AlertCircle className="h-5 w-5 text-blue-500" />
          <span className="text-sm text-muted-foreground">Non traités</span>
          <span className="text-lg font-bold text-blue-700">{stats.non_traites}</span>
        </div>
        <div className="flex items-center gap-2 border border-amber-200 bg-amber-50/50 rounded-lg px-4 py-2">
          <Clock className="h-5 w-5 text-amber-500" />
          <span className="text-sm text-muted-foreground">En cours</span>
          <span className="text-lg font-bold text-amber-700">{stats.en_cours}</span>
        </div>
        <div className="flex items-center gap-2 border border-teal-200 bg-teal-50/50 rounded-lg px-4 py-2">
          <ListChecks className="h-5 w-5 text-teal-500" />
          <span className="text-sm text-muted-foreground">Premier contrôle</span>
          <span className="text-lg font-bold text-teal-700">{stats.premier_controle}</span>
        </div>
        {stats.sav > 0 && (
          <div className="flex items-center gap-2 border border-purple-200 bg-purple-50/50 rounded-lg px-4 py-2">
            <RotateCcw className="h-5 w-5 text-purple-500" />
            <span className="text-sm text-muted-foreground">SAV</span>
            <span className="text-lg font-bold text-purple-700">{stats.sav}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous ({stats.non_traites + stats.en_cours})</SelectItem>
            <SelectItem value="non_traites">Non traités ({stats.non_traites})</SelectItem>
            <SelectItem value="en_cours">En cours ({stats.en_cours})</SelectItem>
            <SelectItem value="premier_controle">Premier contrôle ({stats.premier_controle})</SelectItem>
            {stats.sav > 0 && (
              <SelectItem value="sav">SAV ({stats.sav})</SelectItem>
            )}
          </SelectContent>
        </Select>

        {/* Filtre agent */}
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les agents</SelectItem>
            <SelectItem value="me">Mes dossiers</SelectItem>
            {agents.map(a => (
              <SelectItem key={a.id} value={a.id}>
                {a.prenom} {a.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtre catégorie (tags) — multi-sélection */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between gap-2 min-w-[170px]">
              <span className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Catégorie{categorieFilter.length > 0 ? ` (${categorieFilter.length})` : ''}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-0.5">
              {CQ_CATEGORIE_KEYS.map(key => (
                <label key={key} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted rounded">
                  <input
                    type="checkbox"
                    checked={categorieFilter.includes(key)}
                    onChange={e => {
                      setCategorieFilter(prev =>
                        e.target.checked ? [...prev, key] : prev.filter(v => v !== key)
                      )
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${CQ_CATEGORIE_COLORS[key].split(' ')[0]}`} />
                  {CQ_CATEGORIES[key]}
                </label>
              ))}
            </div>
            {categorieFilter.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setCategorieFilter([])}>
                Effacer
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {/* Filtre commercial hiérarchique */}
        <CommercialFilter
          options={commerciauxParents}
          value={commercialFilter}
          onChange={setCommercialFilter}
        />

        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher société, réf. Retina, téléphone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>

        <a
          href="https://retina.enemat.fr/#/treetable131"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          ENEMAT Retina
        </a>

        <Button variant="outline" size="sm" onClick={handleExportControle} disabled={items.length === 0}>
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData()}
          disabled={loading}
          title="Rafraîchir"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <PinFiltersButton onPin={handlePinFilters} isPinned={isPinned} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mb-3 text-green-400" />
              <p className="text-lg font-medium">Aucun contrôle en attente</p>
              <p className="text-sm">Toutes les livraisons ont été vérifiées</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center min-w-[70px]">Pris par</TableHead>
                    <TableHead className="min-w-[150px]">Catégorie</TableHead>
                    <TableHead>Date livraison</TableHead>
                    <TableHead className="w-[260px]">Société</TableHead>
                    <TableHead className="w-[110px]">Nom / Prénom</TableHead>
                    <TableHead className="w-[120px]">Téléphone</TableHead>
                    <TableHead className="w-[110px]">Réf. Retina</TableHead>
                    <TableHead className="min-w-[140px]">Commercial</TableHead>
                    <TableHead>Dépôt</TableHead>
                    <TableHead>Livreur</TableHead>
                    <TableHead className="text-center">Vélos</TableHead>
                    <TableHead className="text-center min-w-[50px]" title="Tout cocher / décocher">
                      <span className="text-xs leading-tight block font-semibold">Tout</span>
                    </TableHead>
                    {CQ_CHECK_KEYS.map(key => (
                      <TableHead key={key} className="text-center min-w-[50px]" title={CQ_CHECKS[key].description}>
                        <span className="text-xs leading-tight block">{CQ_CHECKS[key].shortLine1}</span>
                        <span className="text-xs leading-tight block">{CQ_CHECKS[key].shortLine2}</span>
                      </TableHead>
                    ))}
                    <TableHead className="w-[260px]">Commentaire</TableHead>
                    <TableHead className="text-center">Valider</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => {
                    const checked = getCheckedCount(item)
                    const allChecked = checked === 6
                    const isValidating = validating === item.id
                    const isLocking = locking === item.id
                    const lockedByMe = item.cq_pris_par === user?.id
                    const lockedByOther = item.cq_pris_par && !lockedByMe && user?.role !== 'super_admin'
                    const editable = canEdit(item)

                    return (
                      <TableRow
                        key={item.id}
                        className={`transition-all duration-300 ${isValidating ? 'opacity-0 translate-x-4' : ''} ${lockedByOther ? 'opacity-60' : ''} ${lockedByMe ? 'bg-blue-50/40' : ''}`}
                      >
                        {/* Lock button */}
                        <TableCell className="text-center">
                          {isLocking ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                          ) : item.cq_pris_par ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                onClick={() => {
                                  if (lockedByMe || user?.role === 'super_admin') {
                                    handleLock(item.id, 'unlock')
                                  }
                                }}
                                disabled={!!lockedByOther}
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                                  lockedByMe
                                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer'
                                    : lockedByOther
                                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer'
                                }`}
                                title={lockedByMe ? 'Cliquer pour libérer' : item.cq_pris_par_nom || ''}
                              >
                                <Lock className="h-3 w-3" />
                                <span className="max-w-[60px] truncate">{item.cq_pris_par_nom?.split(' ')[0] || '...'}</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleLock(item.id, 'lock')}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700 transition-colors mx-auto"
                              title="Prendre ce dossier"
                            >
                              <Unlock className="h-3 w-3" />
                              Prendre
                            </button>
                          )}
                        </TableCell>

                        {/* Catégorie (tag CQ) */}
                        <TableCell>
                          <Select
                            value={item.cq_categorie || '__none__'}
                            onValueChange={v => handleSaveCategorie(item.id, v)}
                            disabled={!editable}
                          >
                            <SelectTrigger
                              className={`h-7 text-xs w-[140px] ${item.cq_categorie ? `${CQ_CATEGORIE_COLORS[item.cq_categorie as CqCategorie]} border-transparent font-medium` : ''}`}
                            >
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">—</SelectItem>
                              {CQ_CATEGORIE_KEYS.map(key => (
                                <SelectItem key={key} value={key}>{CQ_CATEGORIES[key]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Date livraison + heure */}
                        <TableCell>
                          {(() => {
                            const d = item.date_livraison_effective || item.date_livraison
                            if (!d) return '—'
                            const raw = String(d)
                            const dt = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
                            return (
                              <div>
                                <div>{dt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}</div>
                                <div className="text-xs text-muted-foreground">{dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}</div>
                              </div>
                            )
                          })()}
                        </TableCell>

                        <TableCell className="font-medium max-w-[260px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {item.reactivated_at && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                                SAV
                              </span>
                            )}
                            {item.client ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <a
                                  href={`/admin/clients/${item.client.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline truncate"
                                  title={item.client.raison_sociale}
                                >
                                  {item.client.raison_sociale}
                                </a>
                                {(item.client as any).in_enemat && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">ENEMAT</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.client?.contact_prenom || item.client?.contact_nom
                            ? `${item.client.contact_prenom || ''} ${item.client.contact_nom || ''}`.trim()
                            : '—'}
                        </TableCell>
                        <TableCell>{item.client?.telephone || '—'}</TableCell>
                        <TableCell>
                          {item.client?.reference_retina ? (
                            <button
                              onClick={() => copyRef(item.client!.reference_retina!)}
                              className="flex items-center gap-1 text-sm font-mono hover:text-blue-600 transition-colors"
                              title="Copier"
                            >
                              {item.client.reference_retina}
                              {copiedRef === item.client.reference_retina ? (
                                <CheckCircle className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {item.client ? <CommercialCell client={item.client} /> : '—'}
                        </TableCell>
                        <TableCell>{item.depot?.nom || '—'}</TableCell>
                        <TableCell>
                          {item.livreur
                            ? `${item.livreur.prenom} ${item.livreur.nom}`
                            : '—'}
                        </TableCell>
                        {/* Nb vélos + tooltip FNUCI */}
                        <TableCell className="text-center">
                          {item.client?.velo_valide ? (
                            <span className="relative group cursor-default">
                              {item.client.velo_valide}
                              {item.client.fnuci_ids && item.client.fnuci_ids.length > 0 && (
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-50">
                                  <span className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                                    <span className="font-semibold block mb-1">FNUCI :</span>
                                    {item.client.fnuci_ids.map((code, i) => (
                                      <span key={i} className="block font-mono">{code}</span>
                                    ))}
                                  </span>
                                  <span className="w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
                                </span>
                              )}
                            </span>
                          ) : '—'}
                        </TableCell>

                        {/* Tout cocher */}
                        <TableCell className="text-center">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={(val) => handleCheckAll(item.id, val === true)}
                            disabled={!editable}
                            aria-label="Tout cocher"
                            className="border-2"
                          />
                        </TableCell>

                        {/* 6 checkboxes */}
                        {CQ_CHECK_KEYS.map(key => (
                          <TableCell key={key} className="text-center">
                            <Checkbox
                              checked={item[key] as boolean}
                              onCheckedChange={(val) => handleCheck(item.id, key, val === true)}
                              disabled={!editable}
                              aria-label={CQ_CHECKS[key].label}
                            />
                          </TableCell>
                        ))}

                        {/* Commentaire */}
                        <TableCell className="max-w-[260px] align-top">
                          {editingComment === item.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={commentDraft}
                                onChange={e => setCommentDraft(e.target.value)}
                                placeholder="Commentaire..."
                                className="h-7 text-xs"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveComment(item.id)
                                  if (e.key === 'Escape') setEditingComment(null)
                                }}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleSaveComment(item.id)}
                                disabled={savingComment}
                              >
                                {savingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 text-green-600" />}
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (!editable) return
                                setEditingComment(item.id)
                                setCommentDraft(item.cq_commentaire || '')
                              }}
                              className={`text-xs text-left w-full min-h-[28px] px-1 py-0.5 rounded transition-colors whitespace-pre-wrap break-words ${editable ? 'hover:bg-muted cursor-pointer' : 'cursor-not-allowed'}`}
                              title={editable ? 'Cliquer pour modifier' : 'Dossier pris par un autre agent'}
                            >
                              {item.cq_commentaire ? (
                                <span className="text-orange-600">{item.cq_commentaire}</span>
                              ) : (
                                <span className="text-muted-foreground italic">+ commentaire</span>
                              )}
                            </button>
                          )}
                        </TableCell>

                        {/* Validate */}
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            disabled={!allChecked || isValidating || !editable}
                            onClick={() => handleValidate(item.id)}
                            className={allChecked && editable
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                          >
                            {isValidating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                {checked}/6
                              </>
                            )}
                          </Button>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} résultat{total > 1 ? 's' : ''} — page {page}/{totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
