'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import {
  Loader2, Search, Filter, Truck, MapPin, Calendar, Phone, RefreshCw,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Package,
} from 'lucide-react'
import { getTenantId } from '@/lib/tenants'
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
  date_programmation: string | null
  date_livraison: string | null
  statut: string | null
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
    type_de_zone: string | null
  } | null
  depot: { id: string; nom: string } | null
}

const statutOptions = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'programmee', label: 'Programmee' },
  { value: 'livree', label: 'Livree' },
  { value: 'annulee', label: 'Annulee' },
]

const statutColors: Record<string, string> = {
  en_attente: 'bg-yellow-100 text-yellow-800',
  programmee: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-purple-100 text-purple-800',
  livree: 'bg-green-100 text-green-800',
  annulee: 'bg-red-100 text-red-800',
}

const statutLabels: Record<string, string> = {
  en_attente: 'En attente',
  programmee: 'Programmee',
  en_cours: 'En cours',
  livree: 'Livree',
  annulee: 'Annulee',
}

function SortableHeader({ label, column, currentSort, currentOrder, onSort }: {
  label: string; column: string; currentSort: string; currentOrder: 'asc' | 'desc'; onSort: (col: string) => void
}) {
  const isActive = currentSort === column
  return (
    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => onSort(column)}>
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
  const [livraisons, setLivraisons] = useState<LivraisonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [depotFilter, setDepotFilter] = useState('all')
  const [commercialFilter, setCommercialFilter] = useState('all')
  const [departementFilter, setDepartementFilter] = useState('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [pagination, setPagination] = useState({ totalPages: 0, totalFiltered: 0, startIndex: 0, endIndex: 0 })

  const [depotOptions, setDepotOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Tous les depots' }])
  const [commercialOptions, setCommercialOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Tous' }])
  const [deptOptions, setDeptOptions] = useState<{value: string; label: string}[]>([{ value: 'all', label: 'Tous' }])

  // Load filter options
  useEffect(() => {
    // Depots
    fetch('/api/depots').then(r => r.json()).then(data => {
      const depots = Array.isArray(data) ? data : data.depots || []
      setDepotOptions([
        { value: 'all', label: 'Tous les depots' },
        ...depots.map((d: { id: string; nom: string }) => ({ value: d.id, label: d.nom }))
      ])
    }).catch(() => {})

    // Commercials
    const staticCom = getStaticCommercialOptions()
    if (staticCom) {
      setCommercialOptions([{ value: 'all', label: 'Tous' }, ...staticCom])
    } else {
      fetch('/api/clients/commercials').then(r => r.json()).then((emails: string[]) => {
        if (Array.isArray(emails)) {
          setCommercialOptions([{ value: 'all', label: 'Tous' }, ...emails.map(e => ({ value: e, label: e }))])
        }
      }).catch(() => {})
    }

    // Departements
    const staticDept = getStaticDepartementOptions()
    if (staticDept) {
      setDeptOptions([{ value: 'all', label: 'Tous' }, ...staticDept])
    } else {
      fetch('/api/clients/departements').then(r => r.json()).then((depts: string[]) => {
        if (Array.isArray(depts)) {
          setDeptOptions([{ value: 'all', label: 'Tous' }, ...depts.map(d => ({ value: d, label: d }))])
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
      if (statutFilter !== 'all') params.set('statut', statutFilter)
      if (depotFilter !== 'all') params.set('depot', depotFilter)
      if (commercialFilter !== 'all') params.set('commercial', commercialFilter)
      if (departementFilter !== 'all') params.set('departement', departementFilter)
      if (zoneFilter !== 'all') params.set('zone', zoneFilter)
      if (sortBy !== 'created_at' || sortOrder !== 'desc') {
        params.set('sortBy', sortBy)
        params.set('sortOrder', sortOrder)
      }

      const res = await fetch(`/api/livraisons?${params.toString()}`)
      const data = await res.json()

      setLivraisons(data.livraisons || [])
      setPagination(data.pagination || { totalPages: 0, totalFiltered: 0, startIndex: 0, endIndex: 0 })
    } catch (err) {
      console.error('Erreur chargement livraisons:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchQuery, statutFilter, depotFilter, commercialFilter, departementFilter, zoneFilter, sortBy, sortOrder])

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
  const prevFilters = useRef({ statutFilter, depotFilter, commercialFilter, departementFilter, zoneFilter, sortBy, sortOrder })
  useEffect(() => {
    const prev = prevFilters.current
    if (
      prev.statutFilter !== statutFilter || prev.depotFilter !== depotFilter ||
      prev.commercialFilter !== commercialFilter || prev.departementFilter !== departementFilter ||
      prev.zoneFilter !== zoneFilter || prev.sortBy !== sortBy || prev.sortOrder !== sortOrder
    ) {
      setPage(1)
      prevFilters.current = { statutFilter, depotFilter, commercialFilter, departementFilter, zoneFilter, sortBy, sortOrder }
    }
  }, [statutFilter, depotFilter, commercialFilter, departementFilter, zoneFilter, sortBy, sortOrder])

  useEffect(() => {
    fetchLivraisons()
  }, [fetchLivraisons, debouncedSearch])

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
    setStatutFilter('all')
    setDepotFilter('all')
    setCommercialFilter('all')
    setDepartementFilter('all')
    setZoneFilter('all')
    setSortBy('created_at')
    setSortOrder('desc')
    setPage(1)
  }

  const hasActiveFilters = searchQuery || statutFilter !== 'all' || depotFilter !== 'all' ||
    commercialFilter !== 'all' || departementFilter !== 'all' || zoneFilter !== 'all'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Livraisons</h1>
          <p className="text-muted-foreground">
            {pagination.totalFiltered} livraison{pagination.totalFiltered !== 1 ? 's' : ''}
            {hasActiveFilters ? ' (filtrees)' : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLivraisons} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                {statutOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={depotFilter} onValueChange={setDepotFilter}>
              <SelectTrigger>
                <MapPin className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Depot" />
              </SelectTrigger>
              <SelectContent>
                {depotOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={commercialFilter} onValueChange={setCommercialFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Commercial" />
              </SelectTrigger>
              <SelectContent>
                {commercialOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={departementFilter} onValueChange={setDepartementFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Departement" />
              </SelectTrigger>
              <SelectContent>
                {deptOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les zones</SelectItem>
                <SelectItem value="dans_la_zone">Dans la zone</SelectItem>
                <SelectItem value="hors_zone">Hors zone</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground">
                Reinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : livraisons.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucune livraison</h3>
              <p className="text-muted-foreground text-sm">
                {hasActiveFilters ? 'Aucune livraison ne correspond aux filtres' : 'Les livraisons apparaitront ici'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label="Societe" column="created_at" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead>Email client</TableHead>
                  <TableHead>Telephone</TableHead>
                  <TableHead>Commercial</TableHead>
                  <TableHead>Departement</TableHead>
                  <SortableHeader label="Mode" column="mode_livraison" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead>Adresse</TableHead>
                  <SortableHeader label="Date" column="date_programmation" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Statut" column="statut" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {livraisons.map((liv) => (
                  <TableRow key={liv.id}>
                    <TableCell>
                      <div className="font-medium">{liv.client?.raison_sociale || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">{liv.client?.siret}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {liv.client?.email_beneficiaire || liv.client?.email || '-'}
                    </TableCell>
                    <TableCell>
                      {liv.client?.telephone ? (
                        <a href={`tel:${liv.client.telephone}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {liv.client.telephone}
                        </a>
                      ) : <span className="text-sm text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">
                        {liv.client ? getCommercialName(liv.client) : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {getDepartementLabel(liv.client?.departement, liv.client?.adresse_societe_cp)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        {liv.mode_livraison === 'domicile' ? (
                          <><Truck className="h-3 w-3" /> Domicile</>
                        ) : (
                          <><MapPin className="h-3 w-3" /> Relais</>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm max-w-[200px] truncate">
                        {liv.adresse_livraison_ligne1 || '-'}
                        {liv.adresse_livraison_cp && (
                          <div className="text-xs text-muted-foreground">
                            {liv.adresse_livraison_cp} {liv.adresse_livraison_ville}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {liv.date_programmation ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {new Date(liv.date_programmation).toLocaleDateString('fr-FR')}
                        </div>
                      ) : <span className="text-sm text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge className={statutColors[liv.statut || 'en_attente']}>
                        {statutLabels[liv.statut || 'en_attente'] || liv.statut}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`/admin/livraisons/${liv.id}`}>Voir</a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {pagination.startIndex}-{pagination.endIndex} sur {pagination.totalFiltered}
          </div>
          <div className="flex items-center gap-2">
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[20, 50, 100].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">Page {page}/{pagination.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
