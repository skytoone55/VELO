'use client'

import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api'
import { GOOGLE_MAPS_OPTIONS } from '@/lib/google-maps'
import { useCallback, useRef, useEffect } from 'react'

const MAP_CONTAINER = { width: '100%', height: '400px' }

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

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    fitMapToClients(map, clients, anchorPoint)
  }, [clients, anchorPoint])

  // Re-fit quand les clients changent (changement de simulation)
  useEffect(() => {
    if (mapRef.current && clients.length > 0) {
      fitMapToClients(mapRef.current, clients, anchorPoint)
    }
  }, [clients, anchorPoint])

  if (!isLoaded) {
    return (
      <div className="h-[400px] bg-gray-100 flex items-center justify-center text-gray-400">
        Chargement carte...
      </div>
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER}
      center={center}
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
