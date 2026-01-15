'use client'

import { useClientUser } from '@/components/client/client-user-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Truck, Clock, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function ClientDashboardPage() {
  const user = useClientUser()

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-6">
        <h1 className="text-2xl font-bold">
          Bienvenue{user?.prenom ? `, ${user.prenom}` : ''} !
        </h1>
        <p className="text-muted-foreground mt-1">
          Gérez vos livraisons de vélos cargo électriques
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Livraisons en préparation
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Programmées</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Livraisons à venir
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Livrées</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Livraisons effectuées
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions rapides</CardTitle>
          <CardDescription>
            Que souhaitez-vous faire ?
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild>
            <Link href="/formulaire">
              <FileText className="h-4 w-4 mr-2" />
              Remplir un nouveau formulaire
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/client/livraisons">
              <Truck className="h-4 w-4 mr-2" />
              Voir mes livraisons
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Recent activity placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Activité récente</CardTitle>
          <CardDescription>
            Vos dernières actions sur la plateforme
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Aucune activité récente</p>
            <p className="text-sm">Commencez par remplir votre premier formulaire</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
