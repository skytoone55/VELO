'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Settings, Database, Mail, RefreshCcw, Shield } from 'lucide-react'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">
          Configuration générale de la plateforme
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle>Base de données</CardTitle>
            </div>
            <CardDescription>
              Informations sur la connexion Supabase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Statut</span>
                <Badge className="bg-green-100 text-green-800">Connecté</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Projet</span>
                <span className="font-mono">irpnllwlxivlylclfjwd</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-primary" />
              <CardTitle>Synchronisation Monday</CardTitle>
            </div>
            <CardDescription>
              État de la synchronisation avec Monday.com
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Statut</span>
                <Badge variant="outline">Non configuré</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Dernière sync</span>
                <span>-</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle>Notifications email</CardTitle>
            </div>
            <CardDescription>
              Configuration des alertes par email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span>Non configuré</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Sécurité</CardTitle>
            </div>
            <CardDescription>
              Paramètres de sécurité et RLS
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">RLS activé</span>
                <Badge className="bg-green-100 text-green-800">Oui</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Policies</span>
                <span>12 tables protégées</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
