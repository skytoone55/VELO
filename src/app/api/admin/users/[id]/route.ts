import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { ROLE_HIERARCHY } from '@/lib/auth/types'
import { UserRole } from '@/lib/types/database'

function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const bytes = randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length]
  }
  return password + 'Aa1!'
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'ID utilisateur requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Vérifier le profil cible
    const { data: target } = await adminClient
      .from('users_profile')
      .select('id, role, is_super_admin')
      .eq('id', id)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })
    }

    // Protection Super Admin : indestructible
    if (target.is_super_admin) {
      return NextResponse.json(
        { error: 'Le compte Super Admin ne peut pas être supprimé.' },
        { status: 403 }
      )
    }

    // Vérification hiérarchique
    if (ROLE_HIERARCHY[authResult.role] <= ROLE_HIERARCHY[target.role as UserRole]) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Vérifier les dépendances (livraisons)
    const { data: livraisons } = await adminClient
      .from('livraisons')
      .select('id')
      .or(`livreur_id.eq.${id},agent_id.eq.${id}`)
      .limit(1)

    if (livraisons && livraisons.length > 0) {
      return NextResponse.json(
        { error: 'Cet utilisateur est lié à des livraisons. Désactivez-le plutôt.' },
        { status: 400 }
      )
    }

    // Nettoyer livreur_agents si livreur
    if (target.role === 'livreur') {
      await adminClient.from('livreur_agents').delete().eq('livreur_id', id)
    }

    // Nettoyer livreur_agents si agent_secteur (les livreurs rattachés)
    if (target.role === 'agent_secteur') {
      await adminClient.from('livreur_agents').delete().eq('agent_id', id)
    }

    // Supprimer le profil puis l'utilisateur auth
    const { error: profileError } = await adminClient
      .from('users_profile')
      .delete()
      .eq('id', id)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    await adminClient.auth.admin.deleteUser(id)

    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('Error in delete user API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const { id } = await params
    const body = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID utilisateur requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Vérifier le profil cible
    const { data: target } = await adminClient
      .from('users_profile')
      .select('id, role, is_super_admin')
      .eq('id', id)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })
    }

    // Protection Super Admin
    if (target.is_super_admin && authResult.id !== id) {
      return NextResponse.json(
        { error: 'Le compte Super Admin ne peut pas être modifié.' },
        { status: 403 }
      )
    }

    // Vérification hiérarchique (sauf si c'est soi-même)
    if (authResult.id !== id && ROLE_HIERARCHY[authResult.role] <= ROLE_HIERARCHY[target.role as UserRole]) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { nom, prenom, role, territoire, telephone, actif, depot_ids, departement, agent_ids, password, est_aussi_livreur } = body

    // Empêcher le changement de rôle du super_admin
    if (target.is_super_admin && role && role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Le rôle du Super Admin ne peut pas être modifié.' },
        { status: 403 }
      )
    }

    // Mettre à jour le mot de passe si fourni
    if (password && password.length >= 6) {
      const { error: pwdError } = await adminClient.auth.admin.updateUserById(id, { password })
      if (pwdError) {
        return NextResponse.json({ error: pwdError.message }, { status: 500 })
      }
    }

    const updateData: Record<string, unknown> = {
      nom,
      prenom,
      role: target.is_super_admin ? 'super_admin' : role,
      territoire: territoire || null,
      telephone: telephone || null,
      actif,
      est_aussi_livreur: role === 'agent_secteur' ? (est_aussi_livreur ?? false) : false,
      updated_at: new Date().toISOString(),
    }

    if (departement !== undefined) {
      updateData.departement = departement || null
    }

    if (depot_ids !== undefined) {
      updateData.depot_ids = depot_ids
    }

    // MAJ livreur_agents si c'est un livreur avec des agents modifiés
    if (role === 'livreur' && agent_ids !== undefined) {
      await adminClient.from('livreur_agents').delete().eq('livreur_id', id)

      if (agent_ids.length > 0) {
        await adminClient
          .from('livreur_agents')
          .insert(agent_ids.map((agentId: string) => ({
            livreur_id: id,
            agent_id: agentId,
          })))

        // Recalculer depot_ids et departement depuis les agents
        const { data: agents } = await adminClient
          .from('users_profile')
          .select('depot_ids, departement')
          .in('id', agent_ids)
          .eq('role', 'agent_secteur')

        if (agents && agents.length > 0) {
          const allDepots = [...new Set(agents.flatMap(a => a.depot_ids ?? []))]
          const depts = [...new Set(agents.map(a => a.departement).filter(Boolean))]
          updateData.depot_ids = allDepots
          updateData.departement = depts.length === 1 ? depts[0] : depts.join(',')
        }
      }
    }

    const { data: profile, error: updateError } = await adminClient
      .from('users_profile')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, user: profile })

  } catch (error: unknown) {
    console.error('Error in update user API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// PUT — Reset password
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(authResult)) return authResult

    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'ID utilisateur requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Protection Super Admin
    const { data: target } = await adminClient
      .from('users_profile')
      .select('is_super_admin, role')
      .eq('id', id)
      .single()

    if (target?.is_super_admin && authResult.id !== id) {
      return NextResponse.json(
        { error: 'Le mot de passe du Super Admin ne peut pas être réinitialisé par un autre utilisateur.' },
        { status: 403 }
      )
    }

    const newPassword = generateSecurePassword()

    const { error: authError } = await adminClient.auth.admin.updateUserById(id, {
      password: newPassword,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      temporaryPassword: newPassword,
    })

  } catch (error: unknown) {
    console.error('Error in reset password API:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
