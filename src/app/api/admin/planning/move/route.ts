import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_DEPOT_ID = '5c733b3e-a3f2-4c86-8b48-425a8a37ea27' // NANTE LOG fallback

interface Creneau {
  heure_debut: string
  heure_fin: string
}

interface MovePayload {
  livraison_id?: string
  new_date?: string
  new_livreur_id?: string | null
  new_creneau?: Creneau | null
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const body = (await request.json().catch(() => ({}))) as MovePayload
    const { livraison_id, new_date } = body
    let { new_livreur_id, new_creneau } = body

    if (!livraison_id) {
      return NextResponse.json({ error: 'livraison_id requis' }, { status: 400 })
    }
    if (!new_date || !/^\d{4}-\d{2}-\d{2}$/.test(new_date)) {
      return NextResponse.json({ error: 'new_date requise (YYYY-MM-DD)' }, { status: 400 })
    }

    if (auth.role === 'livreur') {
      new_livreur_id = auth.id
    }

    const adminClient = createAdminClient()

    const { data: livraison, error: fetchErr } = await adminClient
      .from('livraisons')
      .select('id, client_id, livreur_id, tournee_id, depot_id')
      .eq('id', livraison_id)
      .single()

    if (fetchErr || !livraison) {
      return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 })
    }

    const targetLivreurId = new_livreur_id ?? livraison.livreur_id
    if (!targetLivreurId) {
      return NextResponse.json({ error: 'Aucun livreur cible (ni payload ni livraison actuelle)' }, { status: 400 })
    }

    if (auth.role === 'agent_secteur') {
      const allowed = auth.depot_ids || []
      const { data: livreurProfile } = await adminClient
        .from('users_profile')
        .select('depot_ids')
        .eq('id', targetLivreurId)
        .single()
      const livreurDepots = (livreurProfile?.depot_ids as string[] | null) || []
      const intersect = livreurDepots.some(d => allowed.includes(d))
      if (!intersect) {
        return NextResponse.json({ error: 'Livreur cible hors de votre périmètre' }, { status: 403 })
      }
    }

    // Trouver ou créer la tournée cible
    const { data: existingTournee } = await adminClient
      .from('tournees')
      .select('id, depot_id')
      .eq('date', new_date)
      .eq('livreur_id', targetLivreurId)
      .maybeSingle()

    let targetTournee: { id: string; depot_id: string | null } | null = existingTournee
    let createdNewTournee = false

    if (!targetTournee) {
      // Déterminer depot_id de la nouvelle tournée
      let depotForTournee: string | null = null
      if (livraison.client_id) {
        const { data: client } = await adminClient
          .from('clients')
          .select('depot_logistique_id')
          .eq('id', livraison.client_id)
          .single()
        depotForTournee = client?.depot_logistique_id ?? null
      }
      if (!depotForTournee) depotForTournee = DEFAULT_DEPOT_ID

      const { data: livreurInfo } = await adminClient
        .from('users_profile')
        .select('nom, prenom')
        .eq('id', targetLivreurId)
        .single()
      const livreurLabel = `${livreurInfo?.prenom || ''} ${livreurInfo?.nom || ''}`.trim() || 'inconnu'
      const [y, m, d] = new_date.split('-')
      const noteDate = `${d}/${m}/${y}`

      const { data: newTournee, error: insertErr } = await adminClient
        .from('tournees')
        .insert({
          date: new_date,
          livreur_id: targetLivreurId,
          depot_id: depotForTournee,
          notes: `Tournée ${livreurLabel} — ${noteDate} — créée par déplacement`,
          created_by: auth.id,
        })
        .select('id, depot_id')
        .single()

      if (insertErr || !newTournee) {
        return NextResponse.json({ error: `Création tournée: ${insertErr?.message || 'inconnu'}` }, { status: 500 })
      }
      targetTournee = newTournee
      createdNewTournee = true
    }

    // Position = max + 1
    const { data: posRows } = await adminClient
      .from('livraisons')
      .select('tournee_position')
      .eq('tournee_id', targetTournee.id)
      .order('tournee_position', { ascending: false, nullsFirst: false })
      .limit(1)
    const currentMax = posRows?.[0]?.tournee_position
    const newPosition = (typeof currentMax === 'number' ? currentMax : -1) + 1

    const now = new Date().toISOString()
    const updateData: Record<string, unknown> = {
      creneau_date: new_date,
      livreur_id: targetLivreurId,
      tournee_id: targetTournee.id,
      tournee_position: newPosition,
      statut: 'en_livraison',
      depot_id: targetTournee.depot_id,
      date_programmation: now,
      updated_at: now,
      creneau_heure_debut: new_creneau?.heure_debut ?? null,
      creneau_heure_fin: new_creneau?.heure_fin ?? null,
    }

    const { error: updateLivErr } = await adminClient
      .from('livraisons')
      .update(updateData)
      .eq('id', livraison_id)

    if (updateLivErr) {
      return NextResponse.json({ error: `Update livraison: ${updateLivErr.message}` }, { status: 500 })
    }

    if (livraison.client_id) {
      const { error: updateClientErr } = await adminClient
        .from('clients')
        .update({
          statut_commercial: 'en_livraison',
          date_statut: now,
          updated_at: now,
        })
        .eq('id', livraison.client_id)
      if (updateClientErr) {
        return NextResponse.json({ error: `Update client: ${updateClientErr.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({
      livraison_id,
      old_tournee_id: livraison.tournee_id,
      new_tournee_id: targetTournee.id,
      new_position: newPosition,
      created_new_tournee: createdNewTournee,
    })
  } catch (error) {
    console.error('Erreur API move:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
