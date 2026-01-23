import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncClientToMonday, isMondayConfigured } from '@/lib/monday/api'

/**
 * POST /api/admin/clients/[id]/sync-monday
 * Force la synchronisation d'un client de Supabase vers Monday
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier si Monday est configuré
    if (!isMondayConfigured()) {
      return NextResponse.json({ error: 'Monday.com non configuré' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Récupérer le client
    const { data: client, error: fetchError } = await adminClient
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !client) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    if (!client.monday_item_id) {
      return NextResponse.json({ error: 'Client sans monday_item_id' }, { status: 400 })
    }

    // Champs à synchroniser (optionnel - peut venir du body)
    const body = await request.json().catch(() => ({}))
    const fieldsToSync = body.fields || undefined // Si non spécifié, sync tous les champs mappés

    // Synchroniser vers Monday
    const result = await syncClientToMonday(client, fieldsToSync)

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Erreur sync Monday' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Client synchronisé vers Monday',
      clientId: id,
      mondayItemId: client.monday_item_id,
    })

  } catch (error: any) {
    console.error('Erreur API sync-monday:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}
