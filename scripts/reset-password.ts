import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function resetPassword() {
  const { data, error } = await supabase.auth.admin.updateUserById(
    '35bd73da-726e-45fa-865a-a237e18a8396',
    { password: '@Crm1532' }
  )

  if (error) {
    console.error('❌ Erreur:', error.message)
  } else {
    console.log('✅ Mot de passe réinitialisé avec succès')
    console.log('📧 Email: malai.jonathan@gmail.com')
    console.log('🔑 Mot de passe: @Crm1532')
  }
}

resetPassword()
