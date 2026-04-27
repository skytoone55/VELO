/**
 * Creation du compte super_admin Olivier Fontaine (associe Ecovolt).
 * Calque sur le profil d'Olivier Malai : role super_admin, is_super_admin=false.
 *
 * Usage : npx tsx scripts/create-olivier-fontaine.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.ecovolt.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  const email = 'olivier@eco-volt.fr'
  const password = 'Olivier75'

  console.log(`Creation du compte ${email}...`)

  const { data: existing } = await supabase
    .from('users_profile')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    console.log(`Profil deja existant (id: ${existing.id}). Aucune action.`)
    return
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    console.error('Erreur creation auth:', authError.message)
    return
  }

  console.log(`Auth user cree: ${authData.user.id}`)

  const { error: profileError } = await supabase
    .from('users_profile')
    .insert({
      id: authData.user.id,
      email,
      nom: 'Fontaine',
      prenom: 'Olivier',
      role: 'super_admin',
      is_super_admin: false,
      territoire: 'FR',
      actif: true,
      est_aussi_livreur: false,
      depot_ids: [],
    })

  if (profileError) {
    console.error('Erreur creation profil:', profileError.message)
    return
  }

  console.log('Profil super_admin cree.')
  console.log(`Email: ${email}`)
  console.log(`Mot de passe: ${password}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
