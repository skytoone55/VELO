'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface SyncStatus {
  configured: boolean
  sourceOfTruth: string
  syncDirection: string
  stats: {
    totalClients: number
  }
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<SyncStatus | null>(null)

  useEffect(() => {
    fetch('/api/sync/monday')
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monday</h1>
        <p className="text-muted-foreground">
          Integration Monday.com — push Supabase vers Monday
        </p>
      </div>

      <div className="grid gap-6">
        {/* Statut connexion */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Connexion Monday</CardTitle>
              {loading ? null : (
                <Badge variant={status?.configured ? 'default' : 'outline'}>
                  {status?.configured ? 'Connecte' : 'Non configure'}
                </Badge>
              )}
            </div>
            <CardDescription>
              Supabase est la source de verite. Les changements sont pushes vers Monday automatiquement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{status?.stats?.totalClients ?? 0}</div>
                <div className="text-muted-foreground">Clients en base</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm font-medium">Direction du sync</div>
                <div className="text-muted-foreground mt-1">Supabase → Monday uniquement</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lien vers les mappings */}
        <Link href="/admin/settings/monday">
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mappings Supabase → Monday</CardTitle>
                  <CardDescription>
                    Configurer quels champs Supabase sont pushes vers quelles colonnes Monday
                  </CardDescription>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}
