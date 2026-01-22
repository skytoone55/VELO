// Monday.com API Configuration
// IMPORTANT: Monday.com est la SOURCE DE VÉRITÉ (SSOT)
// Les données sont créées/modifiées dans Monday et synchronisées vers Supabase
//
// Board: Vélos Cargos - Général (ID: 9990833105)
// Documentation: /monday_velos_cargos_schema.md

export const MONDAY_CONFIG = {
  // API endpoint
  apiUrl: 'https://api.monday.com/v2',

  // Board IDs
  boardIds: {
    clients: process.env.MONDAY_BOARD_ID || '9990833105',
    subitems: '10082173584',
  },

  // Workspace
  workspaceId: '12213672',

  // Webhook URL (à configurer dans Monday.com)
  webhookUrl: process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/monday`
    : '/api/webhooks/monday',

  // =================================================================
  // MAPPING COMPLET: Monday column_id -> Supabase column
  // Direction: MONDAY → SUPABASE (Monday est la source de vérité)
  // =================================================================
  mondayToSupabaseMapping: {
    // --- Identification ---
    'name': 'raison_sociale',                        // Nom de l'entreprise (RAISON SOCIALE)
    'text_mkvfykn9': 'siret',                        // SIRET_RETINA
    'text_mkvfxbkp': 'reference_dossier',            // refinternedeloperation_RETINA (Code Retina)
    'pulse_id_mkvc9y13': 'monday_item_id',           // Identifiant Monday

    // --- Contact & Communication ---
    'email_mkvfk63f': 'email',                       // EmailAgent_RETINA (email principal)
    'email_mkvfnv4q': 'email_beneficiaire',          // emailbeneficiaire_RETINA
    'long_text_mkvn5k9w': 'telephone',               // Telephonebeneficiaire_RETINA
    'text_mkvfkr8t': 'contact_nom',                  // Nomsignataire_RETINA
    'text_mkvfjqvv': 'contact_prenom',               // Prénomsignataire_RETINA

    // --- Adresse opération (siège) ---
    'text_mkvfetg2': 'adresse_societe_ligne1',       // adresseopération_RETINA
    'text_mkvfhcn9': 'adresse_societe_cp',           // CPoperation_RETINA
    'text_mkvfgh8t': 'adresse_societe_ville',        // Villeopération_RETINA

    // --- Informations entreprise ---
    'text_mkvtxy4q': 'format_juridique',             // format juridique
    'text_mkvft2w3': 'code_ape',                     // APE/NAF_RETINA
    'numeric_mkvcqwxn': 'nb_salaries',               // Nb Salarié URSSAF
    'color_mkvdkzxh': 'departement',                 // Département (status)

    // --- Vélos & Devis ---
    'numeric_mkvfghjq': 'velo_devis',                // vélo devis
    'numeric_mkvcqm0r': 'velo_valide',               // Vélo confirmé
    'text_mkvf8zp6': 'numero_devis',                 // Numerodevis_RETINA
    'text_mkvfqsxv': 'devis_pdf_url',                // devissignépdf_RETINA

    // --- Dates ---
    'date_mkvfqvv1': 'date_signature_devis',         // Dateengagementdevis_RETINA
    'date_mkvsxn5j': 'date_statut',                  // DATE STATUT

    // --- Code ENEMAT (code de livraison client) ---
    'text_mkzvqk4s': 'code_enemat_saisi',           // Code ENEMAT saisi par le client

    // --- Statuts (le principal est statut_commercial) ---
    'color_mkvfws5n': 'statut_commercial',           // Statut commercial (PRINCIPAL)
    'color_mkvgsswc': 'statut_retina',               // StatutRETINA
    'color_mkyqn153': 'statut_mail',                 // statut mail
    'color_mkvp4dmz': 'statut_anomalie',             // StatutAnomalie
    'color_mkvdek2g': 'statut_make',                 // Statut Make
    'color_mkvn1kg0': 'statut_doublon',              // doublon_RETINA

    // --- Assignation ---
    'multiple_person_mkvd4axb': 'commercial_assigne', // Commercial attribué (people)
    'multiple_person_mkve97pm': 'equipe_ids',         // Équipe (people)
  },

  // =================================================================
  // MAPPING INVERSE: Supabase column -> Monday column_id
  // Pour les mises à jour Supabase → Monday (si besoin)
  // =================================================================
  supabaseToMondayMapping: {
    // Identification
    raison_sociale: 'name',
    siret: 'text_mkvfykn9',
    reference_dossier: 'text_mkvfxbkp',

    // Contact
    email: 'email_mkvfk63f',
    email_beneficiaire: 'email_mkvfnv4q',
    telephone: 'long_text_mkvn5k9w',
    contact_nom: 'text_mkvfkr8t',
    contact_prenom: 'text_mkvfjqvv',

    // Adresse
    adresse_societe_ligne1: 'text_mkvfetg2',
    adresse_societe_cp: 'text_mkvfhcn9',
    adresse_societe_ville: 'text_mkvfgh8t',

    // Entreprise
    format_juridique: 'text_mkvtxy4q',
    code_ape: 'text_mkvft2w3',
    nb_salaries: 'numeric_mkvcqwxn',
    departement: 'color_mkvdkzxh',

    // Vélos & Devis
    velo_devis: 'numeric_mkvfghjq',
    velo_valide: 'numeric_mkvcqm0r',
    numero_devis: 'text_mkvf8zp6',
    devis_pdf_url: 'text_mkvfqsxv',

    // Dates
    date_signature_devis: 'date_mkvfqvv1',
    date_statut: 'date_mkvsxn5j',

    // Statuts
    statut_commercial: 'color_mkvfws5n',
    statut_retina: 'color_mkvgsswc',
    statut_mail: 'color_mkyqn153',
    statut_anomalie: 'color_mkvp4dmz',
    statut_make: 'color_mkvdek2g',
    statut_doublon: 'color_mkvn1kg0',

    // Assignation
    commercial_assigne: 'multiple_person_mkvd4axb',
    equipe_ids: 'multiple_person_mkve97pm',

    // Code ENEMAT
    code_enemat_saisi: 'text_mkzvqk4s',
  },

  // =================================================================
  // MAPPING STATUT COMMERCIAL: Monday label -> Supabase value
  // C'est le statut PRINCIPAL (color_mkvfws5n)
  // =================================================================
  mondayToSupabaseStatutCommercial: {
    'DOSSIER COMPLET': 'dossier_complet',
    'DEVIS SIGNÉ': 'devis_signe',
    'CLIENT HS': 'client_hs',
    'DEVIS CREE': 'devis_cree',
    'CONTROLE VALIDÉ': 'controle_valide',
    'Inconnu': 'inconnu',
    'CLIENT INJOIGNABLE': 'client_injoignable',
    'DOUBLON': 'doublon',
    'CONTROLE A REGULARISER': 'controle_a_regulariser',
    'AH SIGNÉE': 'ah_signee',
    'LIVRÉ': 'livre',
    'PAYÈ': 'paye',
    'CONTROLE A JOUR': 'controle_a_jour',
    'CLIENT CONTACTÉ': 'client_contacte',
    'FRANCK': 'franck',
  },

  // Mapping inverse statut commercial
  supabaseToMondayStatutCommercial: {
    dossier_complet: 'DOSSIER COMPLET',
    devis_signe: 'DEVIS SIGNÉ',
    client_hs: 'CLIENT HS',
    devis_cree: 'DEVIS CREE',
    controle_valide: 'CONTROLE VALIDÉ',
    inconnu: 'Inconnu',
    client_injoignable: 'CLIENT INJOIGNABLE',
    doublon: 'DOUBLON',
    controle_a_regulariser: 'CONTROLE A REGULARISER',
    ah_signee: 'AH SIGNÉE',
    livre: 'LIVRÉ',
    paye: 'PAYÈ',
    controle_a_jour: 'CONTROLE A JOUR',
    client_contacte: 'CLIENT CONTACTÉ',
    franck: 'FRANCK',
  },

  // =================================================================
  // MAPPING DÉPARTEMENT: Monday label -> Supabase value
  // =================================================================
  mondayToSupabaseDepartement: {
    'Réunion': '974',
    'La Réunion': '974',
    'Martinique': '972',
    'Guadeloupe': '971',
    'Guyane': '973',
    'Mayotte': '976',
    'Hors DOM': 'hors_dom',
  },

  supabaseToMondayDepartement: {
    '974': 'La Réunion',
    '972': 'Martinique',
    '971': 'Guadeloupe',
    '973': 'Guyane',
    '976': 'Mayotte',
    'hors_dom': 'Hors DOM',
  },

  // =================================================================
  // MAPPING STATUT RETINA: Monday label -> Supabase value
  // =================================================================
  mondayToSupabaseStatutRetina: {
    'DEVIS CRÉÉ': 'devis_cree',
    'DEVIS SIGNÉ': 'devis_signe',
    'SUPPRIMÉ': 'supprime',
  },

  // =================================================================
  // MAPPING STATUT MAIL: Monday label -> Supabase value
  // =================================================================
  mondayToSupabaseStatutMail: {
    'mail 2': 'mail_2',
    'Mail FNUCI': 'mail_fnuci',
    'Mail 3': 'mail_3',
  },

  // =================================================================
  // MAPPING STATUT ANOMALIE: Monday label -> Supabase value
  // =================================================================
  mondayToSupabaseStatutAnomalie: {
    'En cours': 'en_cours',
    'Fait': 'fait',
    'Bloqué': 'bloque',
    'bonification soumise au pncee': 'bonification_pncee',
    '#REF!': 'ref_error',
    '#N/A': 'na_error',
    'sans bonification': 'sans_bonification',
    'Supprimé de RETINA': 'supprime_retina',
  },

  // =================================================================
  // MAPPING STATUT DOUBLON: Monday label -> Supabase value
  // =================================================================
  mondayToSupabaseStatutDoublon: {
    'DOUBLON A ETUDIER': 'a_etudier',
    'DOUBLON A SUPPRIMER': 'a_supprimer',
    'OK - AUTRE DOUBLON SUPPRIME': 'ok_autre_supprime',
  },

  // =================================================================
  // GROUPES MONDAY (pour filtrage/organisation)
  // =================================================================
  mondayGroups: {
    'group_mkvn8ehx': 'DEVIS SIGNE',
    'group_mkw98hsb': 'Contrôle à Régulariser',
    'group_mkw9v28s': 'Contrôle à jour',
    'group_mkw9nxnf': 'Dossier complet pour étude',
    'group_mkw9zmr2': 'Contrôle validé par le back office',
  },

  // Groupe par défaut pour les nouveaux items
  defaultGroupId: 'group_mkvn8ehx',

  // =================================================================
  // USERS MONDAY (pour mapping commercial_assigne)
  // =================================================================
  mondayUsers: {
    '67399288': 'Alexandre Delannay',
    '68054448': 'Dove Uzan',
    '72490555': 'Olivier Fontaine',
    '72791840': 'Jonathan Sanchez',
  },

  // Sync settings
  syncInterval: 5 * 60 * 1000, // 5 minutes in ms
  maxRetries: 3,
  retryDelay: 1000,
  batchSize: 100, // Items par batch pour la sync initiale
}

// Check if Monday is configured
export function isMondayConfigured(): boolean {
  return !!(
    process.env.MONDAY_API_KEY &&
    MONDAY_CONFIG.boardIds.clients
  )
}

// Get Monday API key (server-side only)
export function getMondayApiKey(): string | undefined {
  return process.env.MONDAY_API_KEY
}

// Get webhook URL
export function getWebhookUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (baseUrl) {
    return `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/webhooks/monday`
  }
  return '/api/webhooks/monday'
}
