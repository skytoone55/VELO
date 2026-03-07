import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Only super_admin can impersonate
    const authResult = await requireRole(['super_admin'])
    if (isAuthError(authResult)) return authResult

    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: 'ID utilisateur requis' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Get target user email
    const { data: profile, error: profileError } = await adminClient
      .from('users_profile')
      .select('email')
      .eq('id', id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      )
    }

    // Generate magic link for target user
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Error generating magic link:', linkError)
      return NextResponse.json(
        { error: 'Impossible de générer le lien de connexion' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      actionLink: linkData.properties.action_link,
    })

  } catch (error: any) {
    console.error('Error in impersonate API:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
