// Configuration centralisée Google Maps — UN SEUL point de chargement
// Évite le conflit "Loader must not be called again with different options"

export const GOOGLE_MAPS_LIBRARIES: ('places')[] = ['places']

export const GOOGLE_MAPS_OPTIONS = {
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  libraries: GOOGLE_MAPS_LIBRARIES,
} as const
