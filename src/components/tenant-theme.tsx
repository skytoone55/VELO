'use client'

import { useEffect } from 'react'
import { getTenantConfig } from '@/lib/tenants'

/**
 * Composant qui injecte les couleurs du tenant dans les CSS variables
 * À placer dans le layout principal
 */
export function TenantTheme() {
  const tenant = getTenantConfig()

  useEffect(() => {
    const root = document.documentElement
    const colors = tenant.branding.colors

    // Injecter les couleurs du tenant dans les CSS variables
    root.style.setProperty('--primary', colors.primary)
    root.style.setProperty('--ring', colors.primary)
    root.style.setProperty('--sidebar-primary', colors.primary)
    root.style.setProperty('--sidebar-ring', colors.primary)
    root.style.setProperty('--chart-1', colors.primary)

    root.style.setProperty('--secondary', colors.secondary)
    root.style.setProperty('--accent', colors.secondary)
    root.style.setProperty('--chart-2', colors.secondary)

    // Pour le texte sur primary, déterminer si clair ou foncé
    // Si la couleur primaire est sombre, utiliser du texte clair
    const primaryForeground = isColorDark(colors.primary) ? '#ffffff' : '#0a0a0a'
    root.style.setProperty('--primary-foreground', primaryForeground)
    root.style.setProperty('--sidebar-primary-foreground', primaryForeground)

  }, [tenant])

  return null
}

/**
 * Détermine si une couleur hex est sombre
 */
function isColorDark(hexColor: string): boolean {
  // Enlever le # si présent
  const hex = hexColor.replace('#', '')

  // Convertir en RGB
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // Calculer la luminosité (formule standard)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  return luminance < 0.5
}
