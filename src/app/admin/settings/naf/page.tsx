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
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface NafCode {
  id: number
  code: string
  label: string
  valide: boolean
  updated_at: string
  created_at: string
  clients_count: number
}

interface Pagination {
  page: number
  pageSize: number
  totalPages: number
  totalCodes: number
}

export default function NafCodesPage() {
  const [codes, setCodes] = useState<NafCode[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 100, totalPages: 0, totalCodes: 0 })
  const [pageSize, setPageSize] = useState(100)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [valideFilter, setValideFilter] = useState('all')
  const [pendingToggle, setPendingToggle] = useState<NafCode | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pageSize),
      })
      if (search) params.set('search', search)
      if (valideFilter !== 'all') params.set('valide', valideFilter)

      const res = await fetch(`/api/admin/naf?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCodes(data.naf_codes || [])
        setPagination(data.pagination || { page: 1, pageSize: 100, totalPages: 0, totalCodes: 0 })
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pageSize, search, valideFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggle = async () => {
    if (!pendingToggle) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/naf/${pendingToggle.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valide: !pendingToggle.valide }),
      })
      if (res.ok) {
        const { clients_updated } = await res.json()
        setLastResult(`Code ${pendingToggle.code} mis a jour. ${clients_updated} client${clients_updated > 1 ? 's' : ''} affecte${clients_updated > 1 ? 's' : ''}.`)
        await fetchData()
      }
    } catch {
      // silent
    } finally {
      setActionLoading(false)
      setPendingToggle(null)
    }
  }

  const handleSearch = () => {
    setSearch(searchInput)
    setPagination(p => ({ ...p, page: 1 }))
  }

  // Stats
  const totalOk = codes.filter(c => c.valide).length
  const totalKo = codes.filter(c => !c.valide).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Codes NAF ENEMAT</h1>
        <p className="text-muted-foreground text-sm">
          {pagination.totalCodes} codes au total
          {valideFilter === 'all' && ` — ${totalOk} eligibles / ${totalKo} non eligibles sur cette page`}
        </p>
      </div>

      {lastResult && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-2 rounded-md text-sm flex items-center justify-between">
          <span>{lastResult}</span>
          <button onClick={() => setLastResult(null)} className="text-green-600 hover:text-green-800 ml-2">✕</button>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <Input
            placeholder="Recherche code ou libelle..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-xs"
          />
          <Button variant="outline" size="icon" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Select value={valideFilter} onValueChange={(v) => { setValideFilter(v); setPagination(p => ({ ...p, page: 1 })) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les codes</SelectItem>
            <SelectItem value="true">Eligibles</SelectItem>
            <SelectItem value="false">Non eligibles</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPagination(p => ({ ...p, page: 1 })) }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="50">50 / page</SelectItem>
            <SelectItem value="100">100 / page</SelectItem>
            <SelectItem value="200">200 / page</SelectItem>
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
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Libelle</th>
                  <th className="px-3 py-2 text-left font-medium">Statut</th>
                  <th className="px-3 py-2 text-center font-medium">Clients</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : codes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucun code NAF trouve
                    </td>
                  </tr>
                ) : codes.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono font-medium">{c.code}</td>
                    <td className="px-3 py-2 max-w-[400px]">
                      <span className="line-clamp-1" title={c.label}>{c.label}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        className={c.valide ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                        variant="secondary"
                      >
                        {c.valide ? 'Eligible' : 'Non eligible'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.clients_count > 0 ? (
                        <Badge variant="outline" className="font-mono">{c.clients_count}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingToggle(c)}
                        title={c.valide ? 'Marquer non eligible' : 'Marquer eligible'}
                      >
                        {c.valide ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
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
                Page {pagination.page} / {pagination.totalPages} ({pagination.totalCodes} codes)
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
      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => { if (!open) setPendingToggle(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle?.valide
                ? `Marquer ${pendingToggle?.code} comme non eligible ?`
                : `Marquer ${pendingToggle?.code} comme eligible ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingToggle?.valide
                ? `${pendingToggle?.clients_count || 0} client${(pendingToggle?.clients_count || 0) > 1 ? 's' : ''} avec ce code NAF seront automatiquement passes en NAF = NON.`
                : `${pendingToggle?.clients_count || 0} client${(pendingToggle?.clients_count || 0) > 1 ? 's' : ''} avec ce code NAF seront automatiquement passes en NAF = OUI.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggle}
              disabled={actionLoading}
              className={pendingToggle?.valide ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
