// Monday.com API Configuration
// Note: These values would come from environment variables in production

export const MONDAY_CONFIG = {
  // API endpoint
  apiUrl: 'https://api.monday.com/v2',

  // Board IDs (to be configured per deployment)
  boardIds: {
    clients: process.env.NEXT_PUBLIC_MONDAY_CLIENTS_BOARD_ID || '',
    livraisons: process.env.NEXT_PUBLIC_MONDAY_LIVRAISONS_BOARD_ID || '',
  },

  // Field mappings: Supabase column -> Monday column_id
  clientFieldMappings: {
    raison_sociale: 'name', // Monday item name
    siret: 'text0',
    email: 'email',
    telephone: 'phone',
    departement: 'dropdown',
    statut_formulaire: 'status',
    velo_devis: 'numbers',
    velo_valide: 'numbers1',
    date_signature_devis: 'date',
  },

  // Status mappings: Supabase value -> Monday label
  statutMappings: {
    en_attente: 'En attente',
    formulaire_envoye: 'Formulaire envoye',
    formulaire_complete: 'Formulaire complete',
    valide: 'Valide',
  },

  // Sync settings
  syncInterval: 5 * 60 * 1000, // 5 minutes in ms
  maxRetries: 3,
  retryDelay: 1000,
}

// Check if Monday is configured
export function isMondayConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_MONDAY_API_KEY &&
    MONDAY_CONFIG.boardIds.clients
  )
}

// Get Monday API key (server-side only)
export function getMondayApiKey(): string | undefined {
  return process.env.MONDAY_API_KEY
}
