import { Depot } from '@/lib/types/database'

// Étapes: 1=ENEMAT, 2=Infos, 3=Adresse, 4=Préférence retrait/livraison, 5=Confirmation
export type FormulaireStep = 1 | 2 | 3 | 4 | 5

export interface FormulaireData {
  // Étape 1 - Code ENEMAT
  codeEnemat?: string
  codeValide?: boolean

  // Étape 2 - Infos société (pré-remplies)
  raisonSociale?: string
  siret?: string
  email?: string
  telephone?: string
  contactNom?: string
  contactPrenom?: string

  // Étape 3 - Adresse livraison + mode (automatique)
  adresseLivraison?: {
    ligne1: string
    ligne2?: string
    codePostal: string
    ville: string
  }
  // Mode de livraison déterminé automatiquement par l'API à l'étape 3
  modeLivraison?: 'domicile' | 'retrait'
  // Zone de livraison: gratuite, payante, ou hors_zone
  zoneLivraison?: 'gratuite' | 'payante' | 'hors_zone'
  // Type du dépôt le plus proche
  depotType?: 'retrait' | 'logistique'
  depotRetrait?: Depot & { distance?: number }  // Dépôt assigné si mode retrait
  depotLogistique?: Depot & { distance?: number }  // Dépôt logistique si mode domicile
  // Prix de la livraison payante (si applicable)
  prixLivraisonPayante?: number

  // Étape 4 - Préférence retrait / livraison
  preferenceMode?: 'retrait' | 'livraison_gratuite' | 'livraison_payante'
  modeLivraisonFinal?: 'domicile' | 'retrait'
  livraisonPayante?: boolean

  // Étape 5 - Confirmation
  accepteCGV?: boolean
  acceptePolitique?: boolean

  // === ARCHIVÉ (anciennes étapes 4 et 5) ===
  // Document identité (archivé)
  documentIdentite?: {
    type: string
    url: string
    nomFichier: string
  }
  // Création mot de passe compte client (archivé)
  password?: string
}

export interface FormulaireContext {
  clientId: string
  veloDevis: number
  departement: string
  currentStep: FormulaireStep
  data: FormulaireData
  isHorsZone: boolean
  depotsDisponibles: Depot[]
}

export const STEP_NAMES: Record<FormulaireStep, string> = {
  1: 'Code ENEMAT',
  2: 'Vos informations',
  3: 'Adresse livraison',
  4: 'Mode de réception',
  5: 'Confirmation',
}
