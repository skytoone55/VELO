'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Loader2, Search, RefreshCw, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Eye, X,
  Phone, Calendar, RotateCcw, FileCheck, Download, Upload,
} from 'lucide-react'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { getTenantId, getTenantConfig } from '@/lib/tenants'
import { exportToXlsx } from '@/lib/export-xlsx'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { useCommerciaux } from '@/lib/tenants/use-commerciaux'
import { CommercialFilter } from '@/components/admin/commercial-filter'
import { CommercialCell } from '@/components/admin/commercial-cell'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────
interface EnematClient {
  id: string
  raison_sociale: string
  reference_retina: string | null
  telephone: string | null
  email: string | null
  commercial_assigne: string | null
  commercial_code: string | null
  monday_board_id: string | null
  commercial: { code: string; nom: string; parent_code: string | null } | null
  depot_logistique_id: string | null
  depot_retrait_id: string | null
  velo_valide: number | null
  velo_devis: number
  statut_commercial: string | null
  statut_enemat: string | null
  date_entree_enemat: string | null
  date_depot_enemat: string | null
  date_apf_enemat: string | null
  date_paye_enemat: string | null
  fnuci_ids: string[] | null
  fnuci_declared: boolean | null
  fnuci_declared_at: string | null
  numero_lot_enemat: string | null
  numero_facture_enemat: string | null
  depot_nom: string | null
  livraison: {
    mode_livraison: string | null
    date_livraison_effective: string | null
    cq_valide_at: string | null
  } | null
  // joined from API
  depot: { id: string; nom: string } | null
  mode_livraison: string | null
  date_livraison: string | null
  date_livraison_effective: string | null
  date_controle: string | null
}

// ─── Statut config ───────────────────────────────────────────────
const ENEMAT_STATUTS = [
  { value: 'a_deposer_enemat', label: 'A deposer' },
  { value: 'depose_enemat', label: 'Depose' },
  { value: 'apf_enemat', label: 'APF' },
  { value: 'paye_enemat', label: 'Paye' },
] as const

const ENEMAT_COLORS: Record<string, string> = {
  a_deposer_enemat: 'bg-amber-100 text-amber-800',
  depose_enemat: 'bg-blue-100 text-blue-800',
  apf_enemat: 'bg-indigo-100 text-indigo-800',
  paye_enemat: 'bg-green-100 text-green-800',
}

const ENEMAT_LABELS: Record<string, string> = {
  a_deposer_enemat: 'A deposer',
  depose_enemat: 'Depose',
  apf_enemat: 'APF',
  paye_enemat: 'Paye',
}

// ─── Workflow: next statut only ──────────────────────────────────
const ENEMAT_WORKFLOW_ORDER = ['a_deposer_enemat', 'depose_enemat', 'apf_enemat', 'paye_enemat']

function getNextStatut(currentStatut: string): string | null {
  const idx = ENEMAT_WORKFLOW_ORDER.indexOf(currentStatut)
  if (idx === -1 || idx >= ENEMAT_WORKFLOW_ORDER.length - 1) return null
  return ENEMAT_WORKFLOW_ORDER[idx + 1]
}

// ─── Sortable header ─────────────────────────────────────────────
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

// ─── Main page ───────────────────────────────────────────────────
export default function AdminEnematPage() {
  const adminUser = useAdminUser()
  const tenantId = getTenantId()
  const { parents: commerciauxParents } = useCommerciaux(tenantId)

  const [clients, setClients] = useState<EnematClient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState<string[]>([])
  const [depotFilter, setDepotFilter] = useState<string[]>([])
  const [zoneFilter, setZoneFilter] = useState<string[]>([])
  const [commercialFilter, setCommercialFilter] = useState<string[]>([])
  const [livreurFilter, setLivreurFilter] = useState<string[]>([])
  const [cqFilter, setCqFilter] = useState<string>('all')
  const [fnuciFilter, setFnuciFilter] = useState<string>('all')
  const [lotFilter, setLotFilter] = useState<string>('')
  const [factureFilter, setFactureFilter] = useState<string>('')
  const [fnuciDeclareLoading, setFnuciDeclareLoading] = useState(false)
  const [dateDepotFrom, setDateDepotFrom] = useState('')
  const [dateDepotTo, setDateDepotTo] = useState('')
  const [dateApfFrom, setDateApfFrom] = useState('')
  const [dateApfTo, setDateApfTo] = useState('')
  const [datePayeFrom, setDatePayeFrom] = useState('')
  const [datePayeTo, setDatePayeTo] = useState('')
  const [sortBy, setSortBy] = useState('date_entree_enemat')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [paginationInfo, setPaginationInfo] = useState({ totalPages: 0, totalFiltered: 0, startIndex: 0, endIndex: 0 })
  const [counts, setCounts] = useState<Record<string, number>>({ a_deposer_enemat: 0, depose_enemat: 0, apf_enemat: 0, paye_enemat: 0 })
  const [velosValidesFiltered, setVelosValidesFiltered] = useState(0)

  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  // Revert to controle dialog
  const [revertTarget, setRevertTarget] = useState<EnematClient | null>(null)
  const [revertLoading, setRevertLoading] = useState(false)
  const [revertCommentaire, setRevertCommentaire] = useState('')

  // Bulk revert dialog
  const [bulkRevertOpen, setBulkRevertOpen] = useState(false)
  const [bulkRevertCommentaire, setBulkRevertCommentaire] = useState('')

  // Filter options
  const [depotOptions, setDepotOptions] = useState<{ value: string; label: string }[]>([])
  const [livreurOptions, setLivreurOptions] = useState<{ value: string; label: string }[]>([])

  // Load filter options
  useEffect(() => {
    fetch('/api/depots').then(r => r.json()).then(data => {
      const depots: { id: string; nom: string }[] = Array.isArray(data) ? data : data.depots || []
      setDepotOptions(depots.map(d => ({ value: d.id, label: d.nom })))
    }).catch(() => {})

    fetch('/api/admin/livreurs').then(r => r.json()).then(data => {
      const livreurs: { id: string; nom: string; prenom: string }[] = data.livreurs || []
      const sorted = [...livreurs].sort((a, b) => {
        const an = `${a.nom} ${a.prenom}`.trim().toLowerCase()
        const bn = `${b.nom} ${b.prenom}`.trim().toLowerCase()
        return an.localeCompare(bn)
      })
      setLivreurOptions(sorted.map(u => ({ value: u.id, label: `${u.nom} ${u.prenom}`.trim() || u.id })))
    }).catch(() => {})
  }, [])

  // ─── Garde-fou Radix : libere `pointer-events` bloque sur <body> ───
  // Bug Radix connu : a la fermeture d'un Select/Popover/Dialog, le style
  // `pointer-events: none` reste parfois colle sur <body>. La page devient
  // alors non cliquable a la souris (clavier OK, reload debloque).
  // On surveille les mutations de style de <body> + un filet periodique,
  // et on leve le blocage des qu'aucun overlay Radix n'est reellement ouvert.
  useEffect(() => {
    const body = document.body

    const overlayOuvert = () =>
      document.querySelector(
        '[data-radix-popper-content-wrapper],[role="dialog"][data-state="open"],[data-state="open"][role="menu"]'
      ) != null

    const liberer = () => {
      if (body.style.pointerEvents === 'none' && !overlayOuvert()) {
        body.style.removeProperty('pointer-events')
      }
    }

    // Apres une mutation de style : un cycle de rendu pour laisser Radix
    // demonter ses portals avant de juger si un overlay est encore ouvert.
    const observer = new MutationObserver(() => {
      requestAnimationFrame(liberer)
    })
    observer.observe(body, { attributes: true, attributeFilter: ['style'] })

    // Filet de securite : si la mutation de close n'a pas lieu, on rattrape.
    const interval = window.setInterval(liberer, 1000)

    return () => {
      observer.disconnect()
      window.clearInterval(interval)
    }
  }, [])

  const fetchCounts = useCallback(async () => {
    try {
      // Fetch each statut count — use 4 parallel requests with limit=1 to get count
      // Transmettre les filtres actifs (sauf statut_enemat qui est force a chaque appel)
      const statuts = ['a_deposer_enemat', 'depose_enemat', 'apf_enemat', 'paye_enemat']
      const buildParams = (statut: string) => {
        const p = new URLSearchParams()
        p.set('statut_enemat', statut)
        p.set('limit', '1')
        p.set('page', '1')
        if (searchQuery) p.set('search', searchQuery)
        if (depotFilter.length > 0) p.set('depot_id', depotFilter.join(','))
        if (zoneFilter.length > 0) p.set('zone', zoneFilter.join(','))
        if (commercialFilter.length > 0) p.set('commercial', commercialFilter.join(','))
        if (livreurFilter.length > 0) p.set('livreur', livreurFilter.join(','))
        if (fnuciFilter !== 'all') p.set('fnuci', fnuciFilter)
        if (dateDepotFrom) p.set('date_depot_from', dateDepotFrom)
        if (dateDepotTo) p.set('date_depot_to', dateDepotTo)
        if (dateApfFrom) p.set('date_apf_from', dateApfFrom)
        if (dateApfTo) p.set('date_apf_to', dateApfTo)
        if (datePayeFrom) p.set('date_paye_from', datePayeFrom)
        if (datePayeTo) p.set('date_paye_to', datePayeTo)
        return p.toString()
      }
      const results = await Promise.all(
        statuts.map(s => fetch(`/api/admin/enemat?${buildParams(s)}`).then(r => r.json()))
      )
      const newCounts: Record<string, number> = {}
      statuts.forEach((s, i) => {
        newCounts[s] = results[i]?.total || 0
      })
      setCounts(newCounts)
    } catch {}
  }, [searchQuery, depotFilter, zoneFilter, commercialFilter, livreurFilter, fnuciFilter, dateDepotFrom, dateDepotTo, dateApfFrom, dateApfTo, datePayeFrom, datePayeTo])

  const fetchClients = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', pageSize.toString())
      if (searchQuery) params.set('search', searchQuery)
      if (statutFilter.length > 0) params.set('statut_enemat', statutFilter.join(','))
      if (depotFilter.length > 0) params.set('depot_id', depotFilter.join(','))
      if (zoneFilter.length > 0) params.set('zone', zoneFilter.join(','))
      if (commercialFilter.length > 0) params.set('commercial', commercialFilter.join(','))
      if (livreurFilter.length > 0) params.set('livreur', livreurFilter.join(','))
      if (fnuciFilter !== 'all') params.set('fnuci', fnuciFilter)
      if (lotFilter) params.set('lot', lotFilter)
      if (factureFilter) params.set('facture', factureFilter)
      if (dateDepotFrom) params.set('date_depot_from', dateDepotFrom)
      if (dateDepotTo) params.set('date_depot_to', dateDepotTo)
      if (dateApfFrom) params.set('date_apf_from', dateApfFrom)
      if (dateApfTo) params.set('date_apf_to', dateApfTo)
      if (datePayeFrom) params.set('date_paye_from', datePayeFrom)
      if (datePayeTo) params.set('date_paye_to', datePayeTo)

      const res = await fetch(`/api/admin/enemat?${params.toString()}`)
      const data = await res.json()

      if (!res.ok) {
        console.error('Erreur API enemat:', data.error || res.status)
      }

      setClients(data.clients || [])
      setVelosValidesFiltered(data.velosValidesFiltered || 0)
      const total = data.total || 0
      const totalPages = Math.ceil(total / pageSize)
      setPaginationInfo({
        totalPages,
        totalFiltered: total,
        startIndex: total > 0 ? (page - 1) * pageSize + 1 : 0,
        endIndex: Math.min(page * pageSize, total),
      })

      // Counts — fetch separately for accurate numbers
      const countRes = await fetch('/api/admin/enemat?limit=1&page=1')
      if (countRes.ok) {
        // We'll compute counts from the response or do it client side
      }

      // Compute counts from all statuts
      fetchCounts()
    } catch (err) {
      console.error('Erreur chargement ENEMAT:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchQuery, statutFilter, depotFilter, zoneFilter, commercialFilter, livreurFilter, fnuciFilter, lotFilter, factureFilter, dateDepotFrom, dateDepotTo, dateApfFrom, dateApfTo, datePayeFrom, datePayeTo, fetchCounts])

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
    zoneFilter: zoneFilter.join(','),
    commercialFilter: commercialFilter.join(','),
    livreurFilter: livreurFilter.join(','),
    dateDepotFrom,
    dateDepotTo,
    dateApfFrom,
    dateApfTo,
    datePayeFrom,
    datePayeTo,
    sortBy,
    sortOrder,
  })
  useEffect(() => {
    const prev = prevFilters.current
    const cur = {
      statutFilter: statutFilter.join(','),
      depotFilter: depotFilter.join(','),
      zoneFilter: zoneFilter.join(','),
      commercialFilter: commercialFilter.join(','),
      livreurFilter: livreurFilter.join(','),
      dateDepotFrom,
      dateDepotTo,
      dateApfFrom,
      dateApfTo,
      datePayeFrom,
      datePayeTo,
      sortBy,
      sortOrder,
    }
    if (
      prev.statutFilter !== cur.statutFilter || prev.depotFilter !== cur.depotFilter ||
      prev.zoneFilter !== cur.zoneFilter ||
      prev.commercialFilter !== cur.commercialFilter ||
      prev.livreurFilter !== cur.livreurFilter ||
      prev.dateDepotFrom !== cur.dateDepotFrom || prev.dateDepotTo !== cur.dateDepotTo ||
      prev.dateApfFrom !== cur.dateApfFrom || prev.dateApfTo !== cur.dateApfTo ||
      prev.datePayeFrom !== cur.datePayeFrom || prev.datePayeTo !== cur.datePayeTo ||
      prev.sortBy !== cur.sortBy || prev.sortOrder !== cur.sortOrder
    ) {
      setPage(1)
      prevFilters.current = cur
    }
  }, [statutFilter, depotFilter, zoneFilter, commercialFilter, livreurFilter, dateDepotFrom, dateDepotTo, dateApfFrom, dateApfTo, datePayeFrom, datePayeTo, sortBy, sortOrder])

  useEffect(() => {
    fetchClients()
  }, [fetchClients, debouncedSearch])

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
    setZoneFilter([])
    setCommercialFilter([])
    setLivreurFilter([])
    setCqFilter('all')
    setLotFilter('')
    setFactureFilter('')
    setDateDepotFrom('')
    setDateDepotTo('')
    setDateApfFrom('')
    setDateApfTo('')
    setDatePayeFrom('')
    setDatePayeTo('')
    setSortBy('date_entree_enemat')
    setSortOrder('desc')
    setPage(1)
  }

  const hasActiveFilters = searchQuery || statutFilter.length > 0 || depotFilter.length > 0 || zoneFilter.length > 0 || commercialFilter.length > 0 || livreurFilter.length > 0 || cqFilter !== 'all' || fnuciFilter !== 'all' || !!lotFilter || !!factureFilter || dateDepotFrom || dateDepotTo || dateApfFrom || dateApfTo || datePayeFrom || datePayeTo

  // ─── Selection ────────────────────────────────────────────────
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
    if (selectedClients.size === filteredClients.length) {
      setSelectedClients(new Set())
    } else {
      setSelectedClients(new Set(filteredClients.map(c => c.id)))
    }
  }

  const handleClearSelection = () => setSelectedClients(new Set())

  // ─── Bulk statut change ───────────────────────────────────────
  const handleBulkStatutChange = async (newStatut: string) => {
    if (selectedClients.size === 0) return
    setBulkActionLoading(true)
    try {
      const res = await fetch('/api/admin/enemat/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_ids: Array.from(selectedClients),
          statut: newStatut,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur')
      }
      const data = await res.json()
      toast.success(`${data.count} client${data.count > 1 ? 's' : ''} mis a jour vers "${ENEMAT_LABELS[newStatut] || newStatut}"`)
      setSelectedClients(new Set())
      fetchClients()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBulkActionLoading(false)
    }
  }

  // ─── Export FNUCI Bicycode (Excel) ──────────────────────────
  const handleFnuciDeclare = async () => {
    if (selectedClients.size === 0) return
    setFnuciDeclareLoading(true)
    try {
      const res = await fetch('/api/admin/fnuci/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: Array.from(selectedClients) }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur')
      }

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('spreadsheetml')) {
        // Un seul fichier — télécharger directement
        const blob = await res.blob()
        const disposition = res.headers.get('content-disposition') || ''
        const match = disposition.match(/filename="(.+)"/)
        const filename = match ? match[1] : 'declaration-fnuci.xlsx'
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Fichier FNUCI exporté — FNUCI marqués comme déclarés')
      } else {
        // Plusieurs fichiers (JSON avec base64)
        const data = await res.json()
        for (const file of data.files) {
          const byteArray = Uint8Array.from(atob(file.data), c => c.charCodeAt(0))
          const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = file.name
          a.click()
          URL.revokeObjectURL(url)
        }
        toast.success(`${data.summary.total_fichiers} fichier(s) FNUCI exporté(s) — ${data.summary.total_velos} vélo(s) déclaré(s)`)
      }

      setSelectedClients(new Set())
      fetchClients()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setFnuciDeclareLoading(false)
    }
  }

  // ─── Bulk revert ──────────────────────────────────────────────
  const handleBulkRevert = async () => {
    if (selectedClients.size === 0 || !bulkRevertCommentaire.trim()) return
    setBulkActionLoading(true)
    try {
      const res = await fetch('/api/admin/enemat/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: Array.from(selectedClients), commentaire: bulkRevertCommentaire.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur')
      }
      const data = await res.json()
      toast.success(`${data.count} client${data.count > 1 ? 's' : ''} renvoye${data.count > 1 ? 's' : ''} en controle`)
      setSelectedClients(new Set())
      setBulkRevertOpen(false)
      setBulkRevertCommentaire('')
      fetchClients()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBulkActionLoading(false)
    }
  }

  // ─── Single revert ────────────────────────────────────────────
  const handleSingleRevert = async () => {
    if (!revertTarget || !revertCommentaire.trim()) return
    setRevertLoading(true)
    try {
      const res = await fetch('/api/admin/enemat/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: [revertTarget.id], commentaire: revertCommentaire.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur')
      }
      toast.success(`${revertTarget.raison_sociale} renvoye en controle`)
      setRevertTarget(null)
      setRevertCommentaire('')
      fetchClients()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRevertLoading(false)
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────
  const formatDate = (d: string | null) => {
    if (!d) return '-'
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch { return '-' }
  }

  // ─── Client-side filters (CQ + dates) ─────────────────────────
  const filteredClients = useMemo(() => {
    let result = clients

    // CQ filter
    if (cqFilter === 'valide') {
      result = result.filter(c => !!c.livraison?.cq_valide_at || !!c.date_controle)
    } else if (cqFilter === 'non_valide') {
      result = result.filter(c => !c.livraison?.cq_valide_at && !c.date_controle)
    }

    // Date depot ENEMAT filter
    if (dateDepotFrom) {
      result = result.filter(c => c.date_depot_enemat && c.date_depot_enemat >= dateDepotFrom)
    }
    if (dateDepotTo) {
      result = result.filter(c => c.date_depot_enemat && c.date_depot_enemat <= dateDepotTo)
    }

    // Date APF filter
    if (dateApfFrom) {
      result = result.filter(c => c.date_apf_enemat && c.date_apf_enemat >= dateApfFrom)
    }
    if (dateApfTo) {
      result = result.filter(c => c.date_apf_enemat && c.date_apf_enemat <= dateApfTo)
    }

    // Date paye filter
    if (datePayeFrom) {
      result = result.filter(c => c.date_paye_enemat && c.date_paye_enemat >= datePayeFrom)
    }
    if (datePayeTo) {
      result = result.filter(c => c.date_paye_enemat && c.date_paye_enemat <= datePayeTo)
    }

    return result
  }, [clients, cqFilter, dateDepotFrom, dateDepotTo, dateApfFrom, dateApfTo, datePayeFrom, datePayeTo])

  // ─── Import Excel : passage direct en APF / Payé via liste de réf Retina ─────
  // APF  : colonne A = réf Retina, colonne B = numéro de lot (par ligne).
  // Payé : colonne A = réf Retina ; numéro de facture commun demandé via dialogue.
  const [importLoading, setImportLoading] = useState<null | 'apf_enemat' | 'paye_enemat'>(null)
  const importApfInputRef = useRef<HTMLInputElement>(null)
  const [payeDialogOpen, setPayeDialogOpen] = useState(false)
  const [payeFacture, setPayeFacture] = useState('')
  const [payeFile, setPayeFile] = useState<File | null>(null)

  const doImport = async (
    file: File,
    statut: 'apf_enemat' | 'paye_enemat',
    numeroFacture?: string
  ) => {
    if (importLoading) return
    setImportLoading(statut)
    const label = statut === 'apf_enemat' ? 'APF' : 'Payé'
    const toastId = toast.loading(`Import en cours → ${label}…`)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('statut', statut)
      if (numeroFacture) formData.append('numero_facture', numeroFacture)

      const res = await fetch('/api/admin/enemat/import-status', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur import')

      const parts = [`${data.updated} client${data.updated > 1 ? 's' : ''} passé${data.updated > 1 ? 's' : ''} en ${data.statut_label}`]
      if (statut === 'apf_enemat') parts.push(`${data.lots_appliques} lot(s) appliqué(s)`)
      if (data.numero_facture) parts.push(`facture ${data.numero_facture}`)
      if (data.not_found_count > 0) {
        parts.push(`${data.not_found_count} référence${data.not_found_count > 1 ? 's' : ''} introuvable${data.not_found_count > 1 ? 's' : ''}`)
      }
      toast.success(parts.join(' — '), { id: toastId })
      if (data.not_found_count > 0) {
        const apercu = (data.not_found as string[]).slice(0, 10).join(', ')
        toast.warning(
          `Réf. non trouvées (${data.not_found_count}) : ${apercu}${data.not_found_count > 10 ? '…' : ''}`,
          { duration: 12000 }
        )
      }
      fetchClients()
    } catch (err) {
      toast.error((err as Error).message, { id: toastId })
    } finally {
      setImportLoading(null)
    }
  }

  const handleImportApf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset pour re-sélectionner le même fichier
    if (file) doImport(file, 'apf_enemat')
  }

  const submitPayeImport = async () => {
    if (!payeFile || payeFacture.trim().length === 0) return
    await doImport(payeFile, 'paye_enemat', payeFacture.trim())
    setPayeDialogOpen(false)
    setPayeFacture('')
    setPayeFile(null)
  }

  // ─── Export Excel (refetch toutes les lignes filtrees, max 5000) ─────
  const [exportLoading, setExportLoading] = useState(false)
  const handleExport = async () => {
    if (exportLoading) return
    setExportLoading(true)
    try {
      const tenant = getTenantConfig()
      const today = new Date().toISOString().slice(0, 10)
      const params = new URLSearchParams()
      params.set('page', '1')
      params.set('limit', '5000')
      if (searchQuery) params.set('search', searchQuery)
      if (statutFilter.length > 0) params.set('statut_enemat', statutFilter.join(','))
      if (depotFilter.length > 0) params.set('depot_id', depotFilter.join(','))
      if (zoneFilter.length > 0) params.set('zone', zoneFilter.join(','))
      if (commercialFilter.length > 0) params.set('commercial', commercialFilter.join(','))
      if (livreurFilter.length > 0) params.set('livreur', livreurFilter.join(','))
      if (fnuciFilter !== 'all') params.set('fnuci', fnuciFilter)
      if (lotFilter) params.set('lot', lotFilter)
      if (factureFilter) params.set('facture', factureFilter)
      if (dateDepotFrom) params.set('date_depot_from', dateDepotFrom)
      if (dateDepotTo) params.set('date_depot_to', dateDepotTo)
      if (dateApfFrom) params.set('date_apf_from', dateApfFrom)
      if (dateApfTo) params.set('date_apf_to', dateApfTo)
      if (datePayeFrom) params.set('date_paye_from', datePayeFrom)
      if (datePayeTo) params.set('date_paye_to', datePayeTo)

      const res = await fetch(`/api/admin/enemat?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur export')
      const allClients: EnematClient[] = data.clients || []

      // Re-applique les filtres locaux (CQ + dates) que l'API ne gere pas
      const filtered = allClients.filter(c => {
        if (cqFilter === 'valide' && !(c.livraison?.cq_valide_at || c.date_controle)) return false
        if (cqFilter === 'non_valide' && (c.livraison?.cq_valide_at || c.date_controle)) return false
        if (dateDepotFrom && (!c.date_depot_enemat || c.date_depot_enemat < dateDepotFrom)) return false
        if (dateDepotTo && (!c.date_depot_enemat || c.date_depot_enemat > dateDepotTo)) return false
        if (dateApfFrom && (!c.date_apf_enemat || c.date_apf_enemat < dateApfFrom)) return false
        if (dateApfTo && (!c.date_apf_enemat || c.date_apf_enemat > dateApfTo)) return false
        if (datePayeFrom && (!c.date_paye_enemat || c.date_paye_enemat < datePayeFrom)) return false
        if (datePayeTo && (!c.date_paye_enemat || c.date_paye_enemat > datePayeTo)) return false
        return true
      })

      exportToXlsx(filtered, [
        { header: 'Raison sociale', accessor: r => r.raison_sociale },
        { header: 'Réf. Retina', accessor: r => r.reference_retina },
        { header: 'Commercial', accessor: r => r.commercial?.nom || r.commercial_code || r.commercial_assigne || '' },
        { header: 'Dépôt', accessor: r => r.depot?.nom || r.depot_nom || '' },
        { header: 'Nb vélos', accessor: r => r.velo_valide },
        { header: 'Date contrôle', accessor: r => r.livraison?.cq_valide_at || r.date_controle },
        { header: 'Date dépôt ENEMAT', accessor: r => r.date_depot_enemat },
        { header: 'Statut commercial', accessor: r => r.statut_commercial || '' },
        { header: 'Statut ENEMAT', accessor: r => ENEMAT_LABELS[r.statut_enemat || ''] || r.statut_enemat },
        { header: 'Date APF', accessor: r => r.date_apf_enemat },
        { header: 'Date payé', accessor: r => r.date_paye_enemat },
        { header: 'Lot', accessor: r => r.numero_lot_enemat || '' },
        { header: 'N° facture', accessor: r => r.numero_facture_enemat || '' },
      ], `Export-ENEMAT-${tenant.name}-${today}.xlsx`)
      toast.success(`Export ENEMAT : ${filtered.length} lignes`)
    } catch (e: any) {
      toast.error(e.message || 'Erreur export')
    } finally {
      setExportLoading(false)
    }
  }

  const totalEnemat = Object.values(counts).reduce((a, b) => a + b, 0)
  const hasDateFilters = dateDepotFrom || dateDepotTo || dateApfFrom || dateApfTo || datePayeFrom || datePayeTo

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCheck className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">ENEMAT</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Import APF : Excel colonne A = réf Retina, colonne B = numéro de lot */}
          <input
            ref={importApfInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportApf}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => importApfInputRef.current?.click()}
            disabled={importLoading !== null}
            title="Importer un Excel (colonne A = réf Retina, colonne B = numéro de lot) → passage direct en APF"
          >
            {importLoading === 'apf_enemat'
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Upload className="h-4 w-4 mr-1" />}
            Importer → APF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setPayeDialogOpen(true)}
            disabled={importLoading !== null}
            title="Importer un Excel de réf. Retina + numéro de facture → passage direct en Payé"
          >
            {importLoading === 'paye_enemat'
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Upload className="h-4 w-4 mr-1" />}
            Importer → Payé
          </Button>
          <Button variant="outline" size="sm" onClick={fetchClients} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Dialogue Import Payé : numéro de facture + fichier Excel */}
      <Dialog open={payeDialogOpen} onOpenChange={(open) => {
        setPayeDialogOpen(open)
        if (!open) { setPayeFacture(''); setPayeFile(null) }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importer une liste → Payé</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Numéro de facture</label>
              <Input
                value={payeFacture}
                onChange={(e) => setPayeFacture(e.target.value)}
                placeholder="ex : FAC-2026-0042"
              />
              <p className="text-xs text-muted-foreground">Appliqué à tous les clients du fichier.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fichier Excel</label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setPayeFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Colonne A = réf. Retina (titre en ligne 1, données dès la ligne 2).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayeDialogOpen(false)} disabled={importLoading !== null}>
              Annuler
            </Button>
            <Button
              onClick={submitPayeImport}
              disabled={importLoading !== null || !payeFile || payeFacture.trim().length === 0}
            >
              {importLoading === 'paye_enemat' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Importer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats compteurs */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{paginationInfo.totalFiltered} <span className="text-muted-foreground font-normal">clients</span></span>
        <span className="text-muted-foreground">—</span>
        <span className="font-semibold text-blue-600">{velosValidesFiltered} <span className="text-muted-foreground font-normal">vélos validés</span></span>
        <span className="text-muted-foreground">|</span>
        {ENEMAT_STATUTS.map(s => (
          <button
            key={s.value}
            onClick={() => setStatutFilter(statutFilter.includes(s.value) ? statutFilter.filter(v => v !== s.value) : [...statutFilter, s.value])}
            className="cursor-pointer"
          >
            <Badge className={`${ENEMAT_COLORS[s.value]} ${statutFilter.includes(s.value) ? 'ring-2 ring-offset-1 ring-primary' : ''}`}>
              {s.label} ({counts[s.value] || 0})
            </Badge>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[140px] flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher (societe, SIRET, ref. Retina)..."
            className="pl-8 h-8 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Statut ENEMAT multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Statut {statutFilter.length > 0 && `(${statutFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="max-h-60 overflow-y-auto">
              {ENEMAT_STATUTS.map(o => (
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
                  <span className={`inline-block w-2 h-2 rounded-full ${ENEMAT_COLORS[o.value]?.split(' ')[0] || ''}`} />
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

        {/* Depot multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Depot {depotFilter.length > 0 && `(${depotFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="max-h-60 overflow-y-auto">
              {depotOptions.map(o => (
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

        {/* Zone multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0">
              Zone {zoneFilter.length > 0 && `(${zoneFilter.length})`}
              <ChevronDown className="ml-1 h-3 w-3" />
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

        {/* Filtre commercial hiérarchique */}
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
              {livreurOptions.map(o => (
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

        {/* CQ filter */}
        <Select value={cqFilter} onValueChange={(v) => { setCqFilter(v); setPage(1) }}>
          <SelectTrigger className="h-8 w-[120px] text-xs px-2 shrink-0">
            <SelectValue placeholder="CQ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">CQ : Tous</SelectItem>
            <SelectItem value="valide">CQ Validé</SelectItem>
            <SelectItem value="non_valide">CQ Non validé</SelectItem>
          </SelectContent>
        </Select>

        <Select value={fnuciFilter} onValueChange={(v) => { setFnuciFilter(v); setPage(1) }}>
          <SelectTrigger className={`h-8 w-[120px] text-xs px-2 shrink-0 ${fnuciFilter !== 'all' ? 'bg-violet-100 text-violet-800 border-violet-300' : ''}`}>
            <SelectValue placeholder="FNUCI" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">FNUCI : Tous</SelectItem>
            <SelectItem value="oui">Déclaré</SelectItem>
            <SelectItem value="non">Non déclaré</SelectItem>
          </SelectContent>
        </Select>

        {/* Lot filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`h-8 text-xs px-2 shrink-0 ${lotFilter ? 'border-primary text-primary' : ''}`}>
              Lot {lotFilter && '●'}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-2">
              <Input
                placeholder="N° de lot..."
                className="h-8 text-xs"
                value={lotFilter && !lotFilter.startsWith('__') ? lotFilter : ''}
                onChange={(e) => { setLotFilter(e.target.value); setPage(1) }}
              />
              <div className="flex flex-col gap-1">
                <Button variant={lotFilter === '__any__' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs justify-start" onClick={() => { setLotFilter('__any__'); setPage(1) }}>Avec lot</Button>
                <Button variant={lotFilter === '__none__' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs justify-start" onClick={() => { setLotFilter('__none__'); setPage(1) }}>Sans lot</Button>
              </div>
              {lotFilter && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setLotFilter(''); setPage(1) }}>Effacer</Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Facture filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`h-8 text-xs px-2 shrink-0 ${factureFilter ? 'border-primary text-primary' : ''}`}>
              N° facture {factureFilter && '●'}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-2">
              <Input
                placeholder="N° de facture..."
                className="h-8 text-xs"
                value={factureFilter && !factureFilter.startsWith('__') ? factureFilter : ''}
                onChange={(e) => { setFactureFilter(e.target.value); setPage(1) }}
              />
              <div className="flex flex-col gap-1">
                <Button variant={factureFilter === '__any__' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs justify-start" onClick={() => { setFactureFilter('__any__'); setPage(1) }}>Avec facture</Button>
                <Button variant={factureFilter === '__none__' ? 'default' : 'ghost'} size="sm" className="h-7 text-xs justify-start" onClick={() => { setFactureFilter('__none__'); setPage(1) }}>Sans facture</Button>
              </div>
              {factureFilter && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setFactureFilter(''); setPage(1) }}>Effacer</Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Date filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`h-8 text-xs px-2 shrink-0 ${hasDateFilters ? 'border-primary text-primary' : ''}`}>
              <Calendar className="h-3 w-3 mr-1" />
              Dates {hasDateFilters && '●'}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">Date dépôt ENEMAT</p>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={dateDepotFrom} onChange={e => setDateDepotFrom(e.target.value)} className="flex-1 h-7 text-xs px-2 border rounded-md bg-background" />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input type="date" value={dateDepotTo} onChange={e => setDateDepotTo(e.target.value)} className="flex-1 h-7 text-xs px-2 border rounded-md bg-background" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">Date APF</p>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={dateApfFrom} onChange={e => setDateApfFrom(e.target.value)} className="flex-1 h-7 text-xs px-2 border rounded-md bg-background" />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input type="date" value={dateApfTo} onChange={e => setDateApfTo(e.target.value)} className="flex-1 h-7 text-xs px-2 border rounded-md bg-background" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">Date payé</p>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={datePayeFrom} onChange={e => setDatePayeFrom(e.target.value)} className="flex-1 h-7 text-xs px-2 border rounded-md bg-background" />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input type="date" value={datePayeTo} onChange={e => setDatePayeTo(e.target.value)} className="flex-1 h-7 text-xs px-2 border rounded-md bg-background" />
                </div>
              </div>
              {hasDateFilters && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => {
                  setDateDepotFrom(''); setDateDepotTo('')
                  setDateApfFrom(''); setDateApfTo('')
                  setDatePayeFrom(''); setDatePayeTo('')
                }}>
                  Effacer les dates
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

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
          <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={resetFilters}>
            <X className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}

        {/* Export Excel */}
        <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0" onClick={handleExport} disabled={exportLoading}>
          {exportLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
          Export
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <FileCheck className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Aucun dossier ENEMAT</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredClients.length > 0 && selectedClients.size === filteredClients.length}
                        onCheckedChange={handleSelectAll}
                        aria-label="Tout selectionner"
                      />
                    </TableHead>
                    <SortableHeader label="Raison sociale" column="raison_sociale" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="hidden xl:table-cell">Ref. Retina</TableHead>
                    <TableHead className="hidden xl:table-cell">Tel.</TableHead>
                    <TableHead className="hidden lg:table-cell">Commercial</TableHead>
                    <TableHead className="hidden md:table-cell">Depot</TableHead>
                    <TableHead className="hidden lg:table-cell">Mode</TableHead>
                    <TableHead className="hidden md:table-cell">Livraison</TableHead>
                    <TableHead className="hidden lg:table-cell text-center">Velos</TableHead>
                    <TableHead className="hidden xl:table-cell">Controle</TableHead>
                    <TableHead className="hidden md:table-cell text-center">FNUCI</TableHead>
                    <TableHead className="hidden md:table-cell">Depot ENEMAT</TableHead>
                    <TableHead className="hidden lg:table-cell">APF</TableHead>
                    <TableHead className="hidden lg:table-cell">Paye</TableHead>
                    <TableHead className="hidden xl:table-cell">Lot</TableHead>
                    <TableHead className="hidden xl:table-cell">N° facture</TableHead>
                    <SortableHeader label="Statut" column="statut_enemat" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id} className={selectedClients.has(client.id) ? 'bg-muted/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedClients.has(client.id)}
                          onCheckedChange={() => handleToggleSelect(client.id)}
                        />
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="font-medium truncate block text-blue-600 hover:underline"
                          title={client.raison_sociale}
                        >
                          {client.raison_sociale}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="text-xs font-mono text-muted-foreground">
                          {client.reference_retina || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {client.telephone ? (
                          <a href={`tel:${client.telephone}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {client.telephone}
                          </a>
                        ) : <span className="text-sm text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <CommercialCell client={client} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm">{client.depot?.nom || client.depot_nom || '-'}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {client.mode_livraison === 'domicile' ? 'Domicile' : client.mode_livraison === 'retrait' ? 'Relais' : client.livraison?.mode_livraison || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1 text-sm">
                          {client.date_livraison_effective || client.livraison?.date_livraison_effective ? (
                            <>
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {formatDate(client.date_livraison_effective || client.livraison?.date_livraison_effective || null)}
                            </>
                          ) : '-'}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-center">
                        <span className="text-sm font-medium">{client.velo_valide || 0}</span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {client.livraison?.cq_valide_at ? formatDate(client.livraison.cq_valide_at) : (client.date_controle ? formatDate(client.date_controle) : '-')}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-center">
                        {client.fnuci_declared ? (
                          <Badge className="bg-violet-100 text-violet-800">Déclaré</Badge>
                        ) : client.fnuci_ids?.length ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">Non déclaré</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm">{formatDate(client.date_depot_enemat)}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm">{formatDate(client.date_apf_enemat)}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm">{formatDate(client.date_paye_enemat)}</span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="text-xs font-mono">{client.numero_lot_enemat || '-'}</span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="text-xs font-mono">{client.numero_facture_enemat || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {(client.date_controle || client.livraison?.cq_valide_at) ? (
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="CQ validé" />
                          ) : (
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" title="En contrôle" />
                          )}
                          <Badge className={ENEMAT_COLORS[client.statut_enemat || ''] || 'bg-gray-100 text-gray-600'}>
                            {ENEMAT_LABELS[client.statut_enemat || ''] || client.statut_enemat || '-'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {(client.date_controle || (client as any).livraison?.cq_valide_at) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRevertTarget(client)}
                              title="Renvoyer en contrôle"
                              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 active:scale-90 transition-all"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.location.href = `/admin/clients/${client.id}`}
                            title="Voir la fiche"
                            className="active:scale-90 transition-all"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
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
          {paginationInfo.totalFiltered > 0
            ? `${paginationInfo.startIndex}-${paginationInfo.endIndex} sur ${paginationInfo.totalFiltered}`
            : '0 resultats'}
        </div>
        <div className="flex items-center gap-2">
          {paginationInfo.totalPages > 1 && (
            <>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs">{page}/{paginationInfo.totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= paginationInfo.totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Barre d'actions bulk flottante */}
      {selectedClients.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Card className="shadow-lg border-2">
            <CardContent className="flex items-center gap-3 py-3 px-4 flex-wrap">
              <span className="font-medium text-sm whitespace-nowrap">
                {selectedClients.size} client{selectedClients.size > 1 ? 's' : ''} selectionne{selectedClients.size > 1 ? 's' : ''}
              </span>
              <div className="h-6 w-px bg-border" />

              {/* Change statut dropdown — workflow: next step only */}
              {(() => {
                const selectedStatuts = new Set(
                  filteredClients.filter(c => selectedClients.has(c.id)).map(c => c.statut_enemat || '')
                )
                const isMixed = selectedStatuts.size > 1
                const commonStatut = selectedStatuts.size === 1 ? Array.from(selectedStatuts)[0] : null
                const nextStatut = commonStatut ? getNextStatut(commonStatut) : null

                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" disabled={bulkActionLoading}>
                        Changer statut
                        <ChevronDown className="ml-1 h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" align="start">
                      {isMixed ? (
                        <p className="text-xs text-muted-foreground px-2 py-1.5">Selectionnez des clients au meme statut</p>
                      ) : nextStatut ? (
                        <button
                          onClick={() => handleBulkStatutChange(nextStatut)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-muted rounded text-left"
                        >
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${ENEMAT_COLORS[nextStatut]?.split(' ')[0] || ''}`} />
                          {ENEMAT_LABELS[nextStatut]}
                        </button>
                      ) : (
                        <p className="text-xs text-muted-foreground px-2 py-1.5">Aucune etape suivante</p>
                      )}
                    </PopoverContent>
                  </Popover>
                )
              })()}

              {/* Déclarer FNUCI */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleFnuciDeclare}
                disabled={fnuciDeclareLoading || bulkActionLoading}
                className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
              >
                {fnuciDeclareLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Export FNUCI Bicycode
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => { setBulkRevertCommentaire(''); setBulkRevertOpen(true) }}
                disabled={bulkActionLoading}
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Renvoyer en controle
              </Button>

              <Button size="sm" variant="ghost" onClick={handleClearSelection} disabled={bulkActionLoading}>
                <X className="h-4 w-4" />
              </Button>
              {bulkActionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog revert single client */}
      <Dialog open={!!revertTarget} onOpenChange={(open) => { if (!open) { setRevertTarget(null); setRevertCommentaire('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renvoyer en controle</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le dossier <strong>{revertTarget?.raison_sociale}</strong> sera retire du workflow ENEMAT et renvoye en controle qualite.
            Les dates ENEMAT seront reinitialises.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Commentaire (obligatoire)</label>
            <Textarea
              placeholder="Expliquez pourquoi ce client retourne en controle..."
              value={revertCommentaire}
              onChange={(e) => setRevertCommentaire(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRevertTarget(null); setRevertCommentaire('') }} disabled={revertLoading}>
              Annuler
            </Button>
            <Button
              onClick={handleSingleRevert}
              disabled={revertLoading || !revertCommentaire.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {revertLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog revert bulk */}
      <Dialog open={bulkRevertOpen} onOpenChange={(open) => { if (!open) { setBulkRevertOpen(false); setBulkRevertCommentaire('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renvoyer en controle</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedClients.size} client{selectedClients.size > 1 ? 's' : ''} seront retire{selectedClients.size > 1 ? 's' : ''} du workflow ENEMAT et renvoye{selectedClients.size > 1 ? 's' : ''} en controle qualite.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Commentaire (obligatoire)</label>
            <Textarea
              placeholder="Expliquez pourquoi ces clients retournent en controle..."
              value={bulkRevertCommentaire}
              onChange={(e) => setBulkRevertCommentaire(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkRevertOpen(false); setBulkRevertCommentaire('') }} disabled={bulkActionLoading}>
              Annuler
            </Button>
            <Button
              onClick={handleBulkRevert}
              disabled={bulkActionLoading || !bulkRevertCommentaire.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {bulkActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
