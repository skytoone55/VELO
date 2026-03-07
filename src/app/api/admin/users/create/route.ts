import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendUserInvitationEmail } from '@/lib/email/gmail'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { creatableRoles } from '@/lib/auth/helpers'
import { UserRole } from '@/lib/types/database'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const body = await request.json()
    const { email, nom, prenom, role, territoire, telephone, actif, depot_ids, departement, agent_ids, password } = body

    if (!email || !nom || !prenom || !role) {
      return NextResponse.json(
        { error: 'Email, nom, prénom et rôle sont requis' },
        { status: 400 }
      )
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 6 caractères' },
        { status: 400 }
      )
    }

    // Vérification hiérarchique : on ne peut créer que des rôles inférieurs
    const allowed = creatableRoles(authResult.role)
    if (!allowed.includes(role as UserRole)) {
      return NextResponse.json(
        { error: `Vous ne pouvez pas créer un utilisateur avec le rôle ${role}` },
        { status: 403 }
      )
    }

    // super_admin ne peut pas être créé via l'API
    if (role === 'super_admin') {
      return NextResponse.json(
        { error: 'Le rôle Super Admin ne peut pas être attribué' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()

    // Créer l'utilisateur auth
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom, prenom, role }
    })

    if (authError) {
      console.error('Error creating auth user:', authError)

      // Si le compte auth existe déjà mais pas le profil, récupérer l'utilisateur existant
      if (authError.message?.includes('already been registered')) {
        const { data: { users } } = await adminClient.auth.admin.listUsers()
        const existingUser = users?.find(u => u.email === email)

        if (existingUser) {
          // Vérifier si un profil existe déjà
          const { data: existingProfile } = await adminClient
            .from('users_profile')
            .select('id')
            .eq('id', existingUser.id)
            .single()

          if (existingProfile) {
            return NextResponse.json({ error: 'Un utilisateur avec cet email existe déjà' }, { status: 400 })
          }

          // Profil manquant : mettre à jour le mot de passe et continuer avec cet utilisateur
          await adminClient.auth.admin.updateUserById(existingUser.id, {
            password,
            email_confirm: true,
            user_metadata: { nom, prenom, role }
          })

          // Continuer la création du profil avec l'ID existant
          const profileData: Record<string, unknown> = {
            id: existingUser.id,
            email, nom, prenom, role,
            territoire: territoire || null,
            telephone: telephone || null,
            actif: actif !== undefined ? actif : true,
            depot_ids: depot_ids || [],
            departement: departement || null,
          }

          const { error: profileError } = await adminClient
            .from('users_profile')
            .insert(profileData)

          if (profileError) {
            return NextResponse.json({ error: `Erreur création profil : ${profileError.message}` }, { status: 500 })
          }

          return NextResponse.json({ success: true, userId: existingUser.id, recovered: true })
        }

        return NextResponse.json({ error: 'Un utilisateur avec cet email existe déjà' }, { status: 400 })
      }

      // Autres erreurs Supabase — traduire les messages courants
      const frenchErrors: Record<string, string> = {
        'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères',
        'Unable to validate email address: invalid format': 'Format d\'email invalide',
      }
      const msg = frenchErrors[authError.message] || authError.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 })
    }

    // Préparer les données profil
    const profileData: Record<string, unknown> = {
      id: authData.user.id,
      email,
      nom,
      prenom,
      role,
      territoire: territoire || null,
      telephone: telephone || null,
      actif: actif ?? true,
      depot_ids: [],
      departement: null,
    }

    // Logique spécifique par rôle
    if (role === 'agent_secteur') {
      profileData.departement = departement || null
      profileData.depot_ids = depot_ids || []
    } else if (role === 'livreur' && agent_ids?.length) {
      // Déduire département et dépôts des agents secteur assignés
      const { data: agents } = await adminClient
        .from('users_profile')
        .select('id, depot_ids, departement')
        .in('id', agent_ids)
        .eq('role', 'agent_secteur')

      if (agents && agents.length > 0) {
        const allDepots = [...new Set(agents.flatMap(a => a.depot_ids ?? []))]
        const depts = [...new Set(agents.map(a => a.departement).filter(Boolean))]
        profileData.depot_ids = allDepots
        profileData.departement = depts.length === 1 ? depts[0] : depts.join(',')
      }
    }

    // Créer le profil
    const { data: profile, error: profileError } = await adminClient
      .from('users_profile')
      .insert(profileData)
      .select()
      .single()

    if (profileError) {
      console.error('Error creating profile:', profileError)
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // Créer les liens livreur <-> agents secteur
    if (role === 'livreur' && agent_ids?.length) {
      const { error: linkError } = await adminClient
        .from('livreur_agents')
        .insert(agent_ids.map((agentId: string) => ({
          livreur_id: authData.user!.id,
          agent_id: agentId,
        })))

      if (linkError) {
        console.error('Error creating livreur_agents links:', linkError)
      }
    }

    // Envoyer l'email d'invitation
    let emailSent = false
    try {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
      })

      if (!linkError && linkData?.properties?.action_link) {
        const userName = `${prenom} ${nom}`
        await sendUserInvitationEmail(email, userName, role, linkData.properties.action_link)
        emailSent = true
      }
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError)
    }

    return NextResponse.json({
      success: true,
      user: profile,
      temporaryPassword: password,
      emailSent,
      message: emailSent
        ? 'Utilisateur créé. Un email d\'invitation a été envoyé.'
        : 'Utilisateur créé. L\'email d\'invitation n\'a pas pu être envoyé.'
    })

  } catch (error) {
    console.error('Error in create user API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
