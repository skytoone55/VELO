import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendUserInvitationEmail } from '@/lib/email/gmail'

/**
 * Génère un mot de passe temporaire sécurisé
 * Utilise crypto.randomBytes pour une génération cryptographiquement sûre
 */
function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const bytes = randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length]
  }
  // S'assurer qu'il y a au moins une majuscule, une minuscule, un chiffre et un caractère spécial
  return password + 'Aa1!'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, nom, prenom, role, territoire, telephone, actif } = body

    if (!email || !nom || !prenom || !role) {
      return NextResponse.json(
        { error: 'Email, nom, prénom et rôle sont requis' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Create auth user with a cryptographically secure random password (user will reset it)
    const tempPassword = generateSecurePassword()

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        nom,
        prenom,
        role,
      }
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Erreur lors de la création de l\'utilisateur' },
        { status: 500 }
      )
    }

    // Create profile in users_profile table
    const { data: profile, error: profileError } = await adminClient
      .from('users_profile')
      .insert({
        id: authData.user.id,
        email,
        nom,
        prenom,
        role,
        territoire: territoire || null,
        telephone: telephone || null,
        actif: actif ?? true,
      })
      .select()
      .single()

    if (profileError) {
      console.error('Error creating profile:', profileError)
      // Try to clean up the auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    // Generate a password reset link and send invitation email
    let emailSent = false
    try {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
      })

      if (linkError) {
        console.error('Error generating reset link:', linkError)
      } else if (linkData?.properties?.action_link) {
        // Send custom invitation email with the reset link
        const userName = `${prenom} ${nom}`
        await sendUserInvitationEmail(email, userName, role, linkData.properties.action_link)
        emailSent = true
        console.log(`Email d'invitation envoyé à ${email}`)
      }
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError)
      // Not critical, user can request reset manually
    }

    return NextResponse.json({
      success: true,
      user: profile,
      emailSent,
      message: emailSent
        ? 'Utilisateur créé. Un email d\'invitation a été envoyé.'
        : 'Utilisateur créé. L\'email d\'invitation n\'a pas pu être envoyé - l\'utilisateur peut utiliser "Mot de passe oublié".'
    })

  } catch (error) {
    console.error('Error in create user API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
