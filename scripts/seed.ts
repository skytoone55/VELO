import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// Charger les variables d'environnement
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function seed() {
  console.log('🌱 Début du seeding...\n')

  // 1. Créer des dépôts
  console.log('📦 Création des dépôts...')
  const depots = [
    {
      nom: 'Dépôt Saint-Denis Centre',
      type: 'retrait',
      adresse: '15 Rue Maréchal Leclerc',
      code_postal: '97400',
      ville: 'Saint-Denis',
      departement: '974',
      latitude: -20.8789,
      longitude: 55.4481,
      rayon_couverture_km: 25,
      telephone: '0262 12 34 56',
      email: 'stdenis@eco-volt.re',
      actif: true,
    },
    {
      nom: 'Dépôt Saint-Pierre',
      type: 'retrait',
      adresse: '42 Boulevard Hubert Delisle',
      code_postal: '97410',
      ville: 'Saint-Pierre',
      departement: '974',
      latitude: -21.3393,
      longitude: 55.4781,
      rayon_couverture_km: 30,
      telephone: '0262 23 45 67',
      email: 'stpierre@eco-volt.re',
      actif: true,
    },
    {
      nom: 'Entrepôt Logistique Port',
      type: 'logistique',
      adresse: 'Zone Portuaire Est',
      code_postal: '97420',
      ville: 'Le Port',
      departement: '974',
      latitude: -20.9408,
      longitude: 55.2906,
      rayon_couverture_km: 50,
      telephone: '0262 34 56 78',
      email: 'logistique@eco-volt.re',
      actif: true,
    },
    {
      nom: 'Point Relais Fort-de-France',
      type: 'retrait',
      adresse: '8 Rue Victor Hugo',
      code_postal: '97200',
      ville: 'Fort-de-France',
      departement: '972',
      latitude: 14.6037,
      longitude: -61.0588,
      rayon_couverture_km: 20,
      telephone: '0596 12 34 56',
      email: 'fdf@eco-volt.mq',
      actif: true,
    },
    {
      nom: 'Dépôt Pointe-à-Pitre',
      type: 'retrait',
      adresse: '25 Rue Achille René Boisneuf',
      code_postal: '97110',
      ville: 'Pointe-à-Pitre',
      departement: '971',
      latitude: 16.2411,
      longitude: -61.5331,
      rayon_couverture_km: 25,
      telephone: '0590 12 34 56',
      email: 'pap@eco-volt.gp',
      actif: true,
    },
  ]

  // Supprimer les dépôts existants puis insérer
  await supabase.from('depots').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { data: depotsData, error: depotsError } = await supabase
    .from('depots')
    .insert(depots)
    .select()

  if (depotsError) {
    console.error('❌ Erreur création dépôts:', depotsError.message)
  } else {
    console.log(`✅ ${depotsData?.length || 0} dépôts créés`)
  }

  // 2. Créer des clients de test
  console.log('\n👥 Création des clients de test...')
  const clients = [
    {
      raison_sociale: 'SARL Transport Express',
      siret: '12345678901234',
      email: 'contact@transport-express.re',
      telephone: '0692 12 34 56',
      departement: '974',
      adresse_societe_ligne1: '10 Rue du Commerce',
      adresse_societe_cp: '97400',
      adresse_societe_ville: 'Saint-Denis',
      statut_formulaire: 'en_attente',
      velo_devis: 3,
      velo_valide: 0,
    },
    {
      raison_sociale: 'SAS Livraison Rapide',
      siret: '98765432109876',
      email: 'info@livraison-rapide.re',
      telephone: '0693 23 45 67',
      departement: '974',
      adresse_societe_ligne1: '5 Avenue de la Victoire',
      adresse_societe_cp: '97410',
      adresse_societe_ville: 'Saint-Pierre',
      statut_formulaire: 'formulaire_envoye',
      velo_devis: 5,
      velo_valide: 0,
      token_formulaire: 'test-token-12345',
      date_envoi_formulaire: new Date().toISOString(),
    },
    {
      raison_sociale: 'EURL Coursier Martinique',
      siret: '11223344556677',
      email: 'coursier@martinique.mq',
      telephone: '0696 34 56 78',
      departement: '972',
      adresse_societe_ligne1: '22 Rue Schoelcher',
      adresse_societe_cp: '97200',
      adresse_societe_ville: 'Fort-de-France',
      statut_formulaire: 'formulaire_complete',
      velo_devis: 2,
      velo_valide: 2,
    },
    {
      raison_sociale: 'SNC Distribution Guadeloupe',
      siret: '99887766554433',
      email: 'distribution@guadeloupe.gp',
      telephone: '0690 45 67 89',
      departement: '971',
      adresse_societe_ligne1: '18 Boulevard Légitimus',
      adresse_societe_cp: '97110',
      adresse_societe_ville: 'Pointe-à-Pitre',
      statut_formulaire: 'en_attente',
      velo_devis: 4,
      velo_valide: 0,
    },
  ]

  // Supprimer les clients existants puis insérer
  await supabase.from('livraisons').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { data: clientsData, error: clientsError } = await supabase
    .from('clients')
    .insert(clients)
    .select()

  if (clientsError) {
    console.error('❌ Erreur création clients:', clientsError.message)
  } else {
    console.log(`✅ ${clientsData?.length || 0} clients créés`)
  }

  // 3. Créer une livraison de test
  if (clientsData && clientsData.length > 0) {
    console.log('\n🚚 Création des livraisons de test...')

    const livraisons = [
      {
        client_id: clientsData[2].id, // Client Martinique (formulaire_complete)
        mode_livraison: 'domicile',
        adresse_livraison_ligne1: '22 Rue Schoelcher',
        adresse_livraison_cp: '97200',
        adresse_livraison_ville: 'Fort-de-France',
        statut: 'en_attente',
        document_identite_type: 'cni',
      },
    ]

    const { data: livraisonsData, error: livraisonsError } = await supabase
      .from('livraisons')
      .insert(livraisons)
      .select()

    if (livraisonsError) {
      console.error('❌ Erreur création livraisons:', livraisonsError.message)
    } else {
      console.log(`✅ ${livraisonsData?.length || 0} livraisons créées`)
    }
  }

  // 4. Créer des codes ENEMAT valides
  console.log('\n🔑 Création des codes ENEMAT...')
  const codesEnemat = [
    { code: 'ENEMAT-2024-001', utilise: true },
    { code: 'ENEMAT-2024-002', utilise: true },
    { code: 'ENEMAT-2024-003', utilise: true },
    { code: 'ENEMAT-2024-004', utilise: true },
    { code: 'ENEMAT-2024-005', utilise: false },
    { code: 'ENEMAT-2024-006', utilise: false },
    { code: 'ENEMAT-2024-007', utilise: false },
    { code: 'ENEMAT-TEST-999', utilise: false }, // Code de test
  ]

  // Supprimer puis insérer
  await supabase.from('codes_enemat').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { data: codesData, error: codesError } = await supabase
    .from('codes_enemat')
    .insert(codesEnemat)
    .select()

  if (codesError) {
    console.error('❌ Erreur création codes ENEMAT:', codesError.message)
  } else {
    console.log(`✅ ${codesData?.length || 0} codes ENEMAT créés`)
  }

  console.log('\n✨ Seeding terminé!')
  console.log('\n📋 Résumé:')
  console.log('   - Dépôts: 5 (3 Réunion, 1 Martinique, 1 Guadeloupe)')
  console.log('   - Clients: 4 (différents statuts)')
  console.log('   - Codes ENEMAT: 8 (dont ENEMAT-TEST-999 pour tester)')
  console.log('\n🔐 Pour tester le formulaire:')
  console.log('   URL: /formulaire?token=test-token-12345')
  console.log('   Code ENEMAT: ENEMAT-2024-002')
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erreur fatale:', err)
    process.exit(1)
  })
