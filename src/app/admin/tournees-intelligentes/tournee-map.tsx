'use client'

import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api'
import { GOOGLE_MAPS_OPTIONS } from '@/lib/google-maps'
import { useCallback, useRef, useEffect } from 'react'

const MAP_CONTAINER = { width: '100%', height: '520px' }

const PIN_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ea580c', '#9333ea',
  '#0891b2', '#ca8a04', '#be185d', '#4f46e5', '#059669',
]

interface Client {
  id: string
  raison_sociale: string
  latitude: number
  longitude: number
}

interface TourneeMapProps {
  clients: Client[]
  center: { lat: number; lng: number }
  anchorPoint?: { lat: number; lng: number } | null
}

export default function TourneeMap({ clients, center, anchorPoint }: TourneeMapProps) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_OPTIONS)
  const mapRef = useRef<google.maps.Map | null>(null)
  // Centre figé à l'init : évite que la carte se recentre sur chaque re-render
  const initialCenterRef = useRef(center)
  // IDs déjà affichés : sert à distinguer une nouvelle proposition (re-cadrer)
  // d'une simple édition à droite — réordonnancement / suppression (ne PAS re-cadrer).
  const seenIdsRef = useRef<Set<string>>(new Set())

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    seenIdsRef.current = new Set(clients.map(c => c.id))
    fitMapToClients(map, clients, anchorPoint)
  }, [clients, anchorPoint])

  // Re-cadrer UNIQUEMENT quand de NOUVEAUX clients apparaissent (nouvelle proposition / cluster).
  // Si l'utilisateur réordonne ou retire un client, le zoom et la position sont préservés.
  useEffect(() => {
    if (!mapRef.current || clients.length === 0) return
    const hasNewClient = clients.some(c => !seenIdsRef.current.has(c.id))
    if (hasNewClient) {
      fitMapToClients(mapRef.current, clients, anchorPoint)
    }
    seenIdsRef.current = new Set(clients.map(c => c.id))
  }, [clients, anchorPoint])

  if (!isLoaded) {
    return (
      <div className="h-[520px] bg-gray-100 flex items-center justify-center text-gray-400">
        Chargement carte...
      </div>
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER}
      center={initialCenterRef.current}
      zoom={11}
      options={{ disableDefaultUI: true, zoomControl: true }}
      onLoad={onMapLoad}
    >
      {/* Marqueur point de départ (ancre) */}
      {anchorPoint && (
        <Marker
          position={{ lat: anchorPoint.lat, lng: anchorPoint.lng }}
          icon={{
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
            fillColor: '#000000',
            fillOpacity: 0.8,
            strokeWeight: 2,
            strokeColor: '#fff',
            scale: 1.8,
            anchor: new google.maps.Point(12, 22),
            labelOrigin: new google.maps.Point(12, 9),
          }}
          label={{
            text: 'D',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '12px',
          }}
          title="Point de départ"
        />
      )}
      {clients.map((client, idx) => (
        <Marker
          key={client.id}
          position={{ lat: client.latitude, lng: client.longitude }}
          label={{
            text: `${idx + 1}`,
            color: 'white',
            fontWeight: 'bold',
            fontSize: '11px',
          }}
          icon={{
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
            fillColor: PIN_COLORS[idx % PIN_COLORS.length],
            fillOpacity: 1,
            strokeWeight: 1,
            strokeColor: '#fff',
            scale: 1.5,
            anchor: new google.maps.Point(12, 22),
            labelOrigin: new google.maps.Point(12, 9),
          }}
          title={`${idx + 1}. ${client.raison_sociale}`}
        />
      ))}
    </GoogleMap>
  )
}

function fitMapToClients(
  map: google.maps.Map,
  clients: { latitude: number; longitude: number }[],
  anchorPoint?: { lat: number; lng: number } | null,
) {
  if (clients.length === 0) return

  const bounds = new google.maps.LatLngBounds()
  for (const c of clients) {
    bounds.extend({ lat: c.latitude, lng: c.longitude })
  }
  if (anchorPoint) {
    bounds.extend({ lat: anchorPoint.lat, lng: anchorPoint.lng })
  }

  map.fitBounds(bounds, 40) // 40px padding
}
