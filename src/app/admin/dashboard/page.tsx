'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { UserRole } from '@/lib/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Users,
  Building2,
  Truck,
  FileText,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle,
} from 'lucide-react'

interface DashboardStats {
  totalClients: number
  clientsEnAttente: number
  totalLivraisons: number
  livraisonsEnCours: number
  totalDepots: number
  totalUsers: number
}

const roleLabels: Record<UserRole, string> = {
  admin_general: 'Admin Général',
  admin_regional: 'Admin Régional',
  agent_regional: 'Agent Régional',
  agent_depot: 'Agent Dépôt',
  livreur: 'Livreur',
  client: 'Client',
}

export default function AdminDashboardPage() {
  const user = useAdminUser()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = createClient()

      // Récupérer les stats en parallèle
      const [clientsRes, livraisonsRes, depotsRes, usersRes] = await Promise.all([
        supabase.from('clients').select('id, statut_formulaire', { count: 'exact' }),
        supabase.from('livraisons').select('id, statut', { count: 'exact' }),
        supabase.from('depots').select('id', { count: 'exact' }),
        supabase.from('users_profile').select('id', { count: 'exact' }),
      ])

      const clientsEnAttente = clientsRes.data?.filter(
        c => c.statut_formulaire === 'en_attente' || c.statut_formulaire === 'formulaire_envoye'
      ).length || 0

      const livraisonsEnCours = livraisonsRes.data?.filter(
        l => l.statut === 'en_attente' || l.statut === 'programmee'
      ).length || 0

      setStats({
        totalClients: clientsRes.count || 0,
        clientsEnAttente,
        totalLivraisons: livraisonsRes.count || 0,
        livraisonsEnCours,
        totalDepots: depotsRes.count || 0,
        totalUsers: usersRes.count || 0,
      })

      setLoading(false)
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground">
          Bienvenue, {user.prenom} {user.nom}
          <Badge variant="outline" className="ml-2">
            {roleLabels[user.role]}
          </Badge>
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.clientsEnAttente || 0} en attente de traitement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Livraisons</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalLivraisons || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.livraisonsEnCours || 0} en cours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dépôts</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDepots || 0}</div>
            <p className="text-xs text-muted-foreground">
              Points de livraison actifs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilisateurs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              Comptes actifs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick overview */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clients en attente</CardTitle>
            <CardDescription>
              Clients nécessitant une action
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(stats?.clientsEnAttente || 0) > 0 ? (
              <div className="flex items-center gap-3 text-yellow-600">
                <AlertTriangle className="h-5 w-5" />
                <span>{stats?.clientsEnAttente} dossier(s) à traiter</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span>Tous les dossiers sont traités</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Livraisons du jour</CardTitle>
            <CardDescription>
              Livraisons programmées aujourd'hui
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span>Aucune livraison programmée</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Territory info for regional users */}
      {user.territoire && (
        <Card>
          <CardHeader>
            <CardTitle>Votre territoire</CardTitle>
            <CardDescription>
              Vous gérez le département {user.territoire}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className="text-base">
              {user.territoire === '971' && 'Guadeloupe'}
              {user.territoire === '972' && 'Martinique'}
              {user.territoire === '973' && 'Guyane'}
              {user.territoire === '974' && 'La Réunion'}
            </Badge>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
