import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: 'ID utilisateur requis' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Check if user has dependencies (livraisons assigned, etc.)
    const { data: livraisons } = await adminClient
      .from('livraisons')
      .select('id')
      .or(`livreur_id.eq.${id},agent_id.eq.${id}`)
      .limit(1)

    if (livraisons && livraisons.length > 0) {
      return NextResponse.json(
        { error: 'Cet utilisateur est lié à des livraisons et ne peut pas être supprimé. Désactivez-le plutôt.' },
        { status: 400 }
      )
    }

    // Delete from users_profile first
    const { error: profileError } = await adminClient
      .from('users_profile')
      .delete()
      .eq('id', id)

    if (profileError) {
      console.error('Error deleting profile:', profileError)
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    // Delete auth user
    const { error: authError } = await adminClient.auth.admin.deleteUser(id)

    if (authError) {
      console.error('Error deleting auth user:', authError)
      // Profile already deleted, but log the error
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error in delete user API:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'ID utilisateur requis' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    const { nom, prenom, role, territoire, telephone, actif } = body

    const { data: profile, error: updateError } = await adminClient
      .from('users_profile')
      .update({
        nom,
        prenom,
        role,
        territoire: territoire || null,
        telephone: telephone || null,
        actif,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, user: profile })

  } catch (error: any) {
    console.error('Error in update user API:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
