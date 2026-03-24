'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Loader2,
  Search,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Pencil,
  Check,
  X,
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
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [sortBy, setSortBy] = useState('numero')
  const [sortOrder, setSortOrder] = useState('asc')
  const [searchInput, setSearchInput] = useState('')
  const [pendingAction, setPendingAction] = useState<{ id: string; currentStatut: string; targetStatut: string } | null>(null)
  const [editingRefId, setEditingRefId] = useState<string | null>(null)
  const [editRefValue, setEditRefValue] = useState('')
  const [editRefOld, setEditRefOld] = useState('')
  const [refConfirmOpen, setRefConfirmOpen] = useState(false)
  const [refSaving, setRefSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pageSize),
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
  }, [pagination.page, pageSize, search, statutFilter, sortBy, sortOrder])

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

  // Client-side sort for join columns (client_raison_sociale, client_reference_retina)
  const sortedRecords = useMemo(() => {
    if (!['client_raison_sociale', 'client_reference_retina'].includes(sortBy)) return records
    return [...records].sort((a, b) => {
      let aVal = '', bVal = ''
      if (sortBy === 'client_raison_sociale') {
        aVal = a.client?.raison_sociale || ''
        bVal = b.client?.raison_sociale || ''
      } else {
        aVal = a.client?.reference_retina || ''
        bVal = b.client?.reference_retina || ''
      }
      const cmp = aVal.localeCompare(bVal, 'fr')
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [records, sortBy, sortOrder])

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
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPagination(p => ({ ...p, page: 1 })) }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20 / page</SelectItem>
            <SelectItem value="50">50 / page</SelectItem>
            <SelectItem value="100">100 / page</SelectItem>
            <SelectItem value="250">250 / page</SelectItem>
            <SelectItem value="500">500 / page</SelectItem>
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
                  <th className="px-3 py-2 text-left">
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('client_raison_sociale')}>
                      Client <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('client_reference_retina')}>
                      Ref. Retina <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
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
                ) : sortedRecords.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono">{r.numero}</td>
                    <td className="px-3 py-2 font-mono font-medium">
                      {editingRefId === r.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editRefValue}
                            onChange={(e) => setEditRefValue(e.target.value.toUpperCase())}
                            className="h-7 w-32 font-mono text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditingRefId(null)
                              if (e.key === 'Enter' && editRefValue.trim() && editRefValue !== editRefOld) setRefConfirmOpen(true)
                            }}
                          />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                            if (editRefValue.trim() && editRefValue !== editRefOld) setRefConfirmOpen(true)
                          }}><Check className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingRefId(null)}><X className="h-3 w-3" /></Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          <span>{r.reference}</span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                            setEditingRefId(r.id)
                            setEditRefValue(r.reference)
                            setEditRefOld(r.reference)
                          }}><Pencil className="h-3 w-3" /></Button>
                        </div>
                      )}
                    </td>
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
                          onClick={() => setPendingAction({ id: r.id, currentStatut: r.statut, targetStatut: 'disponible' })}
                          title="Debloquer"
                        >
                          <Unlock className="h-4 w-4 text-green-600" />
                        </Button>
                      ) : r.statut === 'attribue' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingAction({ id: r.id, currentStatut: r.statut, targetStatut: 'disponible' })}
                          title="Liberer (remettre disponible)"
                        >
                          <Unlock className="h-4 w-4 text-orange-600" />
                        </Button>
                      ) : r.statut === 'disponible' || r.statut === 'distribue' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingAction({ id: r.id, currentStatut: r.statut, targetStatut: 'bloque' })}
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

      {/* Double validation */}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.targetStatut === 'bloque'
                ? 'Bloquer ce code FNUCI ?'
                : pendingAction?.currentStatut === 'attribue'
                ? 'Liberer ce code FNUCI ?'
                : 'Debloquer ce code FNUCI ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.targetStatut === 'bloque'
                ? 'Ce code ne sera plus disponible pour attribution.'
                : pendingAction?.currentStatut === 'attribue'
                ? 'Le code sera desassigne du client actuel et remis disponible.'
                : 'Ce code redeviendra disponible pour attribution.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingAction) {
                  await handleStatusChange(pendingAction.id, pendingAction.targetStatut)
                  setPendingAction(null)
                }
              }}
              disabled={!!actionLoading}
              className={pendingAction?.targetStatut === 'bloque' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Double validation modification référence */}
      <AlertDialog open={refConfirmOpen} onOpenChange={setRefConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier la référence FNUCI ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous allez changer la référence de <span className="font-mono font-bold">{editRefOld}</span> en <span className="font-mono font-bold">{editRefValue}</span>. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={refSaving} onClick={async () => {
              setRefSaving(true)
              try {
                const newRef = editRefValue.trim().toUpperCase()
                const res = await fetch('/api/admin/fnuci', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: editingRefId, reference: newRef, old_reference: editRefOld }),
                })
                if (res.ok) {
                  await fetchData()
                  setEditingRefId(null)
                  setRefConfirmOpen(false)
                }
              } catch {
                // silent
              } finally {
                setRefSaving(false)
              }
            }}>
              {refSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
