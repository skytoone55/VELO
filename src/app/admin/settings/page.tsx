'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Database, Mail, Shield, Link2, ArrowRight } from 'lucide-react'

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
        {/* Monday.com Mapping - Mise en avant */}
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

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle>Base de données</CardTitle>
            </div>
            <CardDescription>
              Cache local pour les performances (Monday reste la source de vérité)
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
