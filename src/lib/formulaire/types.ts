import { Depot } from '@/lib/types/database'

// Étapes: 1=ENEMAT, 2=Infos, 3=Adresse, 4=Document, 5=Password, 6=Confirmation
export type FormulaireStep = 1 | 2 | 3 | 4 | 5 | 6

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
  // Mode de livraison déterminé automatiquement par l'API
  modeLivraison?: 'domicile' | 'retrait'
  depotRetrait?: Depot  // Dépôt assigné si mode retrait
  depotLogistique?: Depot  // Dépôt logistique si mode domicile

  // Étape 4 - Document identité
  documentIdentite?: {
    type: string
    url: string
    nomFichier: string
  }

  // Étape 5 - Création mot de passe compte client
  password?: string

  // Étape 6 - Confirmation
  accepteCGV?: boolean
  acceptePolitique?: boolean
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
  3: 'Adresse de livraison',
  4: 'Document d\'identité',
  5: 'Créer votre compte',
  6: 'Confirmation',
}
