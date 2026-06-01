'use client'

import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api'
import { GOOGLE_MAPS_OPTIONS } from '@/lib/google-maps'
import { useCallback, useRef, useEffect } from 'react'

const MAP_CONTAINER = { width: '100%', height: '100%' }

const PIN_PATH = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'

export interface RouteStop {
  position: number
  nom: string
  latitude: number | null
  longitude: number | null
}

export interface RouteDepot {
  nom: string
  latitude: number
  longitude: number
}

interface TourneeRouteMapProps {
  stops: RouteStop[]
  depot?: RouteDepot | null
}

export default function TourneeRouteMap({ stops, depot }: TourneeRouteMapProps) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_OPTIONS)
  const mapRef = useRef<google.maps.Map | null>(null)

  const geoStops = stops.filter(
    (s): s is RouteStop & { latitude: number; longitude: number } =>
      s.latitude != null && s.longitude != null,
  )

  const fit = useCallback(
    (map: google.maps.Map) => {
      if (geoStops.length === 0 && !depot) return
      const bounds = new google.maps.LatLngBounds()
      for (const s of geoStops) bounds.extend({ lat: s.latitude, lng: s.longitude })
      if (depot) bounds.extend({ lat: depot.latitude, lng: depot.longitude })
      map.fitBounds(bounds, 50)
    },
    [geoStops, depot],
  )

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map
      fit(map)
    },
    [fit],
  )

  useEffect(() => {
    if (mapRef.current) fit(mapRef.current)
  }, [fit])

  if (!isLoaded) {
    return (
      <div className="h-full min-h-[400px] bg-gray-100 flex items-center justify-center text-gray-400">
        Chargement carte...
      </div>
    )
  }

  // Tracé reliant les points dans l'ordre (dépôt → arrêt 1 → ... → arrêt N)
  const path: google.maps.LatLngLiteral[] = []
  if (depot) path.push({ lat: depot.latitude, lng: depot.longitude })
  for (const s of geoStops) path.push({ lat: s.latitude, lng: s.longitude })

  const center = path.length > 0 ? path[0] : { lat: 48.8566, lng: 2.3522 }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER}
      center={center}
      zoom={11}
      options={{ disableDefaultUI: true, zoomControl: true }}
      onLoad={onMapLoad}
    >
      {path.length > 1 && (
        <Polyline
          path={path}
          options={{
            strokeColor: '#2563eb',
            strokeOpacity: 0.85,
            strokeWeight: 3,
            geodesic: true,
            icons: [
              {
                icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5 },
                offset: '0',
                repeat: '90px',
              },
            ],
          }}
        />
      )}

      {depot && (
        <Marker
          position={{ lat: depot.latitude, lng: depot.longitude }}
          icon={{
            path: PIN_PATH,
            fillColor: '#000000',
            fillOpacity: 0.85,
            strokeWeight: 2,
            strokeColor: '#fff',
            scale: 1.8,
            anchor: new google.maps.Point(12, 22),
            labelOrigin: new google.maps.Point(12, 9),
          }}
          label={{ text: 'D', color: 'white', fontWeight: 'bold', fontSize: '12px' }}
          title={`Départ : ${depot.nom}`}
        />
      )}

      {geoStops.map((s) => (
        <Marker
          key={s.position}
          position={{ lat: s.latitude, lng: s.longitude }}
          label={{ text: `${s.position}`, color: 'white', fontWeight: 'bold', fontSize: '11px' }}
          icon={{
            path: PIN_PATH,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeWeight: 1,
            strokeColor: '#fff',
            scale: 1.5,
            anchor: new google.maps.Point(12, 22),
            labelOrigin: new google.maps.Point(12, 9),
          }}
          title={`${s.position}. ${s.nom}`}
        />
      ))}
    </GoogleMap>
  )
}
