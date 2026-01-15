'use client'

import { useCallback, useState } from 'react'
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api'
import { Loader2, MapPin } from 'lucide-react'

interface MiniMapProps {
  clientLat: number
  clientLng: number
  clientName: string
  depotLat?: number
  depotLng?: number
  depotName?: string
  depotType?: 'logistique' | 'retrait'
  distanceKm?: number
  height?: string
}

const COLORS = {
  client: '#3B82F6', // Bleu
  depotLogistique: '#F5D100', // Jaune ECO-VOLT
  depotRetrait: '#4CAF50', // Vert
  line: '#6B7280', // Gris
}

export function MiniMap({
  clientLat,
  clientLng,
  clientName,
  depotLat,
  depotLng,
  depotName,
  depotType = 'logistique',
  distanceKm,
  height = '200px',
}: MiniMapProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null)

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  })

  // Adapter le zoom pour inclure client et dépôt
  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance)

    if (depotLat && depotLng) {
      // Créer les bounds pour inclure les deux points
      const bounds = new google.maps.LatLngBounds()
      bounds.extend({ lat: clientLat, lng: clientLng })
      bounds.extend({ lat: depotLat, lng: depotLng })

      // Adapter la vue avec un padding
      mapInstance.fitBounds(bounds, {
        top: 40,
        bottom: 40,
        left: 40,
        right: 40,
      })
    } else {
      // Centrer sur le client uniquement
      mapInstance.setCenter({ lat: clientLat, lng: clientLng })
      mapInstance.setZoom(13)
    }
  }, [clientLat, clientLng, depotLat, depotLng])

  // Centre initial (sera ajusté par fitBounds)
  const initialCenter = { lat: clientLat, lng: clientLng }

  if (loadError) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-muted/50 rounded-lg border"
        style={{ height }}
      >
        <MapPin className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Carte non disponible</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div
        className="flex items-center justify-center bg-muted/50 rounded-lg border"
        style={{ height }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const depotColor = depotType === 'logistique' ? COLORS.depotLogistique : COLORS.depotRetrait

  return (
    <div className="relative rounded-lg overflow-hidden border" style={{ height }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={initialCenter}
        zoom={13}
        onLoad={onMapLoad}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }],
            },
          ],
        }}
      >
        {/* Marqueur Client */}
        <Marker
          position={{ lat: clientLat, lng: clientLng }}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: COLORS.client,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          }}
          title={clientName}
        />

        {/* Marqueur Dépôt */}
        {depotLat && depotLng && (
          <Marker
            position={{ lat: depotLat, lng: depotLng }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: depotColor,
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 3,
            }}
            title={depotName}
          />
        )}

        {/* Ligne entre client et dépôt */}
        {depotLat && depotLng && (
          <Polyline
            path={[
              { lat: clientLat, lng: clientLng },
              { lat: depotLat, lng: depotLng },
            ]}
            options={{
              strokeColor: COLORS.line,
              strokeOpacity: 0.8,
              strokeWeight: 2,
              geodesic: true,
              icons: [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 1,
                    scale: 3,
                  },
                  offset: '0',
                  repeat: '15px',
                },
              ],
            }}
          />
        )}
      </GoogleMap>

      {/* Légende */}
      <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm rounded px-2 py-1 text-xs space-y-1">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.client }} />
          <span>Client</span>
        </div>
        {depotName && (
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: depotColor }} />
            <span>{depotName}</span>
          </div>
        )}
      </div>

      {/* Distance */}
      {distanceKm !== undefined && (
        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded px-2 py-1 text-xs font-medium">
          {distanceKm.toFixed(1)} km
        </div>
      )}
    </div>
  )
}
