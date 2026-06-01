'use client'

import { useEffect, useState, use } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, MapPin, Phone, Navigation, Clock, User, Home } from 'lucide-react'
import type { RouteStop, RouteDepot } from './tournee-route-map'

const TourneeRouteMap = dynamic(() => import('./tournee-route-map'), { ssr: false })

interface Stop extends RouteStop {
  livraison_id: string
  tournee_position: number | null
  client_id: string | null
  raison_sociale: string | null
  telephone: string | null
  adresse: string
  creneau_heure_debut: string | null
  creneau_heure_fin: string | null
  distance_to_next_km: number | null
  time_to_next_min: number | null
}

interface TourneeInfo {
  id: string
  date: string
  creneau_debut: string | null
  creneau_fin: string | null
  notes: string | null
  livreur: { id: string; nom: string | null; prenom: string | null; email: string | null } | null
  depot: (RouteDepot & { id: string; adresse: string | null }) | null
}

function formatDateFr(d: string): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return d
  }
}

export default function TourneeMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tournee, setTournee] = useState<TourneeInfo | null>(null)
  const [stops, setStops] = useState<Stop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/tournees/${id}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Erreur de chargement')
        }
        const data = await res.json()
        if (cancelled) return
        setTournee(data.tournee)
        setStops(data.stops || [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Chargement de la tournée...
      </div>
    )
  }

  if (error || !tournee) {
    return (
      <div className="space-y-4">
        <Link href="/admin/planning">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour au planning
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-red-600">
            {error || 'Tournée introuvable'}
          </CardContent>
        </Card>
      </div>
    )
  }

  const livreurNom = tournee.livreur
    ? [tournee.livreur.prenom, tournee.livreur.nom].filter(Boolean).join(' ') || tournee.livreur.email
    : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/planning">
            <Button variant="ghost" size="sm" className="-ml-2 mb-1 text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour au planning
            </Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Navigation className="h-6 w-6 text-blue-600" />
            Tournée du {formatDateFr(tournee.date)}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500">
            <Badge variant="outline">{stops.length} arrêt{stops.length > 1 ? 's' : ''}</Badge>
            {livreurNom && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {livreurNom}
              </span>
            )}
            {tournee.depot && (
              <span className="flex items-center gap-1">
                <Home className="h-3.5 w-3.5" /> Départ : {tournee.depot.nom}
              </span>
            )}
            {(tournee.creneau_debut || tournee.creneau_fin) && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {(tournee.creneau_debut || '').slice(0, 5)}
                {tournee.creneau_fin ? ` – ${tournee.creneau_fin.slice(0, 5)}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Layout 2 colonnes : carte à gauche, liste à droite. Empilé sur mobile. */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Carte */}
        <div className="lg:flex-1 lg:min-w-0">
          <Card className="overflow-hidden">
            <div className="h-[400px] lg:h-[calc(100vh-220px)] lg:min-h-[500px]">
              <TourneeRouteMap stops={stops} depot={tournee.depot} />
            </div>
          </Card>
        </div>

        {/* Liste ordonnée */}
        <div className="lg:w-[400px] lg:shrink-0 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto space-y-2">
          {stops.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-gray-400 text-sm">
                Aucun arrêt dans cette tournée.
              </CardContent>
            </Card>
          )}
          {stops.map((s) => (
            <Card key={s.livraison_id}>
              <CardContent className="p-3">
                <div className="flex gap-3">
                  <div className="shrink-0 h-7 w-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                    {s.position}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{s.nom}</p>
                    {s.raison_sociale && s.raison_sociale !== s.nom && (
                      <p className="text-xs text-gray-400 truncate">{s.raison_sociale}</p>
                    )}
                    {s.telephone && (
                      <a
                        href={`tel:${s.telephone}`}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                      >
                        <Phone className="h-3 w-3" /> {s.telephone}
                      </a>
                    )}
                    {s.adresse && (
                      <p className="flex items-start gap-1 text-xs text-gray-500 mt-0.5">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> {s.adresse}
                      </p>
                    )}
                    {(s.latitude == null || s.longitude == null) && (
                      <p className="text-[11px] text-orange-500 mt-0.5">Sans coordonnées GPS (absent de la carte)</p>
                    )}
                  </div>
                </div>
                {(s.distance_to_next_km != null && s.time_to_next_min != null) && (
                  <div className="mt-2 pt-2 border-t flex items-center gap-1 text-xs text-gray-500">
                    <Navigation className="h-3 w-3 text-blue-500" />
                    <span>
                      → {s.distance_to_next_km.toLocaleString('fr-FR')} km / {s.time_to_next_min} min vers l&apos;arrêt suivant
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
