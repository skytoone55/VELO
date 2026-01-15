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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Bell,
  AlertCircle,
  CheckCircle,
  Loader2,
  MapPinOff,
  UserX,
  Clock,
  Send,
  X,
  Eye,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import Link from 'next/link'

interface EmailAlert {
  id: string
  created_at: string
  type: string
  message: string
  details: any
  statut: string
  sent_at: string | null
  client_id: string | null
  client: {
    id: string
    raison_sociale: string
    email: string
    telephone: string
    departement: string
  } | null
}

interface AlertStats {
  total: number
  pending: number
  sent: number
  byType: Record<string, number>
}

const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  client_hors_zone: {
    label: 'Client hors zone',
    icon: <MapPinOff className="h-4 w-4" />,
    color: 'bg-orange-100 text-orange-800',
  },
  enemat_bloque: {
    label: 'ENEMAT bloqué',
    icon: <UserX className="h-4 w-4" />,
    color: 'bg-red-100 text-red-800',
  },
  formulaire_expire: {
    label: 'Formulaire expiré',
    icon: <Clock className="h-4 w-4" />,
    color: 'bg-yellow-100 text-yellow-800',
  },
  livraison_echec: {
    label: 'Échec livraison',
    icon: <AlertCircle className="h-4 w-4" />,
    color: 'bg-red-100 text-red-800',
  },
}

export default function AdminAlertesPage() {
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<EmailAlert[]>([])
  const [stats, setStats] = useState<AlertStats | null>(null)
  const [activeTab, setActiveTab] = useState('pending')
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAlerts(activeTab)
  }, [activeTab])

  const loadAlerts = async (statut: string) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/alerts?statut=${statut}`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setAlerts(data.alerts)
      setStats(data.stats)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (alertId: string) => {
    setProcessing(alertId)
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', alertId }),
      })

      if (!res.ok) throw new Error('Erreur envoi')

      // Reload alerts
      await loadAlerts(activeTab)
    } catch (err) {
      setError('Erreur lors de l\'envoi')
    } finally {
      setProcessing(null)
    }
  }

  const handleDismiss = async (alertId: string) => {
    setProcessing(alertId)
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', alertId }),
      })

      if (!res.ok) throw new Error('Erreur dismiss')

      // Reload alerts
      await loadAlerts(activeTab)
    } catch (err) {
      setError('Erreur lors de l\'archivage')
    } finally {
      setProcessing(null)
    }
  }

  const getAlertConfig = (type: string) => {
    return ALERT_TYPE_CONFIG[type] || {
      label: type,
      icon: <Bell className="h-4 w-4" />,
      color: 'bg-gray-100 text-gray-800',
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alertes</h1>
        <p className="text-muted-foreground">
          Gérez les alertes et notifications système
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">En attente</p>
                <p className="text-2xl font-bold">{stats?.pending || 0}</p>
              </div>
              <Bell className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hors zone</p>
                <p className="text-2xl font-bold">{stats?.byType?.client_hors_zone || 0}</p>
              </div>
              <MapPinOff className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">ENEMAT bloqués</p>
                <p className="text-2xl font-bold">{stats?.byType?.enemat_bloque || 0}</p>
              </div>
              <UserX className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Envoyées</p>
                <p className="text-2xl font-bold">{stats?.sent || 0}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des alertes</CardTitle>
          <CardDescription>
            Alertes nécessitant une action
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="pending">
                En attente
                {stats?.pending ? (
                  <Badge variant="secondary" className="ml-2">
                    {stats.pending}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="sent">Envoyées</TabsTrigger>
              <TabsTrigger value="dismissed">Archivées</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucune alerte dans cette catégorie</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((alert) => {
                      const config = getAlertConfig(alert.type)
                      return (
                        <TableRow key={alert.id}>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(alert.created_at), {
                              addSuffix: true,
                              locale: fr,
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge className={config.color}>
                              <span className="flex items-center gap-1">
                                {config.icon}
                                {config.label}
                              </span>
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {alert.client ? (
                              <div>
                                <Link
                                  href={`/admin/clients/${alert.client.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {alert.client.raison_sociale}
                                </Link>
                                <div className="text-sm text-muted-foreground">
                                  {alert.client.departement}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {alert.message}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {alert.client && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                >
                                  <Link href={`/admin/clients/${alert.client.id}`}>
                                    <Eye className="h-4 w-4" />
                                  </Link>
                                </Button>
                              )}
                              {activeTab === 'pending' && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSend(alert.id)}
                                    disabled={processing === alert.id}
                                  >
                                    {processing === alert.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Send className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDismiss(alert.id)}
                                    disabled={processing === alert.id}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
