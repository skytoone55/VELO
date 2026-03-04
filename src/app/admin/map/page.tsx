'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Circle } from '@react-google-maps/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Loader2, Building2, Users, Bike, MapPin, Warehouse, Package, Filter, RefreshCw, Eye, Shuffle, Crosshair, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown } from 'lucide-react'
import { getTenantId } from '@/lib/tenants'

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
  statut_commercial: string | null
  validation_naf: string | null
  monday_board_id: string | null
}

const BOARD_NAMES: Record<string, string> = {
  '2144986053': 'ATHOME',
  '5002798369': 'ALEX',
  '2146667697': 'DIZIEN',
  '2140187165': 'EKL',
  '2137662048': 'JM',
  '5013455904': 'SALIH',
  '5001072451': 'STELLARS',
  '9990833105': 'ECOVOLT',
}

function getAgenceOptions(tid: string) {
  return tid === 'ppe'
    ? [
        { value: 'all', label: 'Toutes les agences' },
        { value: 'FR', label: 'France M\u00e9tropolitaine' },
      ]
    : [
        { value: 'all', label: 'Toutes les agences' },
        { value: 'FR', label: 'France' },
        { value: '971', label: 'Guadeloupe' },
        { value: '972', label: 'Martinique' },
        { value: '973', label: 'Guyane' },
        { value: '974', label: 'La R\u00e9union' },
      ]
}

// Mapping des noms d'agence vers les codes (pour correspondre aux filtres)
const agenceNameToCode: Record<string, string> = {
  'france': 'FR',
  'france_metro': 'FR',
  'france m\u00e9tropolitaine': 'FR',
  'france metropolitaine': 'FR',
  'm\u00e9tropole': 'FR',
  'metropole': 'FR',
  'guadeloupe': '971',
  'martinique': '972',
  'guyane': '973',
  'la r\u00e9union': '974',
  'la reunion': '974',
  'r\u00e9union': '974',
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

  // V\u00e9rifier d'abord le mapping direct
  if (agenceNameToCode[normalized]) {
    return agenceNameToCode[normalized]
  }

  // V\u00e9rifier si c'est un d\u00e9partement m\u00e9tropolitain (2 chiffres, pas 97x)
  if (/^\d{2}$/.test(normalized) && !normalized.startsWith('97')) {
    return 'FR'
  }

  // V\u00e9rifier si c'est un code postal (5 chiffres)
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

  // V\u00e9rifier si c'est un d\u00e9partement DOM (3 chiffres commen\u00e7ant par 97)
  if (/^97[1-4]$/.test(normalized)) {
    return normalized
  }

  return 'FR'
}

// Centres g\u00e9ographiques par agence
function getAgenceCenters(tid: string): Record<string, { lat: number; lng: number; zoom: number }> {
  return tid === 'ppe'
    ? {
        'all': { lat: 46.603354, lng: 1.888334, zoom: 6 },
        'FR': { lat: 46.603354, lng: 1.888334, zoom: 6 },
      }
    : {
        'all': { lat: -21.115, lng: 55.536, zoom: 10 },
        'FR': { lat: 46.603354, lng: 1.888334, zoom: 6 },
        '971': { lat: 16.265, lng: -61.551, zoom: 10 },
        '972': { lat: 14.636, lng: -61.024, zoom: 10 },
        '973': { lat: 3.933, lng: -53.125, zoom: 7 },
        '974': { lat: -21.115, lng: 55.536, zoom: 10 },
      }
}

// Palette de 12+ couleurs bien contrast\u00e9es pour les d\u00e9p\u00f4ts
const DEPOT_COLOR_PALETTE = [
  '#E63946', // rouge
  '#2196F3', // bleu
  '#4CAF50', // vert
  '#FF9800', // orange
  '#9C27B0', // violet
  '#00BCD4', // cyan
  '#F5D100', // jaune
  '#795548', // marron
  '#E91E63', // rose
  '#009688', // teal
  '#FF5722', // orange fonc\u00e9
  '#3F51B5', // indigo
  '#8BC34A', // vert clair
  '#FF4081', // rose vif
]

// Couleurs fallback pour clients sans d\u00e9p\u00f4t rattach\u00e9
const CLIENT_DEFAULT_COLOR = '#3B82F6'

const MARKER_SIZE = 3
const DEPOT_MARKER_SIZE = 8
const GMAP_LIBRARIES: ('places')[] = ['places']

// Fonction haversine pour calculer la distance entre deux points GPS
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function MapPage() {
  const tenantId = getTenantId()
  const agenceOptions = useMemo(() => getAgenceOptions(tenantId), [tenantId])
  const agenceCenters = useMemo(() => getAgenceCenters(tenantId), [tenantId])

  const [depots, setDepots] = useState<Depot[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgence, setSelectedAgence] = useState<string>('all')
  const [selectedDepots, setSelectedDepots] = useState<string[]>([])
  const [selectedMarker, setSelectedMarker] = useState<{ type: 'depot' | 'client'; data: Depot | Client } | null>(null)
  const [showDepots, setShowDepots] = useState(true)
  const [showClients, setShowClients] = useState(true)
  const [showRayons, setShowRayons] = useState(true)
  const [showLogistique, setShowLogistique] = useState(true)
  const [showRetrait, setShowRetrait] = useState(true)
  const [showHorsZone, setShowHorsZone] = useState(true)
  const [reassigning, setReassigning] = useState(false)
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null)

  // Filtres multi-select
  const [selectedStatuts, setSelectedStatuts] = useState<string[]>([])
  const [selectedNaf, setSelectedNaf] = useState<string[]>([])
  const [selectedCommerciaux, setSelectedCommerciaux] = useState<string[]>([])

  // Mode simulation
  const [simulationMode, setSimulationMode] = useState(false)
  const [simulationPos, setSimulationPos] = useState<{ lat: number; lng: number } | null>(null)
  const [simulationRayon, setSimulationRayon] = useState(30)
  const [simulationResult, setSimulationResult] = useState<any | null>(null)
  const [simulationLoading, setSimulationLoading] = useState(false)

  // Google services refs
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null)

  // Simulation address autocomplete
  const [simAddress, setSimAddress] = useState('')
  const [simSuggestions, setSimSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showSimSuggestions, setShowSimSuggestions] = useState(false)

  // Slider rayon visuel par d\u00e9p\u00f4t (uniquement visuel, non sauvegard\u00e9)
  const [depotVisualRayon, setDepotVisualRayon] = useState<number | null>(null)

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: GMAP_LIBRARIES,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/map/data')
      const data = await response.json()

      if (data.success) {
        // Normaliser les agences des d\u00e9p\u00f4ts
        const normalizedDepots = (data.depots || []).map((depot: Depot) => ({
          ...depot,
          agence: normalizeAgence(depot.agence),
        }))
        // Normaliser les agences des clients
        const normalizedClients = (data.clients || []).map((client: Client) => ({
          ...client,
          agence: normalizeAgence(client.agence || client.departement),
        }))

        console.log('Donn\u00e9es carte charg\u00e9es:', normalizedClients.length, 'clients,', normalizedDepots.length, 'd\u00e9p\u00f4ts')
        console.log('Agences d\u00e9p\u00f4ts uniques:', [...new Set(normalizedDepots.map((d: Depot) => d.agence))])

        setDepots(normalizedDepots)
        setClients(normalizedClients)
      } else {
        console.error('Erreur API map/data:', data.error)
      }
    } catch (error) {
      console.error('Erreur chargement donn\u00e9es carte:', error)
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
    setSelectedDepots([])
  }, [selectedAgence, mapInstance])


  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map)
    geocoderRef.current = new google.maps.Geocoder()
    autocompleteRef.current = new google.maps.places.AutocompleteService()
  }, [])

  // Emp\u00eacher Google Maps de bloquer la navigation
  // Patch addEventListener pour intercepter et bloquer tout ajout de beforeunload
  useEffect(() => {
    window.onbeforeunload = null

    const originalAddEventListener = window.addEventListener.bind(window)
    const originalRemoveEventListener = window.removeEventListener.bind(window)
    const blockedHandlers: EventListenerOrEventListenerObject[] = []

    window.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      if (type === 'beforeunload') {
        blockedHandlers.push(listener)
        return // silently block
      }
      return originalAddEventListener(type, listener, options)
    } as typeof window.addEventListener

    window.removeEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) {
      if (type === 'beforeunload') {
        const idx = blockedHandlers.indexOf(listener)
        if (idx !== -1) blockedHandlers.splice(idx, 1)
        return
      }
      return originalRemoveEventListener(type, listener, options)
    } as typeof window.removeEventListener

    return () => {
      window.addEventListener = originalAddEventListener as typeof window.addEventListener
      window.removeEventListener = originalRemoveEventListener as typeof window.removeEventListener
      window.onbeforeunload = null
    }
  }, [])

  // Assigner une couleur unique \u00e0 chaque d\u00e9p\u00f4t
  const depotColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    depots.forEach((depot, index) => {
      map[depot.id] = DEPOT_COLOR_PALETTE[index % DEPOT_COLOR_PALETTE.length]
    })
    return map
  }, [depots])

  // Lookup d\u00e9p\u00f4ts par ID
  const depotsMap = useMemo(() => {
    const map: Record<string, typeof depots[0]> = {}
    depots.forEach(d => { map[d.id] = d })
    return map
  }, [depots])

  // Hors-zone = distance au d\u00e9p\u00f4t assign\u00e9 > rayon_couverture_km (ou pas de d\u00e9p\u00f4t)
  const horsZoneClientIds = useMemo(() => {
    const set = new Set<string>()
    clients.forEach(client => {
      if (!client.latitude || !client.longitude) { set.add(client.id); return }
      const depotId = client.depot_retrait_id || client.depot_logistique_id
      if (!depotId) { set.add(client.id); return }
      const depot = depotsMap[depotId]
      if (!depot) { set.add(client.id); return }
      const dist = haversineDistance(client.latitude, client.longitude, depot.latitude, depot.longitude)
      if (dist > (depot.rayon_couverture_km || 30)) set.add(client.id)
    })
    return set
  }, [clients, depotsMap])

  // Pour chaque client hors-zone, trouver le d\u00e9p\u00f4t le plus proche (pour coloration)
  const horsZoneDepotMap = useMemo(() => {
    const map: Record<string, string> = {} // clientId -> depotId
    if (depots.length === 0) return map
    clients.forEach(client => {
      if (!horsZoneClientIds.has(client.id) || !client.latitude || !client.longitude) return
      // Si le client a un d\u00e9p\u00f4t assign\u00e9, utiliser celui-l\u00e0
      if (client.depot_retrait_id || client.depot_logistique_id) {
        map[client.id] = (client.depot_retrait_id || client.depot_logistique_id)!
        return
      }
      // Sinon, trouver le plus proche
      let minDist = Infinity
      let closestDepotId = depots[0].id
      depots.forEach(depot => {
        const dist = haversineDistance(client.latitude!, client.longitude!, depot.latitude, depot.longitude)
        if (dist < minDist) { minDist = dist; closestDepotId = depot.id }
      })
      map[client.id] = closestDepotId
    })
    return map
  }, [clients, depots, horsZoneClientIds])

  // horsZoneByDepot et horsZoneCountByDepot d\u00e9clar\u00e9s apr\u00e8s clientsHorsZoneParAgence (voir plus bas)

  // Fonction pour obtenir la couleur d'un client
  const getClientColor = useCallback((client: Client): string => {
    const depotId = client.depot_retrait_id || client.depot_logistique_id || horsZoneDepotMap[client.id]
    if (depotId && depotColorMap[depotId]) return depotColorMap[depotId]
    return CLIENT_DEFAULT_COLOR
  }, [depotColorMap, horsZoneDepotMap])

  // Autocompl\u00e9tion d'adresse (simulation uniquement)
  const handleSimAddressInput = useCallback((text: string) => {
    setSimAddress(text)
    setShowSimSuggestions(true)
    if (!text.trim() || !autocompleteRef.current) {
      setSimSuggestions([])
      return
    }
    autocompleteRef.current.getPlacePredictions(
      { input: text, componentRestrictions: { country: 'fr' } },
      (predictions) => {
        setSimSuggestions(predictions || [])
      }
    )
  }, [])

  // S\u00e9lection d'une suggestion simulation (geocode puis placement)
  const handleSimSelectSuggestion = useCallback((placeId: string) => {
    if (!geocoderRef.current) return
    setShowSimSuggestions(false)
    setSimSuggestions([])

    geocoderRef.current.geocode({ placeId }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location
        setSimAddress(results[0].formatted_address || '')
        setSimulationPos({ lat: loc.lat(), lng: loc.lng() })
      } else {
        toast.error('Adresse non trouv\u00e9e')
      }
    })
  }, [])

  // D\u00e9p\u00f4ts filtr\u00e9s par agence (pour le s\u00e9lecteur)
  const depotsForSelector = useMemo(() => {
    return depots.filter(depot => {
      if (selectedAgence !== 'all' && depot.agence !== selectedAgence) return false
      return true
    })
  }, [depots, selectedAgence])

  // D\u00e9p\u00f4ts filtr\u00e9s pour l'affichage
  const filteredDepots = useMemo(() => {
    return depots.filter(depot => {
      if (selectedAgence !== 'all' && depot.agence !== selectedAgence) return false
      if (selectedDepots.length > 0 && !selectedDepots.includes(depot.id)) return false
      if (depot.type === 'logistique' && !showLogistique) return false
      if (depot.type === 'retrait' && !showRetrait) return false
      return true
    })
  }, [depots, selectedAgence, selectedDepots, showLogistique, showRetrait])

  // Clients filtr\u00e9s par agence + filtres multi-select (pour stats)
  const clientsParAgence = useMemo(() => {
    return clients.filter(client => {
      if (selectedAgence !== 'all' && client.agence !== selectedAgence) {
        return false
      }
      // Filtre statut commercial
      if (selectedStatuts.length > 0 && !selectedStatuts.includes(client.statut_commercial || '')) {
        return false
      }
      // Filtre NAF
      if (selectedNaf.length > 0) {
        const nafLabel = client.validation_naf || 'A v\u00e9rifier'
        if (!selectedNaf.includes(nafLabel)) return false
      }
      // Filtre commercial (board)
      if (selectedCommerciaux.length > 0) {
        const boardName = client.monday_board_id ? (BOARD_NAMES[client.monday_board_id] || 'Autre') : 'Non assign\u00e9'
        if (!selectedCommerciaux.includes(boardName)) return false
      }
      return true
    })
  }, [clients, selectedAgence, selectedStatuts, selectedNaf, selectedCommerciaux])

  // Valeurs uniques pour les filtres multi-select (bas\u00e9es sur TOUS les clients de l'agence, pas les filtr\u00e9s)
  const uniqueStatuts = useMemo(() => {
    const agenceClients = clients.filter(c => selectedAgence === 'all' || c.agence === selectedAgence)
    const statuts = new Set(agenceClients.map(c => c.statut_commercial || '').filter(Boolean))
    return Array.from(statuts).sort()
  }, [clients, selectedAgence])

  const uniqueCommerciaux = useMemo(() => {
    const agenceClients = clients.filter(c => selectedAgence === 'all' || c.agence === selectedAgence)
    const names = new Set(agenceClients.map(c => c.monday_board_id ? (BOARD_NAMES[c.monday_board_id] || 'Autre') : 'Non assign\u00e9'))
    return Array.from(names).sort()
  }, [clients, selectedAgence])

  // Clients hors zone (pour stats) - bas\u00e9 sur distance > rayon
  const clientsHorsZoneParAgence = useMemo(() => {
    return clientsParAgence.filter(c => horsZoneClientIds.has(c.id))
  }, [clientsParAgence, horsZoneClientIds])

  // Compteur de clients et v\u00e9los hors-zone par d\u00e9p\u00f4t le plus proche
  const horsZoneByDepot = useMemo(() => {
    const data: Record<string, { clients: number; velos: number }> = {}
    clientsHorsZoneParAgence.forEach(client => {
      const depotId = horsZoneDepotMap[client.id]
      if (depotId) {
        if (!data[depotId]) data[depotId] = { clients: 0, velos: 0 }
        data[depotId].clients++
        data[depotId].velos += client.velo_valide || 0
      }
    })
    return data
  }, [horsZoneDepotMap, clientsHorsZoneParAgence])
  const horsZoneCountByDepot = useMemo(() => {
    const counts: Record<string, number> = {}
    Object.entries(horsZoneByDepot).forEach(([id, d]) => { counts[id] = d.clients })
    return counts
  }, [horsZoneByDepot])

  // Clients filtr\u00e9s pour l'affichage sur la carte (avec filtres visuels suppl\u00e9mentaires)
  // Note : s\u00e9lectionner un d\u00e9p\u00f4t ne masque plus les autres clients (zoom + slider rayon uniquement)
  const filteredClients = useMemo(() => {
    return clientsParAgence.filter(client => {
      const isHorsZone = horsZoneClientIds.has(client.id)
      if (isHorsZone && !showHorsZone) return false
      if (!isHorsZone && !showLogistique && !showRetrait) return false
      return true
    })
  }, [clientsParAgence, showHorsZone, showLogistique, showRetrait, horsZoneClientIds])

  // Stats r\u00e9actives - bas\u00e9es sur les donn\u00e9es filtr\u00e9es par agence (pas les filtres visuels)
  const stats = useMemo(() => {
    const totalDepotsLogistique = filteredDepots.filter(d => d.type === 'logistique').length
    const totalDepotsRetrait = filteredDepots.filter(d => d.type === 'retrait').length
    const clientsEnZone = clientsParAgence.filter(c => !horsZoneClientIds.has(c.id))
    const clientsHorsZone = clientsParAgence.filter(c => horsZoneClientIds.has(c.id))
    const clientsZone = clientsEnZone.length
    const velosZone = clientsEnZone.reduce((sum, c) => sum + (c.velo_valide || 0), 0)
    const clientsHZ = clientsHorsZone.length
    const velosHZ = clientsHorsZone.reduce((sum, c) => sum + (c.velo_valide || 0), 0)
    const totalClients = clientsParAgence.length
    const totalVelos = clientsParAgence.reduce((sum, c) => sum + (c.velo_valide || 0), 0)
    return { totalDepotsLogistique, totalDepotsRetrait, clientsZone, velosZone, clientsHZ, velosHZ, totalClients, totalVelos }
  }, [clientsParAgence, filteredDepots, horsZoneClientIds])

  const handleToggleDepot = (depotId: string) => {
    setSelectedDepots(prev =>
      prev.includes(depotId) ? prev.filter(id => id !== depotId) : [...prev, depotId]
    )
    setDepotVisualRayon(null)
  }

  const resetFilters = () => {
    setSelectedAgence('all')
    setSelectedDepots([])
    setShowLogistique(true)
    setShowRetrait(true)
    setShowHorsZone(true)
    setDepotVisualRayon(null)
    setSelectedStatuts([])
    setSelectedNaf([])
    setSelectedCommerciaux([])
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
          toast.success(`${data.reassigned} client(s) r\u00e9assign\u00e9(s) au d\u00e9p\u00f4t le plus proche`)
          loadData()
        } else {
          toast.info('Tous les clients sont d\u00e9j\u00e0 assign\u00e9s au d\u00e9p\u00f4t le plus proche')
        }
      } else {
        toast.error(data.error || 'Erreur lors de la r\u00e9assignation')
      }
    } catch (error) {
      toast.error('Erreur lors de la r\u00e9assignation')
    } finally {
      setReassigning(false)
    }
  }

  // Simulation : appeler l'API quand la position ou le rayon change
  const runSimulation = useCallback(async (lat: number, lng: number, rayon: number) => {
    setSimulationLoading(true)
    try {
      const response = await fetch('/api/admin/depots/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng, rayonKm: rayon }),
      })
      const data = await response.json()
      if (!data.error) {
        setSimulationResult(data)
      } else {
        console.error('Erreur simulation:', data.error)
      }
    } catch (error) {
      console.error('Erreur simulation:', error)
    }
    setSimulationLoading(false)
  }, [])

  // Debounce simulation
  useEffect(() => {
    if (!simulationMode || !simulationPos) return
    const timer = setTimeout(() => {
      runSimulation(simulationPos.lat, simulationPos.lng, simulationRayon)
    }, 500)
    return () => clearTimeout(timer)
  }, [simulationPos, simulationRayon, simulationMode, runSimulation])

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!simulationMode || !e.latLng) return
    setSimulationPos({ lat: e.latLng.lat(), lng: e.latLng.lng() })
  }, [simulationMode])

  const toggleSimulation = () => {
    if (simulationMode) {
      // D\u00e9sactiver la simulation
      setSimulationMode(false)
      setSimulationPos(null)
      setSimulationResult(null)
      setSimAddress('')
      setSimSuggestions([])
    } else {
      setSimulationMode(true)
    }
  }

  const mapNotAvailable = loadError || !isLoaded
  const mapErrorMessage = loadError
    ? "Erreur de chargement de la carte. V\u00e9rifiez la cl\u00e9 API Google Maps."
    : !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    ? "Cl\u00e9 API Google Maps non configur\u00e9e (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)"
    : "Chargement de la carte..."

  if (loading) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Chargement des donn\u00e9es...</span>
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
          <p className="text-muted-foreground">Vue d'ensemble des d\u00e9p\u00f4ts et clients</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={toggleSimulation}
            variant={simulationMode ? 'default' : 'outline'}
            size="sm"
          >
            <Crosshair className="h-4 w-4 mr-2" />
            {simulationMode ? 'Quitter simulation' : 'Simuler un d\u00e9p\u00f4t'}
          </Button>
          <Button onClick={handleReassignClients} variant="outline" size="sm" disabled={reassigning}>
            {reassigning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Shuffle className="h-4 w-4 mr-2" />
            )}
            R\u00e9assigner clients
          </Button>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Stats compactes */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
          <Warehouse className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight">{stats.totalDepotsLogistique}</p>
            <p className="text-[10px] text-muted-foreground">D\u00e9p\u00f4ts logistique</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
          <Package className="h-4 w-4 text-green-600 shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight">{stats.totalDepotsRetrait}</p>
            <p className="text-[10px] text-muted-foreground">Points retrait</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
          <Users className="h-4 w-4 text-blue-500 shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight">{stats.clientsZone}</p>
            <p className="text-[10px] text-muted-foreground">Clients zone</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
          <Bike className="h-4 w-4 text-blue-500 shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight">{stats.velosZone}</p>
            <p className="text-[10px] text-muted-foreground">V\u00e9los zone</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border border-orange-200 rounded-lg px-3 py-2">
          <Users className="h-4 w-4 text-orange-500 shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight text-orange-600">{stats.clientsHZ}</p>
            <p className="text-[10px] text-muted-foreground">Clients hors zone</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border border-orange-200 rounded-lg px-3 py-2">
          <Bike className="h-4 w-4 text-orange-500 shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight text-orange-600">{stats.velosHZ}</p>
            <p className="text-[10px] text-muted-foreground">V\u00e9los hors zone</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border border-primary/30 rounded-lg px-3 py-2">
          <Users className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight">{stats.totalClients}</p>
            <p className="text-[10px] text-muted-foreground">TOTAL clients</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-card border border-primary/30 rounded-lg px-3 py-2">
          <Bike className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight">{stats.totalVelos}</p>
            <p className="text-[10px] text-muted-foreground">TOTAL v\u00e9los</p>
          </div>
        </div>
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

            <div className="space-y-1">
              <Label className="text-xs">D\u00e9p\u00f4ts</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs">
                    <span className="truncate">
                      {selectedDepots.length === 0 ? 'Tous les d\u00e9p\u00f4ts' : `${selectedDepots.length} s\u00e9lectionn\u00e9${selectedDepots.length > 1 ? 's' : ''}`}
                    </span>
                    <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {depotsForSelector.map(depot => (
                      <label
                        key={depot.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent text-xs ${
                          selectedDepots.includes(depot.id) ? 'bg-accent/60' : ''
                        }`}
                      >
                        <Checkbox
                          checked={selectedDepots.includes(depot.id)}
                          onCheckedChange={() => handleToggleDepot(depot.id)}
                        />
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: depotColorMap[depot.id] || '#3B82F6' }}
                        />
                        <span className="truncate">{depot.nom} ({depot.clients_count})</span>
                      </label>
                    ))}
                  </div>
                  {selectedDepots.length > 0 && (
                    <button
                      onClick={() => setSelectedDepots([])}
                      className="w-full text-xs text-muted-foreground hover:text-foreground underline mt-2 pt-2 border-t"
                    >
                      Tout d\u00e9s\u00e9lectionner
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>


            {/* Slider rayon visuel \u2014 affich\u00e9 uniquement quand un d\u00e9p\u00f4t est s\u00e9lectionn\u00e9 */}
            {selectedDepots.length === 1 && (() => {
              const depot = depots.find(d => d.id === selectedDepots[0])
              if (!depot) return null
              const currentRayon = depotVisualRayon ?? depot.rayon_couverture_km ?? 10
              return (
                <div className="space-y-2 p-3 bg-muted/40 rounded-lg border">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: depotColorMap[depot.id] || '#3B82F6' }}
                    />
                    <Label className="text-xs font-medium truncate">{depot.nom}</Label>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Rayon visuel</span>
                    <span className="font-medium text-foreground">{currentRayon} km</span>
                  </div>
                  <Slider
                    value={[currentRayon]}
                    onValueChange={([v]) => setDepotVisualRayon(v)}
                    min={1}
                    max={200}
                    step={1}
                  />
                  {depotVisualRayon !== null && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full h-6 text-xs"
                      onClick={() => setDepotVisualRayon(null)}
                    >
                      R\u00e9initialiser ({depot.rayon_couverture_km} km)
                    </Button>
                  )}
                </div>
              )
            })()}

            {/* Filtre Statut commercial */}
            {uniqueStatuts.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Statut commercial</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs">
                      <span className="truncate">
                        {selectedStatuts.length === 0 ? 'Tous' : `${selectedStatuts.length} s\u00e9lectionn\u00e9${selectedStatuts.length > 1 ? 's' : ''}`}
                      </span>
                      <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="start">
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {uniqueStatuts.map(statut => (
                        <label key={statut} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent text-xs">
                          <Checkbox
                            checked={selectedStatuts.includes(statut)}
                            onCheckedChange={(checked) => {
                              setSelectedStatuts(prev =>
                                checked ? [...prev, statut] : prev.filter(s => s !== statut)
                              )
                            }}
                          />
                          <span className="truncate">{statut}</span>
                        </label>
                      ))}
                    </div>
                    {selectedStatuts.length > 0 && (
                      <button onClick={() => setSelectedStatuts([])} className="w-full text-xs text-muted-foreground hover:text-foreground underline mt-2 pt-2 border-t">
                        Tout d\u00e9s\u00e9lectionner
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Filtre NAF */}
            <div className="space-y-1">
              <Label className="text-xs">NAF ENEMAT</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs">
                    <span className="truncate">
                      {selectedNaf.length === 0 ? 'Tous' : `${selectedNaf.length} s\u00e9lectionn\u00e9${selectedNaf.length > 1 ? 's' : ''}`}
                    </span>
                    <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="space-y-0.5">
                    {['OUI', 'NON', 'A v\u00e9rifier'].map(label => (
                      <label key={label} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent text-xs">
                        <Checkbox
                          checked={selectedNaf.includes(label)}
                          onCheckedChange={(checked) => {
                            setSelectedNaf(prev =>
                              checked ? [...prev, label] : prev.filter(s => s !== label)
                            )
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  {selectedNaf.length > 0 && (
                    <button onClick={() => setSelectedNaf([])} className="w-full text-xs text-muted-foreground hover:text-foreground underline mt-2 pt-2 border-t">
                      Tout d\u00e9s\u00e9lectionner
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtre Commercial (board) */}
            {uniqueCommerciaux.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Commercial</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs">
                      <span className="truncate">
                        {selectedCommerciaux.length === 0 ? 'Tous' : `${selectedCommerciaux.length} s\u00e9lectionn\u00e9${selectedCommerciaux.length > 1 ? 's' : ''}`}
                      </span>
                      <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="start">
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {uniqueCommerciaux.map(name => (
                        <label key={name} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent text-xs">
                          <Checkbox
                            checked={selectedCommerciaux.includes(name)}
                            onCheckedChange={(checked) => {
                              setSelectedCommerciaux(prev =>
                                checked ? [...prev, name] : prev.filter(s => s !== name)
                              )
                            }}
                          />
                          <span className="truncate">{name}</span>
                        </label>
                      ))}
                    </div>
                    {selectedCommerciaux.length > 0 && (
                      <button onClick={() => setSelectedCommerciaux([])} className="w-full text-xs text-muted-foreground hover:text-foreground underline mt-2 pt-2 border-t">
                        Tout d\u00e9s\u00e9lectionner
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="space-y-2">
              <Label>Afficher</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="logistique"
                    checked={showLogistique}
                    onCheckedChange={(checked) => setShowLogistique(checked as boolean)}
                  />
                  <label htmlFor="logistique" className="text-sm">
                    D\u00e9p\u00f4ts logistique
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="retrait"
                    checked={showRetrait}
                    onCheckedChange={(checked) => setShowRetrait(checked as boolean)}
                  />
                  <label htmlFor="retrait" className="text-sm">
                    Points retrait
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="horsZone"
                    checked={showHorsZone}
                    onCheckedChange={(checked) => setShowHorsZone(checked as boolean)}
                  />
                  <label htmlFor="horsZone" className="text-sm">
                    Hors zone ({clientsHorsZoneParAgence.length})
                  </label>
                </div>
                {/* L\u00e9gende couleurs par d\u00e9p\u00f4t */}
                {filteredDepots.length > 0 && (
                  <div className="mt-3 pt-3 border-t space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Couleurs par d\u00e9p\u00f4t</p>
                    {filteredDepots.map(depot => (
                      <div key={`legend-${depot.id}`} className="flex items-center gap-2 text-xs">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: depotColorMap[depot.id] || '#3B82F6' }}
                        />
                        <span className="truncate" title={depot.nom}>{depot.nom}</span>
                        {horsZoneCountByDepot[depot.id] > 0 && (
                          <span className="text-orange-500 text-xs flex-shrink-0">
                            +{horsZoneCountByDepot[depot.id]}hz
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
                  <label htmlFor="showDepots" className="text-sm">D\u00e9p\u00f4ts</label>
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
              R\u00e9initialiser
            </Button>

            {/* Panneau simulation */}
            {simulationMode && (
              <div className="mt-4 pt-4 border-t space-y-3">
                <Label className="flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-primary" />
                  Simulation
                </Label>
                {/* Champ adresse simulation avec autocompl\u00e9tion */}
                <div className="space-y-1 relative">
                  <Label className="text-xs">Adresse du d\u00e9p\u00f4t virtuel</Label>
                  <Input
                    value={simAddress}
                    onChange={(e) => handleSimAddressInput(e.target.value)}
                    onFocus={() => simSuggestions.length > 0 && setShowSimSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSimSuggestions(false), 200)}
                    placeholder="Tapez une adresse..."
                    className="text-xs"
                  />
                  {showSimSuggestions && simSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full bg-popover border rounded-md shadow-md mt-1 max-h-48 overflow-y-auto">
                      {simSuggestions.map(s => (
                        <button
                          key={s.place_id}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
                          onMouseDown={() => handleSimSelectSuggestion(s.place_id)}
                        >
                          {s.description}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!simulationPos ? (
                  <p className="text-xs text-muted-foreground">
                    Saisissez une adresse ci-dessus ou cliquez sur la carte
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Rayon de couverture</span>
                        <span className="font-medium">{simulationRayon} km</span>
                      </div>
                      <Slider
                        value={[simulationRayon]}
                        onValueChange={([v]) => setSimulationRayon(v)}
                        min={5}
                        max={150}
                        step={5}
                      />
                    </div>

                    {simulationLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Calcul en cours...</span>
                      </div>
                    ) : simulationResult ? (
                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-primary/10 rounded p-2 text-center">
                            <p className="text-lg font-bold">{simulationResult.clientsAbsorbed}</p>
                            <p className="text-xs text-muted-foreground">Clients</p>
                          </div>
                          <div className="bg-primary/10 rounded p-2 text-center">
                            <p className="text-lg font-bold">{simulationResult.velosAbsorbed}</p>
                            <p className="text-xs text-muted-foreground">V\u00e9los</p>
                          </div>
                        </div>
                        {simulationResult.clientsCurrentlyUnassigned > 0 && (
                          <p className="text-xs text-green-600">
                            dont {simulationResult.clientsCurrentlyUnassigned} actuellement sans d\u00e9p\u00f4t
                          </p>
                        )}
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Par distance :</p>
                          {simulationResult.clientsByDistance
                            ?.filter((d: any) => d.count > 0)
                            .map((d: any) => (
                              <div key={d.range} className="flex justify-between text-xs">
                                <span>{d.range}</span>
                                <span>{d.count} clients ({d.velos} v\u00e9los)</span>
                              </div>
                            ))
                          }
                        </div>
                        <Button
                          size="sm"
                          className="w-full mt-2"
                          onClick={() => {
                            window.open(
                              `/admin/depots?lat=${simulationPos.lat}&lng=${simulationPos.lng}&rayon=${simulationRayon}`,
                              '_blank'
                            )
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Cr\u00e9er un d\u00e9p\u00f4t ici
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Carte - sans padding, bords arrondis int\u00e9gr\u00e9s */}
        <Card className="lg:col-span-3 overflow-hidden rounded-lg">
          <CardContent className="p-0 h-[calc(100vh-320px)] min-h-[500px]">
            {mapNotAvailable ? (
              <div className="h-full flex flex-col items-center justify-center bg-muted/30">
                <MapPin className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Carte non disponible</p>
                <p className="text-sm text-muted-foreground mt-2 text-center max-w-md px-4">
                  {mapErrorMessage}
                </p>
                <p className="text-xs text-muted-foreground mt-4">
                  Les statistiques et la liste des d\u00e9p\u00f4ts restent fonctionnelles.
                </p>
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={{ lat: defaultCenter.lat, lng: defaultCenter.lng }}
                zoom={defaultCenter.zoom}
                onLoad={onMapLoad}
                onClick={handleMapClick}
                options={{
                  draggableCursor: simulationMode ? 'crosshair' : undefined,
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
                {showRayons && showDepots && filteredDepots.map(depot => {
                  const depotColor = depotColorMap[depot.id] || '#3B82F6'
                  const rayon = (selectedDepots.includes(depot.id) && depotVisualRayon !== null)
                    ? depotVisualRayon
                    : (depot.rayon_couverture_km || 10)
                  return (
                    <Circle
                      key={`circle-${depot.id}`}
                      center={{ lat: depot.latitude, lng: depot.longitude }}
                      radius={rayon * 1000}
                      options={{
                        fillColor: depotColor,
                        fillOpacity: 0.15,
                        strokeColor: depotColor,
                        strokeOpacity: 0.7,
                        strokeWeight: 2,
                      }}
                    />
                  )
                })}

                {/* Marqueurs D\u00e9p\u00f4ts */}
                {showDepots && filteredDepots.map(depot => {
                  const depotColor = depotColorMap[depot.id] || '#3B82F6'
                  const isSelected = selectedDepots.includes(depot.id)
                  return (
                    <Marker
                      key={`depot-${depot.id}`}
                      position={{ lat: depot.latitude, lng: depot.longitude }}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: isSelected ? DEPOT_MARKER_SIZE + 3 : DEPOT_MARKER_SIZE,
                        fillColor: depotColor,
                        fillOpacity: 1,
                        strokeColor: '#fff',
                        strokeWeight: isSelected ? 3 : 2,
                      }}
                      title={depot.nom}
                      onClick={() => setSelectedMarker({ type: 'depot', data: depot })}
                    />
                  )
                })}

                {/* Marqueurs Clients */}
                {showClients && filteredClients.map(client => {
                  if (!client.latitude || !client.longitude) return null
                  const isHorsZone = horsZoneClientIds.has(client.id)
                  const clientColor = getClientColor(client)
                  return (
                    <Marker
                      key={`client-${client.id}`}
                      position={{ lat: client.latitude, lng: client.longitude }}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: MARKER_SIZE,
                        fillColor: clientColor,
                        fillOpacity: 0.85,
                        strokeColor: '#fff',
                        strokeWeight: 1,
                      }}
                      title={client.raison_sociale + (isHorsZone ? ' (hors zone)' : '')}
                      onClick={() => setSelectedMarker({ type: 'client', data: client })}
                    />
                  )
                })}

                {/* Marqueur et cercle de simulation */}
                {simulationMode && simulationPos && (
                  <>
                    <Marker
                      position={simulationPos}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: '#8B5CF6',
                        fillOpacity: 1,
                        strokeColor: '#fff',
                        strokeWeight: 3,
                      }}
                      draggable={true}
                      onDragEnd={(e) => {
                        if (e.latLng) {
                          setSimulationPos({ lat: e.latLng.lat(), lng: e.latLng.lng() })
                        }
                      }}
                      title="D\u00e9p\u00f4t simul\u00e9 (d\u00e9pla\u00e7able)"
                    />
                    <Circle
                      center={simulationPos}
                      radius={simulationRayon * 1000}
                      options={{
                        fillColor: '#8B5CF6',
                        fillOpacity: 0.1,
                        strokeColor: '#8B5CF6',
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                      }}
                    />
                  </>
                )}

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
                          <div className="mt-2 pt-2 border-t text-xs space-y-1">
                            <div className="flex gap-3">
                              <span><strong>{(selectedMarker.data as Depot).clients_count}</strong> clients</span>
                              <span><strong>{(selectedMarker.data as Depot).velos_count}</strong> v\u00e9los</span>
                            </div>
                            {horsZoneByDepot[(selectedMarker.data as Depot).id]?.clients > 0 && (
                              <div className="flex gap-3 text-orange-600">
                                <span><strong>{horsZoneByDepot[(selectedMarker.data as Depot).id].clients}</strong> cli. hors zone</span>
                                <span><strong>{horsZoneByDepot[(selectedMarker.data as Depot).id].velos}</strong> v\u00e9los hors zone</span>
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => {
                              handleToggleDepot((selectedMarker.data as Depot).id)
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
                            <span><strong>{(selectedMarker.data as Client).velo_valide || 0}</strong> / {(selectedMarker.data as Client).velo_devis} v\u00e9los</span>
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

      {/* Liste des d\u00e9p\u00f4ts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            D\u00e9p\u00f4ts ({filteredDepots.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDepots.map(depot => (
              <div
                key={depot.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                  selectedDepots.includes(depot.id) ? 'ring-2 ring-primary' : ''
                }`}
                style={selectedDepots.includes(depot.id) ? { borderColor: depotColorMap[depot.id] } : {}}
                onClick={() => handleToggleDepot(depot.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: depotColorMap[depot.id] || '#3B82F6' }}
                    />
                    <div>
                      <h4 className="font-medium">{depot.nom}</h4>
                      <p className="text-xs text-muted-foreground">{depot.ville}</p>
                    </div>
                  </div>
                  <Badge variant={depot.type === 'logistique' ? 'default' : 'secondary'}>
                    {depot.type === 'logistique' ? 'Logistique' : 'Retrait'}
                  </Badge>
                </div>
                <div className="flex gap-3 text-xs flex-wrap">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-blue-500" />
                    {depot.clients_count} clients
                  </span>
                  <span className="flex items-center gap-1">
                    <Bike className="h-3 w-3 text-blue-500" />
                    {depot.velos_count} v\u00e9los
                  </span>
                  {horsZoneByDepot[depot.id] && horsZoneByDepot[depot.id].clients > 0 && (
                    <>
                      <span className="flex items-center gap-1 text-orange-500">
                        <Users className="h-3 w-3" />
                        {horsZoneByDepot[depot.id].clients} cli. hors zone
                      </span>
                      <span className="flex items-center gap-1 text-orange-500">
                        <Bike className="h-3 w-3" />
                        {horsZoneByDepot[depot.id].velos} v\u00e9los hors zone
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
