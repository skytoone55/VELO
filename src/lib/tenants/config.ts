/**
 * Configuration Multi-Tenant
 *
 * Ce fichier contient les configurations spécifiques à chaque entreprise.
 * Le tenant actif est déterminé par la variable d'environnement NEXT_PUBLIC_TENANT_ID
 */

export type TenantId = 'ecovolt' | 'ppe'

export interface TenantConfig {
  id: TenantId

  // Informations entreprise
  name: string
  fullName: string
  tagline: string

  // Contact
  email: string
  phone: string
  phoneFormatted: string

  // Adresse
  address: {
    street: string
    postalCode: string
    city: string
    full: string
  }

  // Informations légales
  legal: {
    forme: string
    capital: string
    rcs: string
    tva: string
    ape: string
    siret: string
  }

  // Branding
  branding: {
    logo: string
    logoAlt: string
    favicon: string
    colors: {
      primary: string
      primaryLight: string
      secondary: string
      secondaryDark: string
    }
    emailEmoji: string
    appleIcon: string
    ogImage: string
  }

  // Métadonnées SEO
  metadata: {
    title: string
    description: string
  }

  // Territoires disponibles pour ce tenant
  territories: string[]

  // URL de l'autre tenant (pour le switch super_admin)
  url: string

  // URL du module de retrait externe (ecovolt uniquement)
  externalRetraitUrl?: string

  // Email alerte contrôle qualité (si non pris dans les 5 min)
  emailAlerteCQ?: string

  // Textes personnalisés
  texts: {
    welcomeMessage: string
    copyright: string
  }
}

// Configuration ECO-VOLT
const ecovoltConfig: TenantConfig = {
  id: 'ecovolt',

  name: 'ECO-VOLT',
  fullName: 'ECO-VOLT',
  tagline: 'Vélos cargo à assistance électrique VAS',

  territories: ['971', '972', '973', '974'],
  url: 'https://velo-fawn.vercel.app',
  externalRetraitUrl: process.env.NEXT_PUBLIC_ECOVOLT_RETRAIT_URL || 'https://ecovolt-retrait.vercel.app',

  email: 'admin@eco-volt.fr',
  phone: '0757991125',
  phoneFormatted: '07 57 99 11 25',

  address: {
    street: '',
    postalCode: '',
    city: '',
    full: '',
  },

  legal: {
    forme: '',
    capital: '',
    rcs: '',
    tva: '',
    ape: '',
    siret: '',
  },

  branding: {
    logo: '/logos/ecovolt.png',
    logoAlt: 'ECO-VOLT Logo',
    favicon: '/favicon.ico',
    colors: {
      primary: '#F5D100',      // Jaune ECO-VOLT
      primaryLight: '#FFF176',
      secondary: '#4CAF50',    // Vert
      secondaryDark: '#2E7D32',
    },
    emailEmoji: '⚡',
    appleIcon: '/icons/ecovolt-apple-icon.png',
    ogImage: '/icons/ecovolt-og.png',
  },

  metadata: {
    title: 'ECO-VOLT | Livraison vélos cargo électriques',
    description: 'Plateforme de gestion des livraisons de vélos cargo électriques dans les DOM-TOM',
  },

  texts: {
    welcomeMessage: 'Bienvenue chez ECO-VOLT !',
    copyright: `© ${new Date().getFullYear()} ECO-VOLT - Tous droits réservés`,
  },
}

// Configuration PPE Énergie
const ppeConfig: TenantConfig = {
  id: 'ppe',

  name: 'PPE Énergie',
  fullName: 'PRESERVATION DU PATRIMOINE ENERGIE (PPE)',
  tagline: 'Vélos cargo à assistance électrique VAS',

  territories: ['FR'],
  url: 'https://velo-ppe.vercel.app',
  emailAlerteCQ: 'charlotte.pochet@patrimoine-energie.fr',

  email: 'velo-cargo@patrimoine-energie.fr',
  phone: '0974161400',
  phoneFormatted: '09 74 16 14 00',

  address: {
    street: '99 RUE DU MOULIN DES LANDES',
    postalCode: '44980',
    city: 'SAINTE-LUCE-SUR-LOIRE',
    full: '99 RUE DU MOULIN DES LANDES, 44980 SAINTE-LUCE-SUR-LOIRE',
  },

  legal: {
    forme: 'SAS, société par actions simplifiée',
    capital: '100 000 €',
    rcs: 'Nantes 844518951000018',
    tva: 'FR91844518951',
    ape: '4321A',
    siret: '84451895100018',
  },

  branding: {
    logo: '/logos/ppe.png',
    logoAlt: 'PPE Énergie Logo',
    favicon: '/favicon-ppe.ico',
    colors: {
      primary: '#7CB342',      // Vert PPE (couleur principale du logo)
      primaryLight: '#9CCC65',
      secondary: '#1a1a1a',    // Noir (couleur secondaire)
      secondaryDark: '#000000',
    },
    emailEmoji: '🚲',
    appleIcon: '/icons/ppe-apple-icon.png',
    ogImage: '/icons/ppe-og.png',
  },

  metadata: {
    title: 'PPE Énergie | Livraison vélos cargo électriques',
    description: 'Plateforme de gestion des livraisons de vélos cargo électriques',
  },

  texts: {
    welcomeMessage: 'Bienvenue chez PPE Énergie !',
    copyright: `© ${new Date().getFullYear()} PPE Énergie - Tous droits réservés`,
  },
}

// Mapping des tenants
export const TENANTS: Record<TenantId, TenantConfig> = {
  ecovolt: ecovoltConfig,
  ppe: ppeConfig,
}

// Tenant par défaut
export const DEFAULT_TENANT: TenantId = 'ecovolt'
