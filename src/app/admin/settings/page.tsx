'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Link2,
  ArrowRight,
  RefreshCcw,
  Loader2,
  Webhook,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface SyncStatus {
  configured: boolean
  lastSync: string | null
  lastSyncResult: { success: boolean } | null
  stats: {
    totalClients: number
    syncedFromMonday: number
    pendingSync: number
  }
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadSyncStatus()
  }, [])

  const loadSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync/monday')
      const data = await res.json()
      setStatus(data)
    } catch {
      // Silently fail - sync status is optional
    } finally {
      setLoading(false)
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

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/monday`
    : '/api/webhooks/monday'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">
          Configuration de la plateforme
        </p>
      </div>

      <div className="grid gap-6">
        {/* Monday.com Mapping */}
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                <CardTitle>Mapping Monday.com</CardTitle>
              </div>
              <Link href="/admin/settings/monday">
                <Button size="sm">
                  Configurer
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
            <CardDescription>
              Connectez les champs de l'interface avec les colonnes Monday.
              Monday est la source de vérité pour toutes les données clients.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Board</span>
                <span className="font-medium">Vélos Cargos - Général</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Board ID</span>
                <span className="font-mono">9990833105</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statut Synchronisation Monday */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-5 w-5 text-primary" />
                <CardTitle>Synchronisation Monday</CardTitle>
              </div>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Badge variant={status?.configured ? 'default' : 'outline'}>
                  {status?.configured ? 'Connecté' : 'Non configuré'}
                </Badge>
              )}
            </div>
            <CardDescription>
              Synchronisation automatique via webhook
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats */}
            {status?.configured && (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{status.stats.totalClients}</div>
                  <div className="text-muted-foreground">Total</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{status.stats.syncedFromMonday}</div>
                  <div className="text-muted-foreground">Synchronisés</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{status.stats.pendingSync}</div>
                  <div className="text-muted-foreground">En attente</div>
                </div>
              </div>
            )}

            {/* Last sync info */}
            {status?.lastSync && (
              <div className="flex items-center justify-between text-sm p-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground">Dernière synchronisation</span>
                <span className="font-medium">
                  {formatDistanceToNow(new Date(status.lastSync), { addSuffix: true, locale: fr })}
                  {status.lastSyncResult && (
                    <Badge
                      variant={status.lastSyncResult.success ? 'default' : 'destructive'}
                      className={`ml-2 ${status.lastSyncResult.success ? 'bg-green-100 text-green-800' : ''}`}
                    >
                      {status.lastSyncResult.success ? 'OK' : 'Erreur'}
                    </Badge>
                  )}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Webhook configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              <CardTitle>Webhook Monday</CardTitle>
            </div>
            <CardDescription>
              URL à configurer dans Monday.com pour la synchronisation temps réel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
                {webhookUrl}
              </code>
              <Button variant="outline" size="sm" onClick={copyWebhookUrl}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium">Instructions Monday.com</summary>
              <ol className="list-decimal list-inside space-y-1 mt-2 ml-2">
                <li>Allez dans les paramètres de votre board Monday</li>
                <li>Cliquez sur "Integrations" puis "Webhooks"</li>
                <li>Créez un nouveau webhook avec l'URL ci-dessus</li>
                <li>Sélectionnez: create_item, change_column_value, change_name</li>
              </ol>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
