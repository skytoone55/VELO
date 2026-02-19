/**
 * Définition des champs de l'interface Supabase qui peuvent être mappés vers Monday
 * Séparé du fichier route.ts pour permettre l'import ailleurs
 */

export interface InterfaceField {
  field: string
  label: string
  type: string
  section: string
  required?: boolean
}

// Tous les champs de la table clients qui peuvent être mappés vers Monday
// Les champs système (id, created_at, etc.) ne sont PAS inclus
export const INTERFACE_FIELDS: InterfaceField[] = [
  // Identification
  { field: 'raison_sociale', label: 'Raison sociale', type: 'text', section: 'identification', required: true },
  { field: 'siret', label: 'SIRET', type: 'text', section: 'identification', required: true },
  { field: 'reference_dossier', label: 'Code Retina / Réf dossier', type: 'text', section: 'identification' },
  { field: 'numero_devis', label: 'Numéro de devis', type: 'text', section: 'identification' },
  { field: 'numero_facture', label: 'Numéro de facture', type: 'text', section: 'identification' },
  { field: 'agence', label: 'Agence', type: 'text', section: 'identification' },

  // Contact
  { field: 'email', label: 'Email agent/commercial', type: 'email', section: 'contact' },
  { field: 'email_beneficiaire', label: 'Email client (pour envoi code/formulaire)', type: 'email', section: 'contact', required: true },
  { field: 'telephone', label: 'Téléphone', type: 'phone', section: 'contact' },
  { field: 'contact_nom', label: 'Nom du contact (signataire)', type: 'text', section: 'contact' },
  { field: 'contact_prenom', label: 'Prénom du contact (signataire)', type: 'text', section: 'contact' },
  { field: 'contact_fonction', label: 'Fonction du contact', type: 'text', section: 'contact' },

  // Adresse siège
  { field: 'adresse_societe_ligne1', label: 'Adresse siège (ligne 1)', type: 'text', section: 'adresse_siege' },
  { field: 'adresse_societe_ligne2', label: 'Adresse siège (ligne 2)', type: 'text', section: 'adresse_siege' },
  { field: 'adresse_societe_cp', label: 'Code postal siège', type: 'text', section: 'adresse_siege' },
  { field: 'adresse_societe_ville', label: 'Ville siège', type: 'text', section: 'adresse_siege' },

  // Adresse livraison
  { field: 'adresse_livraison_ligne1', label: 'Adresse livraison (ligne 1)', type: 'text', section: 'adresse_livraison' },
  { field: 'adresse_livraison_ligne2', label: 'Adresse livraison (ligne 2)', type: 'text', section: 'adresse_livraison' },
  { field: 'adresse_livraison_cp', label: 'CP livraison', type: 'text', section: 'adresse_livraison' },
  { field: 'adresse_livraison_ville', label: 'Ville livraison', type: 'text', section: 'adresse_livraison' },

  // Livraison
  { field: 'type_livraison', label: 'Type de livraison', type: 'status', section: 'livraison' },

  // Informations entreprise
  { field: 'format_juridique', label: 'Format juridique', type: 'text', section: 'entreprise' },
  { field: 'code_ape', label: 'Code APE/NAF', type: 'text', section: 'entreprise' },
  { field: 'nb_salaries', label: 'Nombre de salariés', type: 'number', section: 'entreprise' },
  { field: 'departement', label: 'Département', type: 'status', section: 'entreprise' },

  // Vélos & Devis
  { field: 'velo_devis', label: 'Nombre vélos devis', type: 'number', section: 'velos' },
  { field: 'velo_valide', label: 'Nombre vélos validés', type: 'number', section: 'velos' },
  { field: 'devis_pdf_url', label: 'URL devis PDF', type: 'link', section: 'velos' },
  { field: 'date_signature_devis', label: 'Date signature devis', type: 'date', section: 'velos' },
  { field: 'date_visite_prealable', label: 'Date visite préalable', type: 'date', section: 'velos' },

  // Statuts
  { field: 'statut_commercial', label: 'Statut commercial', type: 'status', section: 'statuts' },
  { field: 'statut_retina', label: 'Statut Retina', type: 'status', section: 'statuts' },
  { field: 'statut_mail', label: 'Statut mail', type: 'status', section: 'statuts' },
  { field: 'statut_anomalie', label: 'Statut anomalie', type: 'status', section: 'statuts' },
  { field: 'statut_make', label: 'Statut Make', type: 'status', section: 'statuts' },
  { field: 'statut_doublon', label: 'Statut doublon', type: 'status', section: 'statuts' },
  { field: 'date_statut', label: 'Date statut', type: 'date', section: 'statuts' },

  // Assignation
  { field: 'commercial_assigne', label: 'Commercial assigné', type: 'people', section: 'assignation' },
  { field: 'equipe_ids', label: 'Équipe', type: 'people', section: 'assignation' },

  // Notes
  { field: 'notes_internes', label: 'Notes internes', type: 'long_text', section: 'notes' },

  // Code ENEMAT (validation client)
  { field: 'code_enemat_saisi', label: 'Code ENEMAT saisi', type: 'text', section: 'validation' },
  { field: 'code_enemat_valide', label: 'Code ENEMAT validé', type: 'checkbox', section: 'validation' },
  { field: 'date_validation_code', label: 'Date validation code', type: 'date', section: 'validation' },
]

export const INTERFACE_SECTIONS = [
  { id: 'identification', label: 'Identification' },
  { id: 'contact', label: 'Contact' },
  { id: 'adresse_siege', label: 'Adresse siège' },
  { id: 'adresse_livraison', label: 'Adresse livraison' },
  { id: 'livraison', label: 'Livraison' },
  { id: 'entreprise', label: 'Informations entreprise' },
  { id: 'velos', label: 'Vélos & Devis' },
  { id: 'statuts', label: 'Statuts' },
  { id: 'assignation', label: 'Assignation' },
  { id: 'notes', label: 'Notes' },
  { id: 'validation', label: 'Validation client' },
]
