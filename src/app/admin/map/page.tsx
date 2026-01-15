'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Circle } from '@react-google-maps/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2, Building2, Users, Bike, MapPin, Warehouse, Package, Filter, RefreshCw, Eye, Shuffle } from 'lucide-react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'

interface Depot {
  id: string
  nom: string
  adresse: string
  code_postal: string
  ville: string
  latitude: number
  longitude: number
  rayon_couverture_km: number
  type: 'retrait' | 'logistique'
  agence: string
  actif: boolean
  clients_count?: number
  velos_count?: number
}

interface Client {
  id: string
  raison_sociale: string
  adresse_livraison_ligne1: string | null
  adresse_livraison_cp: string | null
  adresse_livraison_ville: string | null
  latitude: number | null
  longitude: number | null
  agence: string | null
  departement: string
  depot_retrait_id: string | null
  depot_logistique_id: string | null
  velo_devis: number
  velo_valide: number | null
}

const agenceOptions = [
  { value: 'all', label: 'Toutes les agences' },
  { value: 'FR', label: 'France' },
  { value: '971', label: 'Guadeloupe' },
  { value: '972', label: 'Martinique' },
  { value: '973', label: 'Guyane' },
  { value: '974', label: 'La Réunion' },
]

// Mapping des noms d'agence vers les codes (pour correspondre aux filtres)
const agenceNameToCode: Record<string, string> = {
  'france': 'FR',
  'métropole': 'FR',
  'metropole': 'FR',
  'guadeloupe': '971',
  'martinique': '972',
  'guyane': '973',
  'la réunion': '974',
  'la reunion': '974',
  'réunion': '974',
  'reunion': '974',
  // Codes directs
  'fr': 'FR',
  '971': '971',
  '972': '972',
  '973': '973',
  '974': '974',
}

// Normalise une valeur d'agence vers un code standard
function normalizeAgence(agence: string | null | undefined): string {
  if (!agence) return 'FR'
  const normalized = agence.toLowerCase().trim()

  // Vérifier d'abord le mapping direct
  if (agenceNameToCode[normalized]) {
    return agenceNameToCode[normalized]
  }

  // Vérifier si c'est un département métropolitain (2 chiffres, pas 97x)
  if (/^\d{2}$/.test(normalized) && !normalized.startsWith('97')) {
    return 'FR'
  }

  // Vérifier si c'est un code postal (5 chiffres)
  if (/^\d{5}$/.test(normalized)) {
    const dept = normalized.substring(0, 2)
    if (dept === '97') {
      const deptFull = normalized.substring(0, 3)
      if (['971', '972', '973', '974'].includes(deptFull)) {
        return deptFull
      }
    }
    return 'FR'
  }

  // Vérifier si c'est un département DOM (3 chiffres commençant par 97)
  if (/^97[1-4]$/.test(normalized)) {
    return normalized
  }

  return 'FR'
}

// Centres géographiques par agence
const agenceCenters: Record<string, { lat: number; lng: number; zoom: number }> = {
  'all': { lat: 46.603354, lng: 1.888334, zoom: 6 },
  'FR': { lat: 46.603354, lng: 1.888334, zoom: 6 },
  '971': { lat: 16.265, lng: -61.551, zoom: 10 },
  '972': { lat: 14.636, lng: -61.024, zoom: 10 },
  '973': { lat: 3.933, lng: -53.125, zoom: 7 },
  '974': { lat: -21.115, lng: 55.536, zoom: 10 },
}

// Couleurs pour les marqueurs
const COLORS = {
  depotLogistique: '#F5D100',
  depotRetrait: '#4CAF50',
  client: '#3B82F6',
  clientHorsZone: '#EF4444',
}

const MARKER_SIZE = 10

export default function MapPage() {
  const [depots, setDepots] = useState<Depot[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgence, setSelectedAgence] = useState<string>('all')
  const [selectedDepot, setSelectedDepot] = useState<string | null>(null)
  const [selectedMarker, setSelectedMarker] = useState<{ type: 'depot' | 'client'; data: Depot | Client } | null>(null)
  const [showDepots, setShowDepots] = useState(true)
  const [showClients, setShowClients] = useState(true)
  const [showRayons, setShowRayons] = useState(true)
  const [showLogistique, setShowLogistique] = useState(true)
  const [showRetrait, setShowRetrait] = useState(true)
  const [showHorsZone, setShowHorsZone] = useState(true)
  const [reassigning, setReassigning] = useState(false)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/map/data')
      const data = await response.json()

      if (data.success) {
        // Normaliser les agences des dépôts
        const normalizedDepots = (data.depots || []).map((depot: Depot) => ({
          ...depot,
          agence: normalizeAgence(depot.agence),
        }))
        // Normaliser les agences des clients
        const normalizedClients = (data.clients || []).map((client: Client) => ({
          ...client,
          agence: normalizeAgence(client.agence || client.departement),
        }))

        console.log('Données carte chargées:', normalizedClients.length, 'clients,', normalizedDepots.length, 'dépôts')
        console.log('Agences dépôts uniques:', [...new Set(normalizedDepots.map((d: Depot) => d.agence))])

        setDepots(normalizedDepots)
        setClients(normalizedClients)
      } else {
        console.error('Erreur API map/data:', data.error)
      }
    } catch (error) {
      console.error('Erreur chargement données carte:', error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Centrer la carte quand l'agence change
  useEffect(() => {
    if (mapInstance) {
      const center = agenceCenters[selectedAgence] || agenceCenters['all']
      mapInstance.setCenter({ lat: center.lat, lng: center.lng })
      mapInstance.setZoom(center.zoom)
    }
    setSelectedDepot(null)
  }, [selectedAgence, mapInstance])

  // Centrer sur un dépôt quand sélectionné
  useEffect(() => {
    if (mapInstance && selectedDepot) {
      const depot = depots.find(d => d.id === selectedDepot)
      if (depot) {
        mapInstance.setCenter({ lat: depot.latitude, lng: depot.longitude })
        mapInstance.setZoom(12)
      }
    }
  }, [selectedDepot, mapInstance, depots])

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map)
  }, [])

  // Dépôts filtrés par agence (pour le sélecteur)
  const depotsForSelector = useMemo(() => {
    return depots.filter(depot => {
      if (selectedAgence !== 'all' && depot.agence !== selectedAgence) return false
      return true
    })
  }, [depots, selectedAgence])

  // Dépôts filtrés pour l'affichage
  const filteredDepots = useMemo(() => {
    return depots.filter(depot => {
      if (selectedAgence !== 'all' && depot.agence !== selectedAgence) return false
      if (depot.type === 'logistique' && !showLogistique) return false
      if (depot.type === 'retrait' && !showRetrait) return false
      return true
    })
  }, [depots, selectedAgence, showLogistique, showRetrait])

  // Clients filtrés
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      // Filtrer par agence (déjà normalisée dans loadData)
      if (selectedAgence !== 'all' && client.agence !== selectedAgence) {
        return false
      }
      // Filtrer par dépôt sélectionné
      if (selectedDepot) {
        return client.depot_retrait_id === selectedDepot || client.depot_logistique_id === selectedDepot
      }
      const isHorsZone = !client.depot_retrait_id && !client.depot_logistique_id
      if (isHorsZone && !showHorsZone) return false
      if (!isHorsZone && !showLogistique && !showRetrait) return false
      return true
    })
  }, [clients, selectedAgence, selectedDepot, showHorsZone, showLogistique, showRetrait])

  // Clients hors zone filtrés par agence
  const filteredClientsHorsZone = useMemo(() => {
    return clients.filter(c => {
      const isHorsZone = !c.depot_retrait_id && !c.depot_logistique_id
      if (!isHorsZone) return false
      // Agence déjà normalisée dans loadData
      if (selectedAgence !== 'all' && c.agence !== selectedAgence) {
        return false
      }
      return true
    })
  }, [clients, selectedAgence])

  // Stats réactives
  const stats = useMemo(() => {
    const totalClients = filteredClients.length
    const totalVelos = filteredClients.reduce((sum, c) => sum + (c.velo_valide || 0), 0)
    const totalDepotsLogistique = filteredDepots.filter(d => d.type === 'logistique').length
    const totalDepotsRetrait = filteredDepots.filter(d => d.type === 'retrait').length
    const totalHorsZone = filteredClientsHorsZone.length
    return { totalClients, totalVelos, totalDepotsLogistique, totalDepotsRetrait, totalHorsZone }
  }, [filteredClients, filteredDepots, filteredClientsHorsZone])

  const handleSelectDepot = (depotId: string | null) => {
    setSelectedDepot(depotId)
  }

  const resetFilters = () => {
    setSelectedAgence('all')
    setSelectedDepot(null)
    setShowLogistique(true)
    setShowRetrait(true)
    setShowHorsZone(true)
    if (mapInstance) {
      const center = agenceCenters['all']
      mapInstance.setCenter({ lat: center.lat, lng: center.lng })
      mapInstance.setZoom(center.zoom)
    }
  }

  const handleReassignClients = async () => {
    setReassigning(true)
    try {
      const response = await fetch('/api/admin/depots/reassign-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agence: selectedAgence !== 'all' ? selectedAgence : undefined,
        }),
      })
      const data = await response.json()

      if (data.success) {
        if (data.reassigned > 0) {
          toast.success(`${data.reassigned} client(s) réassigné(s) au dépôt le plus proche`)
          loadData()
        } else {
          toast.info('Tous les clients sont déjà assignés au dépôt le plus proche')
        }
      } else {
        toast.error(data.error || 'Erreur lors de la réassignation')
      }
    } catch (error) {
      toast.error('Erreur lors de la réassignation')
    } finally {
      setReassigning(false)
    }
  }

  const mapNotAvailable = loadError || !isLoaded
  const mapErrorMessage = loadError
    ? "Erreur de chargement de la carte. Vérifiez la clé API Google Maps."
    : !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    ? "Clé API Google Maps non configurée (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)"
    : "Chargement de la carte..."

  if (loading) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Chargement des données...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  const defaultCenter = agenceCenters['all']

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Carte des livraisons
          </h1>
          <p className="text-muted-foreground">Vue d'ensemble des dépôts et clients</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleReassignClients} variant="outline" size="sm" disabled={reassigning}>
            {reassigning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Shuffle className="h-4 w-4 mr-2" />
            )}
            Réassigner clients
          </Button>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Warehouse className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalDepotsLogistique}</p>
                <p className="text-xs text-muted-foreground">Dépôts logistique</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-secondary/10 rounded-lg">
                <Package className="h-5 w-5 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalDepotsRetrait}</p>
                <p className="text-xs text-muted-foreground">Points retrait</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalClients}</p>
                <p className="text-xs text-muted-foreground">Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.totalHorsZone > 0 ? 'border-destructive/50' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${stats.totalHorsZone > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                <MapPin className={`h-5 w-5 ${stats.totalHorsZone > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalHorsZone}</p>
                <p className="text-xs text-muted-foreground">Hors zone</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres et Carte */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Filtres */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtres
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Agence</Label>
              <Select value={selectedAgence} onValueChange={setSelectedAgence}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agenceOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Dépôt</Label>
              <Select
                value={selectedDepot || 'all'}
                onValueChange={(v) => handleSelectDepot(v === 'all' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous les dépôts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les dépôts</SelectItem>
                  {depotsForSelector.map(depot => (
                    <SelectItem key={depot.id} value={depot.id}>
                      {depot.nom} ({depot.clients_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Afficher</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="logistique"
                    checked={showLogistique}
                    onCheckedChange={(checked) => setShowLogistique(checked as boolean)}
                  />
                  <label htmlFor="logistique" className="text-sm flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.depotLogistique }} />
                    Logistique
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="retrait"
                    checked={showRetrait}
                    onCheckedChange={(checked) => setShowRetrait(checked as boolean)}
                  />
                  <label htmlFor="retrait" className="text-sm flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.depotRetrait }} />
                    Point retrait
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="horsZone"
                    checked={showHorsZone}
                    onCheckedChange={(checked) => setShowHorsZone(checked as boolean)}
                  />
                  <label htmlFor="horsZone" className="text-sm flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.clientHorsZone }} />
                    Hors zone ({filteredClientsHorsZone.length})
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Affichage</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showDepots"
                    checked={showDepots}
                    onCheckedChange={(checked) => setShowDepots(checked as boolean)}
                  />
                  <label htmlFor="showDepots" className="text-sm">Dépôts</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showClients"
                    checked={showClients}
                    onCheckedChange={(checked) => setShowClients(checked as boolean)}
                  />
                  <label htmlFor="showClients" className="text-sm">Clients</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="showRayons"
                    checked={showRayons}
                    onCheckedChange={(checked) => setShowRayons(checked as boolean)}
                  />
                  <label htmlFor="showRayons" className="text-sm">Rayons de couverture</label>
                </div>
              </div>
            </div>

            <Button onClick={resetFilters} variant="outline" className="w-full">
              Réinitialiser
            </Button>
          </CardContent>
        </Card>

        {/* Carte - sans padding, bords arrondis intégrés */}
        <Card className="lg:col-span-3 overflow-hidden rounded-lg">
          <CardContent className="p-0 h-[600px]">
            {mapNotAvailable ? (
              <div className="h-full flex flex-col items-center justify-center bg-muted/30">
                <MapPin className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Carte non disponible</p>
                <p className="text-sm text-muted-foreground mt-2 text-center max-w-md px-4">
                  {mapErrorMessage}
                </p>
                <p className="text-xs text-muted-foreground mt-4">
                  Les statistiques et la liste des dépôts restent fonctionnelles.
                </p>
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={{ lat: defaultCenter.lat, lng: defaultCenter.lng }}
                zoom={defaultCenter.zoom}
                onLoad={onMapLoad}
                options={{
                  styles: [
                    {
                      featureType: 'poi',
                      elementType: 'labels',
                      stylers: [{ visibility: 'off' }],
                    },
                  ],
                  mapTypeControl: true,
                  streetViewControl: false,
                  fullscreenControl: true,
                }}
              >
                {/* Rayons de couverture - conditionnels */}
                {showRayons && showDepots && filteredDepots.map(depot => (
                  <Circle
                    key={`circle-${depot.id}`}
                    center={{ lat: depot.latitude, lng: depot.longitude }}
                    radius={(depot.rayon_couverture_km || 10) * 1000}
                    options={{
                      fillColor: depot.type === 'logistique' ? COLORS.depotLogistique : COLORS.depotRetrait,
                      fillOpacity: 0.15,
                      strokeColor: depot.type === 'logistique' ? COLORS.depotLogistique : COLORS.depotRetrait,
                      strokeOpacity: 0.6,
                      strokeWeight: 2,
                    }}
                  />
                ))}

                {/* Marqueurs Dépôts */}
                {showDepots && filteredDepots.map(depot => (
                  <Marker
                    key={`depot-${depot.id}`}
                    position={{ lat: depot.latitude, lng: depot.longitude }}
                    icon={{
                      path: google.maps.SymbolPath.CIRCLE,
                      scale: MARKER_SIZE,
                      fillColor: depot.type === 'logistique' ? COLORS.depotLogistique : COLORS.depotRetrait,
                      fillOpacity: 1,
                      strokeColor: '#fff',
                      strokeWeight: 2,
                    }}
                    title={depot.nom}
                    onClick={() => setSelectedMarker({ type: 'depot', data: depot })}
                  />
                ))}

                {/* Marqueurs Clients */}
                {showClients && filteredClients.map(client => {
                  if (!client.latitude || !client.longitude) return null
                  const isHorsZone = !client.depot_retrait_id && !client.depot_logistique_id
                  return (
                    <Marker
                      key={`client-${client.id}`}
                      position={{ lat: client.latitude, lng: client.longitude }}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: MARKER_SIZE,
                        fillColor: isHorsZone ? COLORS.clientHorsZone : COLORS.client,
                        fillOpacity: 0.9,
                        strokeColor: '#fff',
                        strokeWeight: 2,
                      }}
                      title={client.raison_sociale}
                      onClick={() => setSelectedMarker({ type: 'client', data: client })}
                    />
                  )
                })}

                {/* InfoWindow */}
                {selectedMarker && (
                  <InfoWindow
                    position={{
                      lat: selectedMarker.type === 'depot'
                        ? (selectedMarker.data as Depot).latitude
                        : (selectedMarker.data as Client).latitude!,
                      lng: selectedMarker.type === 'depot'
                        ? (selectedMarker.data as Depot).longitude
                        : (selectedMarker.data as Client).longitude!,
                    }}
                    onCloseClick={() => setSelectedMarker(null)}
                  >
                    <div className="p-2 min-w-[200px]">
                      {selectedMarker.type === 'depot' ? (
                        <>
                          <h3 className="font-bold text-sm mb-1">{(selectedMarker.data as Depot).nom}</h3>
                          <Badge className="mb-2" variant={
                            (selectedMarker.data as Depot).type === 'logistique' ? 'default' : 'secondary'
                          }>
                            {(selectedMarker.data as Depot).type === 'logistique' ? 'Logistique' : 'Point retrait'}
                          </Badge>
                          <p className="text-xs text-gray-600">
                            {(selectedMarker.data as Depot).adresse}<br />
                            {(selectedMarker.data as Depot).code_postal} {(selectedMarker.data as Depot).ville}
                          </p>
                          <div className="mt-2 pt-2 border-t flex gap-4 text-xs">
                            <span><strong>{(selectedMarker.data as Depot).clients_count}</strong> clients</span>
                            <span><strong>{(selectedMarker.data as Depot).velos_count}</strong> vélos</span>
                          </div>
                          <Button
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => {
                              handleSelectDepot((selectedMarker.data as Depot).id)
                              setSelectedMarker(null)
                            }}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Voir les clients
                          </Button>
                        </>
                      ) : (
                        <>
                          <h3 className="font-bold text-sm mb-1">{(selectedMarker.data as Client).raison_sociale}</h3>
                          <p className="text-xs text-gray-600">
                            {(selectedMarker.data as Client).adresse_livraison_ligne1}<br />
                            {(selectedMarker.data as Client).adresse_livraison_cp} {(selectedMarker.data as Client).adresse_livraison_ville}
                          </p>
                          <div className="mt-2 pt-2 border-t text-xs">
                            <span><strong>{(selectedMarker.data as Client).velo_valide || 0}</strong> / {(selectedMarker.data as Client).velo_devis} vélos</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 w-full"
                            onClick={() => window.open(`/admin/clients/${(selectedMarker.data as Client).id}`, '_blank')}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Voir la fiche
                          </Button>
                        </>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Liste des dépôts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Dépôts ({filteredDepots.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDepots.map(depot => (
              <div
                key={depot.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                  selectedDepot === depot.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => handleSelectDepot(depot.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium">{depot.nom}</h4>
                    <p className="text-xs text-muted-foreground">{depot.ville}</p>
                  </div>
                  <Badge variant={depot.type === 'logistique' ? 'default' : 'secondary'}>
                    {depot.type === 'logistique' ? 'Logistique' : 'Retrait'}
                  </Badge>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {depot.clients_count} clients
                  </span>
                  <span className="flex items-center gap-1">
                    <Bike className="h-3 w-3" />
                    {depot.velos_count} vélos
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
