import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { passerClientHS } from '@/lib/clients/passer-hs'

// POST - Passer un client en HS (admin/super_admin uniquement)
// Annule la livraison active, reset CQ, libere FNUCI
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { comment } = await request.json()

    if (!comment?.trim()) {
      return NextResponse.json({ error: 'Commentaire obligatoire' }, { status: 400 })
    }

    // Auth + role check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, nom, prenom')
      .eq('id', user.id)
      .single()

    if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Reserve aux administrateurs' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    const adminName = [profile.prenom, profile.nom].filter(Boolean).join(' ') || user.email || 'Admin'

    const result = await passerClientHS(adminClient, id, comment, adminName)

    return NextResponse.json({
      success: true,
      livraisons_annulees: result.livraisons_annulees,
      fnuci_liberes: result.fnuci_liberes,
    })

  } catch (err: any) {
    console.error('Erreur passage HS:', err)
    const status = err.message === 'Client non trouve' ? 404 : 500
    return NextResponse.json({ error: err.message }, { status })
  }
}
