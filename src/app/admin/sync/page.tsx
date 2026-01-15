'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  RefreshCcw,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Clock,
  Database,
  ExternalLink,
  Loader2,
  Info,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface SyncStatus {
  configured: boolean
  lastSync: string | null
  lastSyncResult: any | null
  stats: {
    totalClients: number
    syncedClients: number
    pendingSync: number
  }
}

interface SyncLog {
  id: string
  created_at: string
  action: string
  direction: string
  statut: string
  donnees_apres: any
}

export default function AdminSyncPage() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncDirection, setSyncDirection] = useState<'supabase_to_monday' | 'monday_to_supabase'>('supabase_to_monday')
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Charger le statut et les logs
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Charger le statut depuis l'API
      const statusRes = await fetch('/api/sync/monday')
      const statusData = await statusRes.json()
      setStatus(statusData)

      // Charger les logs depuis Supabase
      const supabase = createClient()
      const { data: logs } = await supabase
        .from('sync_monday_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      setSyncLogs(logs || [])
    } catch (err: any) {
      setError('Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch('/api/sync/monday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: syncDirection }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Erreur de synchronisation')
      }

      if (result.success) {
        setSuccessMessage(
          `Synchronisation terminée: ${result.itemsProcessed} éléments traités, ${result.itemsCreated} créés, ${result.itemsUpdated} mis à jour`
        )
      } else {
        setError(`Synchronisation partielle: ${result.errors.length} erreurs`)
      }

      // Recharger les données
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Synchronisation Monday</h1>
        <p className="text-muted-foreground">
          Gérez la synchronisation bidirectionnelle avec Monday.com
        </p>
      </div>

      {!status?.configured && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Monday.com n'est pas configuré. Ajoutez la variable d'environnement MONDAY_API_KEY pour activer la synchronisation.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* Sync status */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle>Supabase</CardTitle>
              </div>
              <Badge className="bg-green-100 text-green-800">SSOT</Badge>
            </div>
            <CardDescription>
              Source de vérité - Base de données principale
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total clients</span>
                <span className="font-medium">{status?.stats.totalClients || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Synchronisés</span>
                <span className="font-medium text-green-600">{status?.stats.syncedClients || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">En attente sync</span>
                <span className="font-medium text-orange-600">{status?.stats.pendingSync || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5 text-primary" />
                <CardTitle>Monday.com</CardTitle>
              </div>
              <Badge variant={status?.configured ? 'default' : 'outline'}>
                {status?.configured ? 'Connecté' : 'Non connecté'}
              </Badge>
            </div>
            <CardDescription>
              Tableau de bord externe - Vue commerciale
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status?.configured ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Dernière sync</span>
                  <span className="font-medium">
                    {status.lastSync
                      ? formatDistanceToNow(new Date(status.lastSync), { addSuffix: true, locale: fr })
                      : 'Jamais'}
                  </span>
                </div>
                {status.lastSyncResult && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Résultat</span>
                    <Badge
                      variant={status.lastSyncResult.success ? 'default' : 'destructive'}
                      className={status.lastSyncResult.success ? 'bg-green-100 text-green-800' : ''}
                    >
                      {status.lastSyncResult.success ? 'Succès' : 'Erreurs'}
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                Connexion non configurée
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sync direction */}
      <Card>
        <CardHeader>
          <CardTitle>Direction de synchronisation</CardTitle>
          <CardDescription>
            La sync est bidirectionnelle mais Supabase prime en cas de conflit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-8 py-4">
            <div className="text-center">
              <Database className="h-10 w-10 mx-auto mb-2 text-primary" />
              <span className="text-sm font-medium">Supabase</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <ArrowRight className={`h-5 w-5 ${syncDirection === 'supabase_to_monday' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground">Push</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowLeft className={`h-5 w-5 ${syncDirection === 'monday_to_supabase' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground">Pull</span>
              </div>
            </div>
            <div className="text-center">
              <ExternalLink className={`h-10 w-10 mx-auto mb-2 ${status?.configured ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">Monday</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Select
              value={syncDirection}
              onValueChange={(v) => setSyncDirection(v as any)}
              disabled={!status?.configured}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supabase_to_monday">
                  Supabase → Monday (Push)
                </SelectItem>
                <SelectItem value="monday_to_supabase">
                  Monday → Supabase (Pull)
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleSync}
              disabled={syncing || !status?.configured}
            >
              <RefreshCcw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchronisation...' : 'Synchroniser maintenant'}
            </Button>
          </div>

          {!status?.configured && (
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-1" />
              Configurez MONDAY_API_KEY dans les variables d'environnement pour activer la synchronisation.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sync history */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des synchronisations</CardTitle>
          <CardDescription>
            Dernières opérations de synchronisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune synchronisation effectuée</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: fr })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      {log.direction === 'supabase_to_monday' ? (
                        <span className="flex items-center gap-1 text-sm">
                          <ArrowRight className="h-3 w-3" /> Push
                        </span>
                      ) : log.direction === 'monday_to_supabase' ? (
                        <span className="flex items-center gap-1 text-sm">
                          <ArrowLeft className="h-3 w-3" /> Pull
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={log.statut === 'success' ? 'default' : 'destructive'}
                        className={log.statut === 'success' ? 'bg-green-100 text-green-800' : ''}
                      >
                        {log.statut === 'success' ? 'Succès' : 'Erreur'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.donnees_apres?.itemsProcessed !== undefined && (
                        <span>
                          {log.donnees_apres.itemsProcessed} traités,{' '}
                          {log.donnees_apres.itemsCreated} créés,{' '}
                          {log.donnees_apres.itemsUpdated} mis à jour
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
