import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createAdmin() {
  const email = 'malai.jonathan@gmail.com'
  const password = '@Crm1532'

  console.log('🔐 Création du compte admin...\n')

  // Créer l'utilisateur dans auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Confirmer l'email automatiquement
  })

  if (authError) {
    console.error('❌ Erreur création auth:', authError.message)
    return
  }

  console.log('✅ Utilisateur auth créé:', authData.user.id)

  // Créer le profil admin
  const { error: profileError } = await supabase
    .from('users_profile')
    .insert({
      id: authData.user.id,
      email,
      nom: 'Malai',
      prenom: 'Jonathan',
      role: 'admin_general',
      actif: true,
    })

  if (profileError) {
    console.error('❌ Erreur création profil:', profileError.message)
    return
  }

  console.log('✅ Profil admin_general créé')
  console.log('\n🎉 Compte admin créé avec succès!')
  console.log('\n📧 Email:', email)
  console.log('🔑 Mot de passe:', password)
  console.log('👤 Rôle: admin_general')
}

createAdmin()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erreur:', err)
    process.exit(1)
  })
