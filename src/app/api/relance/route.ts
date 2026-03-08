import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'Token requis' }, { status: 400 })

    const adminClient = createAdminClient()

    let client = null
    const { data: c1 } = await adminClient
      .from('clients')
      .select('id, raison_sociale, preferences_livraison, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, telephone')
      .eq('token_formulaire', token)
      .single()

    if (c1) {
      client = c1
    } else {
      const { data: c2 } = await adminClient
        .from('clients')
        .select('id, raison_sociale, preferences_livraison, adresse_livraison_ligne1, adresse_livraison_cp, adresse_livraison_ville, telephone')
        .eq('token_documents', token)
        .single()
      client = c2
    }

    if (!client) {
      return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
    }

    return NextResponse.json({
      clientId: client.id,
      raisonSociale: client.raison_sociale,
      preferencesActuelles: client.preferences_livraison,
      adresse: client.adresse_livraison_ligne1
        ? `${client.adresse_livraison_ligne1}, ${client.adresse_livraison_cp} ${client.adresse_livraison_ville}`
        : null,
      telephone: client.telephone,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { token, disponibilites } = await request.json()
    if (!token || !disponibilites) {
      return NextResponse.json({ error: 'Token et disponibilités requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: client, error: findError } = await adminClient
      .from('clients')
      .select('id')
      .eq('token_formulaire', token)
      .single()

    if (findError || !client) {
      return NextResponse.json({ error: 'Lien invalide' }, { status: 404 })
    }

    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        preferences_livraison: disponibilites,
      })
      .eq('id', client.id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
