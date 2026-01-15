import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId } = body

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID requis' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Récupérer l'adresse du client
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select(`
        adresse_societe_ligne1,
        adresse_societe_ligne2,
        adresse_societe_cp,
        adresse_societe_ville,
        agence
      `)
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Client non trouvé' },
        { status: 404 }
      )
    }

    // Récupérer les dépôts actifs de l'agence
    const { data: depots } = await adminClient
      .from('depots')
      .select('*')
      .eq('agence', client.agence)
      .eq('actif', true)

    return NextResponse.json({
      address: {
        ligne1: client.adresse_societe_ligne1 || '',
        ligne2: client.adresse_societe_ligne2 || '',
        codePostal: client.adresse_societe_cp || '',
        ville: client.adresse_societe_ville || '',
      },
      agence: client.agence,
      depots: depots || [],
      hasDepots: (depots || []).length > 0,
    })

  } catch (error: any) {
    console.error('Erreur API client-address:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
