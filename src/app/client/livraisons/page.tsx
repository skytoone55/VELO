'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useClientUser } from '@/components/client/client-user-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Package, Truck, MapPin, Calendar } from 'lucide-react'
import { Livraison, Client } from '@/lib/types/database'

interface LivraisonWithClient extends Livraison {
  client: Client | null
}

const statutColors: Record<string, string> = {
  en_attente: 'bg-yellow-100 text-yellow-800',
  programmee: 'bg-blue-100 text-blue-800',
  annulee: 'bg-red-100 text-red-800',
  livree: 'bg-green-100 text-green-800',
}

const statutLabels: Record<string, string> = {
  en_attente: 'En attente',
  programmee: 'Programmée',
  annulee: 'Annulée',
  livree: 'Livrée',
}

export default function ClientLivraisonsPage() {
  const user = useClientUser()
  const [livraisons, setLivraisons] = useState<LivraisonWithClient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLivraisons = async () => {

      const supabase = createClient()

      // D'abord récupérer les sociétés liées à l'utilisateur
      const { data: societes } = await supabase
        .from('user_societes')
        .select('client_id')
        .eq('user_id', user.id)

      if (!societes || societes.length === 0) {
        setLoading(false)
        return
      }

      const clientIds = societes.map(s => s.client_id).filter(Boolean)

      // Récupérer les livraisons pour ces clients
      const { data, error } = await supabase
        .from('livraisons')
        .select(`
          *,
          client:clients(*)
        `)
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Erreur:', error)
        setLoading(false)
        return
      }

      setLivraisons(data as LivraisonWithClient[])
      setLoading(false)
    }

    fetchLivraisons()
  }, [user])

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
        <h1 className="text-2xl font-bold">Mes livraisons</h1>
        <p className="text-muted-foreground">
          Suivez l'état de vos livraisons de vélos cargo
        </p>
      </div>

      {livraisons.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-1">Aucune livraison</h3>
            <p className="text-muted-foreground text-sm">
              Vos livraisons apparaîtront ici une fois que votre commande sera validée.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {livraisons.map((livraison) => (
            <Card key={livraison.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {livraison.client?.raison_sociale || 'Livraison'}
                    </CardTitle>
                    <CardDescription>
                      {livraison.mode_livraison === 'domicile' ? (
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          Livraison à domicile
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          Retrait en point relais
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <Badge className={statutColors[livraison.statut || 'en_attente']}>
                    {statutLabels[livraison.statut || 'en_attente']}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  {livraison.adresse_livraison_ligne1 && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p>{livraison.adresse_livraison_ligne1}</p>
                        {livraison.adresse_livraison_ligne2 && (
                          <p>{livraison.adresse_livraison_ligne2}</p>
                        )}
                        <p>
                          {livraison.adresse_livraison_cp} {livraison.adresse_livraison_ville}
                        </p>
                      </div>
                    </div>
                  )}
                  {livraison.date_programmation && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        Programmée le {new Date(livraison.date_programmation).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
