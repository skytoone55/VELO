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
  RefreshCcw,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Clock,
  Database,
  ExternalLink,
  Loader2,
  Info,
  Webhook,
  Copy,
  Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'

interface SyncStatus {
  configured: boolean
  sourceOfTruth: string
  webhookEndpoint: string
  lastSync: string | null
  lastSyncResult: any | null
  recentWebhooks: any[]
  stats: {
    totalClients: number
    syncedFromMonday: number
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
  monday_item_id: number | null
}

export default function AdminSyncPage() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      const statusRes = await fetch('/api/sync/monday')
      const statusData = await statusRes.json()
      setStatus(statusData)

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

  const handleSync = async (fullSync: boolean = false) => {
    setSyncing(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch('/api/sync/monday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Erreur de synchronisation')
      }

      if (result.success) {
        setSuccessMessage(
          `Synchronisation terminée: ${result.itemsProcessed} éléments traités, ${result.itemsCreated} créés, ${result.itemsUpdated} mis à jour`
        )
        toast.success('Synchronisation réussie')
      } else {
        setError(`Synchronisation partielle: ${result.errors.length} erreurs`)
      }

      await loadData()
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const copyWebhookUrl = () => {
    const baseUrl = window.location.origin
    const webhookUrl = `${baseUrl}/api/webhooks/monday`
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    toast.success('URL copiée!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/monday`
    : '/api/webhooks/monday'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Synchronisation Monday</h1>
        <p className="text-muted-foreground">
          Monday.com est la source de vérité - Les données sont synchronisées vers Supabase
        </p>
      </div>

      {!status?.configured && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Monday.com n'est pas configuré. Ajoutez MONDAY_API_KEY et MONDAY_BOARD_ID dans les variables d'environnement.
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

      {/* Architecture */}
      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <CardTitle>Architecture de synchronisation</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-8 py-4">
            <div className="text-center">
              <ExternalLink className="h-12 w-12 mx-auto mb-2 text-primary" />
              <span className="font-bold text-lg">Monday.com</span>
              <Badge className="ml-2 bg-green-100 text-green-800">SOURCE</Badge>
              <p className="text-sm text-muted-foreground mt-1">Création et modification des clients</p>
            </div>
            <div className="flex flex-col items-center">
              <ArrowLeft className="h-8 w-8 text-primary" />
              <span className="text-xs text-muted-foreground mt-1">Webhook + Sync</span>
            </div>
            <div className="text-center">
              <Database className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
              <span className="font-bold text-lg">Supabase</span>
              <Badge variant="outline" className="ml-2">CACHE</Badge>
              <p className="text-sm text-muted-foreground mt-1">Miroir pour l'application</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-2">
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
              Source de vérité - Gestion des clients
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
                    <span className="text-muted-foreground">Dernier résultat</span>
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
                Configuration requise
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Supabase</CardTitle>
              </div>
              <Badge variant="outline">Cache</Badge>
            </div>
            <CardDescription>
              Miroir des données Monday
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total clients</span>
                <span className="font-medium">{status?.stats.totalClients || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sync depuis Monday</span>
                <span className="font-medium text-green-600">{status?.stats.syncedFromMonday || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">En attente</span>
                <span className="font-medium text-orange-600">{status?.stats.pendingSync || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhook configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <CardTitle>Configuration Webhook</CardTitle>
          </div>
          <CardDescription>
            Configurez ce webhook dans Monday.com pour une synchronisation en temps réel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">
              {webhookUrl}
            </code>
            <Button variant="outline" size="sm" onClick={copyWebhookUrl}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong>Instructions pour Monday.com :</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Allez dans les paramètres de votre board Monday</li>
              <li>Cliquez sur "Integrations" puis "Webhooks"</li>
              <li>Créez un nouveau webhook avec l'URL ci-dessus</li>
              <li>Sélectionnez les événements: create_item, change_column_value, change_name</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Sync actions */}
      <Card>
        <CardHeader>
          <CardTitle>Synchronisation manuelle</CardTitle>
          <CardDescription>
            Lance une synchronisation complète depuis Monday vers Supabase
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => handleSync(false)}
              disabled={syncing || !status?.configured}
            >
              <RefreshCcw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync incrémentale
            </Button>

            <Button
              variant="outline"
              onClick={() => handleSync(true)}
              disabled={syncing || !status?.configured}
            >
              <RefreshCcw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync complète (tout réécrire)
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            <Info className="h-4 w-4 inline mr-1" />
            La sync incrémentale ne met à jour que les éléments modifiés. La sync complète réécrit tous les clients depuis Monday.
          </p>
        </CardContent>
      </Card>

      {/* Sync history */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des synchronisations</CardTitle>
          <CardDescription>
            Dernières opérations (webhooks et syncs manuelles)
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
                  <TableHead>Monday ID</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: fr })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={log.action.includes('webhook') ? 'bg-blue-50' : ''}>
                        {log.action.replace('webhook_', '')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.monday_item_id || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={log.statut === 'success' ? 'default' : log.statut === 'pending' ? 'outline' : 'destructive'}
                        className={log.statut === 'success' ? 'bg-green-100 text-green-800' : ''}
                      >
                        {log.statut === 'success' ? 'OK' : log.statut === 'pending' ? 'En cours' : 'Erreur'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {log.donnees_apres?.itemsProcessed !== undefined ? (
                        <span>
                          {log.donnees_apres.itemsProcessed} traités, {log.donnees_apres.itemsCreated} créés
                        </span>
                      ) : log.donnees_apres?.clientId ? (
                        <span>Client: {log.donnees_apres.clientId.slice(0, 8)}...</span>
                      ) : (
                        '-'
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
