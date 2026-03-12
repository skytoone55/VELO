'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Loader2, RefreshCw, CheckCircle, XCircle, Clock, Copy, FileText, Camera, ExternalLink, ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'

interface WebhookLog {
  id: string
  source: string
  reference_retina: string | null
  monday_item_id: string | null
  client_id: string | null
  livraison_id: string | null
  status: 'pending' | 'success' | 'error' | 'duplicate'
  fnuci_codes: string[] | null
  bike_count: number | null
  has_pdf: boolean
  has_id_photo: boolean
  completed_at: string | null
  error_message: string | null
  created_at: string
  client: { raison_sociale: string; reference_retina: string } | null
}

interface Stats {
  total: number
  success: number
  error: number
  pending: number
  duplicate: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  success: { label: 'Succes', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
  error: { label: 'Erreur', color: 'bg-red-100 text-red-800', icon: XCircle },
  pending: { label: 'En cours', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  duplicate: { label: 'Doublon', color: 'bg-blue-100 text-blue-800', icon: Copy },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function WebhooksPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, success: 0, error: 0, pending: 0, duplicate: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/webhooks?${params}`)
      const data = await res.json()
      setLogs(data.logs || [])
      setStats(data.stats || { total: 0, success: 0, error: 0, pending: 0, duplicate: 0 })
    } catch {
      console.error('Erreur chargement logs webhook')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/settings">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Webhooks Ecovolt-Retrait</h1>
            <p className="text-sm text-muted-foreground">Logs des callbacks entrants depuis le module de livraison externe</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'bg-gray-100' },
          { label: 'Succes', value: stats.success, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Erreurs', value: stats.error, color: 'bg-red-50 text-red-700' },
          { label: 'En cours', value: stats.pending, color: 'bg-yellow-50 text-yellow-700' },
          { label: 'Doublons', value: stats.duplicate, color: 'bg-blue-50 text-blue-700' },
        ].map(s => (
          <Card key={s.label} className={s.color}>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtre */}
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="success">Succes</SelectItem>
            <SelectItem value="error">Erreurs</SelectItem>
            <SelectItem value="pending">En cours</SelectItem>
            <SelectItem value="duplicate">Doublons</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{logs.length} resultat(s)</span>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Journal des webhooks</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucun webhook recu</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Ref Retina</TableHead>
                  <TableHead className="text-center">Velos</TableHead>
                  <TableHead>FNUCI</TableHead>
                  <TableHead className="text-center">PDF</TableHead>
                  <TableHead className="text-center">CI</TableHead>
                  <TableHead>Erreur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => {
                  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.pending
                  const StatusIcon = cfg.icon
                  const isExpanded = expandedRow === log.id

                  return (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                    >
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${cfg.color} gap-1`}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {log.client?.raison_sociale || '—'}
                        {log.client_id && (
                          <Link
                            href={`/admin/clients/${log.client_id}`}
                            className="ml-1 inline-block"
                            onClick={e => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3 inline text-blue-500" />
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.reference_retina || log.monday_item_id || '—'}
                      </TableCell>
                      <TableCell className="text-center font-bold">
                        {log.bike_count ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px]">
                        {log.fnuci_codes && log.fnuci_codes.length > 0
                          ? (isExpanded
                              ? log.fnuci_codes.join(', ')
                              : `${log.fnuci_codes.length} code(s)`)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.has_pdf
                          ? <FileText className="h-4 w-4 text-emerald-600 mx-auto" />
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.has_id_photo
                          ? <Camera className="h-4 w-4 text-emerald-600 mx-auto" />
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-red-600 max-w-[200px] truncate">
                        {log.error_message || ''}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
