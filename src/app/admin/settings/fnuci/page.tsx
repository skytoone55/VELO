'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Search,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react'
import Link from 'next/link'

interface FnuciRecord {
  id: string
  numero: number
  reference: string
  statut: string
  detenteur: string | null
  client_id: string | null
  livraison_id: string | null
  attribue_at: string | null
  distribue_at: string | null
  created_at: string
  client: { id: string; raison_sociale: string; reference_retina: string | null } | null
}

interface Pagination {
  page: number
  pageSize: number
  totalPages: number
  totalFiltered: number
}

const STATUT_COLORS: Record<string, string> = {
  disponible: 'bg-green-100 text-green-800',
  distribue: 'bg-blue-100 text-blue-800',
  attribue: 'bg-purple-100 text-purple-800',
  bloque: 'bg-red-100 text-red-800',
}

const STATUT_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  distribue: 'Distribue',
  attribue: 'Attribue',
  bloque: 'Bloque',
}

export default function FnuciManagementPage() {
  const [records, setRecords] = useState<FnuciRecord[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, totalPages: 0, totalFiltered: 0 })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [sortBy, setSortBy] = useState('numero')
  const [sortOrder, setSortOrder] = useState('asc')
  const [searchInput, setSearchInput] = useState('')

  // PPE guard
  const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'ecovolt'
  if (tenantId === 'ecovolt') {
    return (
      <div className="p-8 text-center text-muted-foreground">
        La gestion FNUCI n&apos;est pas disponible pour ce tenant.
      </div>
    )
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: '50',
        sortBy,
        sortOrder,
      })
      if (search) params.set('search', search)
      if (statutFilter !== 'all') params.set('statut', statutFilter)

      const res = await fetch(`/api/admin/fnuci?${params}`)
      const data = await res.json()

      if (res.ok) {
        setRecords(data.fnuci || [])
        setPagination(data.pagination || { page: 1, pageSize: 50, totalPages: 0, totalFiltered: 0 })
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search, statutFilter, sortBy, sortOrder])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleStatusChange = async (id: string, newStatut: string) => {
    setActionLoading(id)
    try {
      const res = await fetch('/api/admin/fnuci', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, statut: newStatut }),
      })
      if (res.ok) {
        await fetchData()
      }
    } catch {
      // silent
    } finally {
      setActionLoading(null)
    }
  }

  const handleSearch = () => {
    setSearch(searchInput)
    setPagination(p => ({ ...p, page: 1 }))
  }

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortOrder('asc')
    }
    setPagination(p => ({ ...p, page: 1 }))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Gestion FNUCI</h1>
        <p className="text-muted-foreground text-sm">
          {pagination.totalFiltered} codes FNUCI au total
        </p>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <Input
            placeholder="Recherche reference..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-xs"
          />
          <Button variant="outline" size="icon" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Select value={statutFilter} onValueChange={(v) => { setStatutFilter(v); setPagination(p => ({ ...p, page: 1 })) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="disponible">Disponible</SelectItem>
            <SelectItem value="distribue">Distribue</SelectItem>
            <SelectItem value="attribue">Attribue</SelectItem>
            <SelectItem value="bloque">Bloque</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('numero')}>
                      N° etiquette <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('reference')}>
                      Reference <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('statut')}>
                      Statut <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Ref. Retina</th>
                  <th className="px-3 py-2 text-left">
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('attribue_at')}>
                      Date attribution <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucun code FNUCI trouve
                    </td>
                  </tr>
                ) : records.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono">{r.numero}</td>
                    <td className="px-3 py-2 font-mono font-medium">{r.reference}</td>
                    <td className="px-3 py-2">
                      <Badge className={STATUT_COLORS[r.statut] || ''} variant="secondary">
                        {STATUT_LABELS[r.statut] || r.statut}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {r.client ? (
                        <Link href={`/admin/clients/${r.client.id}`} className="text-blue-600 hover:underline">
                          {r.client.raison_sociale}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.client?.reference_retina || '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.attribue_at ? new Date(r.attribue_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {actionLoading === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                      ) : r.statut === 'bloque' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatusChange(r.id, 'disponible')}
                          title="Debloquer"
                        >
                          <Unlock className="h-4 w-4 text-green-600" />
                        </Button>
                      ) : r.statut === 'attribue' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatusChange(r.id, 'disponible')}
                          title="Liberer (remettre disponible)"
                        >
                          <Unlock className="h-4 w-4 text-orange-600" />
                        </Button>
                      ) : r.statut === 'disponible' || r.statut === 'distribue' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatusChange(r.id, 'bloque')}
                          title="Bloquer"
                        >
                          <Lock className="h-4 w-4 text-red-600" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} / {pagination.totalPages} ({pagination.totalFiltered} resultats)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
