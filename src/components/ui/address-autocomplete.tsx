'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Loader2, MapPin, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddressSuggestion {
  label: string
  housenumber?: string
  street?: string
  postcode: string
  city: string
  context: string
  lat: number
  lon: number
}

interface AddressAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (address: {
    ligne1: string
    codePostal: string
    ville: string
    latitude: number
    longitude: number
  }) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Commencez à taper une adresse...",
  className,
  disabled = false,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [hasUserTyped, setHasUserTyped] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Recherche d'adresses avec l'API gouvernementale
  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`
      )

      if (!response.ok) throw new Error('Erreur API')

      const data = await response.json()

      const results: AddressSuggestion[] = data.features.map((feature: any) => ({
        label: feature.properties.label,
        housenumber: feature.properties.housenumber,
        street: feature.properties.street,
        postcode: feature.properties.postcode,
        city: feature.properties.city,
        context: feature.properties.context,
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
      }))

      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    } catch (error) {
      console.error('Erreur recherche adresse:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  // Debounce de la recherche - seulement si l'utilisateur a tapé
  useEffect(() => {
    // Ne pas rechercher si l'utilisateur n'a pas encore interagi avec le champ
    if (!hasUserTyped) return

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      searchAddress(value)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [value, hasUserTyped])

  // Fermer les suggestions quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Gestion du clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedIndex])
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        break
    }
  }

  // Sélection d'une suggestion
  const selectSuggestion = (suggestion: AddressSuggestion) => {
    const ligne1 = suggestion.housenumber
      ? `${suggestion.housenumber} ${suggestion.street}`
      : suggestion.street || suggestion.label.split(',')[0]

    onChange(ligne1)
    setShowSuggestions(false)
    setSelectedIndex(-1)

    if (onSelect) {
      onSelect({
        ligne1,
        codePostal: suggestion.postcode,
        ville: suggestion.city,
        latitude: suggestion.lat,
        longitude: suggestion.lon,
      })
    }
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setHasUserTyped(true)
            onChange(e.target.value)
          }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <MapPin className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className={cn(
                "px-3 py-2 cursor-pointer flex items-start gap-2 text-sm",
                "hover:bg-muted transition-colors",
                selectedIndex === index && "bg-muted"
              )}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{suggestion.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {suggestion.context}
                </div>
              </div>
              {selectedIndex === index && (
                <Check className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
