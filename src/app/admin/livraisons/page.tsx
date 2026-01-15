'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Loader2, Search, Filter, Truck, MapPin, Calendar } from 'lucide-react'
import { Livraison, Client, Depot } from '@/lib/types/database'

interface LivraisonWithRelations extends Livraison {
  client: Client | null
  depot: Depot | null
}

const statutOptions = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'programmee', label: 'Programmée' },
  { value: 'livree', label: 'Livrée' },
  { value: 'annulee', label: 'Annulée' },
]

const statutColors: Record<string, string> = {
  en_attente: 'bg-yellow-100 text-yellow-800',
  programmee: 'bg-blue-100 text-blue-800',
  livree: 'bg-green-100 text-green-800',
  annulee: 'bg-red-100 text-red-800',
}

export default function AdminLivraisonsPage() {
  const user = useAdminUser()
  const [livraisons, setLivraisons] = useState<LivraisonWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')

  useEffect(() => {
    const fetchLivraisons = async () => {
      const supabase = createClient()

      let query = supabase
        .from('livraisons')
        .select(`
          *,
          client:clients(*),
          depot:depots(*)
        `)
        .order('created_at', { ascending: false })

      // Filtrer par territoire pour les non-admin généraux
      if (user?.role === 'admin_regional' || user?.role === 'agent_regional') {
        // TODO: Filtrer par territoire via les clients
      }

      // Filtrer par dépôt pour agent_depot et livreur
      if (user?.role === 'agent_depot' || user?.role === 'livreur') {
        if (user.depot_id) {
          query = query.eq('depot_id', user.depot_id)
        }
      }

      const { data, error } = await query

      if (error) {
        console.error('Erreur:', error)
        setLoading(false)
        return
      }

      setLivraisons(data as LivraisonWithRelations[])
      setLoading(false)
    }

    fetchLivraisons()
  }, [])

  const filteredLivraisons = livraisons.filter(livraison => {
    const matchesSearch =
      !searchQuery ||
      livraison.client?.raison_sociale?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      livraison.client?.siret?.includes(searchQuery)

    const matchesStatut =
      statutFilter === 'all' || livraison.statut === statutFilter

    return matchesSearch && matchesStatut
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Livraisons</h1>
          <p className="text-muted-foreground">
            Gérez les livraisons de vélos cargo
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou SIRET..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                {statutOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredLivraisons.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucune livraison</h3>
              <p className="text-muted-foreground text-sm">
                {searchQuery || statutFilter !== 'all'
                  ? 'Aucune livraison ne correspond à vos critères'
                  : 'Les livraisons apparaîtront ici'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Adresse</TableHead>
                  <TableHead>Date programmée</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLivraisons.map((livraison) => (
                  <TableRow key={livraison.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {livraison.client?.raison_sociale || 'N/A'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {livraison.client?.siret}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {livraison.mode_livraison === 'domicile' ? (
                          <>
                            <Truck className="h-4 w-4" />
                            <span>Domicile</span>
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4" />
                            <span>Point relais</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {livraison.adresse_livraison_ligne1 || '-'}
                        {livraison.adresse_livraison_cp && (
                          <div className="text-muted-foreground">
                            {livraison.adresse_livraison_cp} {livraison.adresse_livraison_ville}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {livraison.date_programmation ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {new Date(livraison.date_programmation).toLocaleDateString('fr-FR')}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statutColors[livraison.statut || 'en_attente']}>
                        {livraison.statut === 'en_attente' && 'En attente'}
                        {livraison.statut === 'programmee' && 'Programmée'}
                        {livraison.statut === 'livree' && 'Livrée'}
                        {livraison.statut === 'annulee' && 'Annulée'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        Voir
                      </Button>
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
