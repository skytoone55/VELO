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
  // Position d'insertion (0 = début) calculée côté client lors d'un drop.
  // Honorée UNIQUEMENT pour un repositionnement dans le MÊME jour + MÊME créneau
  // + MÊME livreur. Dans tout autre cas (autre jour / autre créneau), ignorée
  // et le client va à la fin du créneau cible.
  target_index?: number | null
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur', 'livreur'])
    if (isAuthError(auth)) return auth

    const body = (await request.json().catch(() => ({}))) as MovePayload
    const { livraison_id, new_date, target_index } = body
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
      .select('id, client_id, livreur_id, tournee_id, depot_id, creneau_date, creneau_heure_debut, tournee_position')
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

    // Trouver ou créer la tournée cible.
    // NB : il peut exister PLUSIEURS tournées pour un même (date, livreur)
    // (ex : plusieurs "tournées intelligentes" créées, dont des vides). On ne peut
    // donc pas utiliser .maybeSingle() (qui plante sur >1 ligne et faisait alors
    // créer à tort une nouvelle tournée à chaque déplacement).
    const { data: candidateTournees } = await adminClient
      .from('tournees')
      .select('id, depot_id')
      .eq('date', new_date)
      .eq('livreur_id', targetLivreurId)

    let targetTournee: { id: string; depot_id: string | null } | null = null
    let createdNewTournee = false

    if (candidateTournees && candidateTournees.length > 0) {
      // 1) Réutiliser la tournée où la livraison se trouve déjà (réordonnancement intra-jour)
      const current = candidateTournees.find(t => t.id === livraison.tournee_id)
      if (current) {
        targetTournee = current
      } else {
        // 2) Sinon, choisir la tournée existante la plus remplie (évite de créer un
        //    doublon et d'atterrir dans une tournée résiduelle vide)
        const withCounts = await Promise.all(
          candidateTournees.map(async t => {
            const { count } = await adminClient
              .from('livraisons')
              .select('id', { count: 'exact', head: true })
              .eq('tournee_id', t.id)
              .not('statut', 'in', '("annulee","retractation")')
            return { t, count: count ?? 0 }
          })
        )
        withCounts.sort((a, b) => b.count - a.count)
        targetTournee = withCounts[0].t
      }
    }

    if (!targetTournee) {
      // Déterminer depot_id de la nouvelle tournée
      let depotForTournee: string | null = null
      if (livraison.client_id) {
        const { data: client } = await adminClient
          .from('clients')
          .select('depot_retrait_id, depot_logistique_id')
          .eq('id', livraison.client_id)
          .single()
        // depot_retrait_id (PPE+Ecovolt) prioritaire ; depot_logistique_id (legacy PPE)
        // en repli. Cote Ecovolt depot_logistique_id est NULL -> sans ca on tombait
        // sur DEFAULT_DEPOT_ID (un depot PPE qui n'existe pas dans la base Ecovolt),
        // ce qui faisait echouer la creation de tournee et donc le deplacement.
        depotForTournee = client?.depot_retrait_id ?? client?.depot_logistique_id ?? null
      }
      // Repli sur la livraison elle-meme avant le defaut en dur.
      if (!depotForTournee) depotForTournee = livraison.depot_id ?? DEFAULT_DEPOT_ID

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

    const now = new Date().toISOString()

    // Normalise une heure "HH:MM[:SS]" → "HH:MM" pour comparaison de créneau.
    const norm = (h: string | null | undefined) => (h ? h.slice(0, 5) : null)
    const targetCreneauDebut = new_creneau?.heure_debut ? norm(new_creneau.heure_debut) : null
    const currentCreneauDebut = norm(livraison.creneau_heure_debut as string | null)

    // Repositionnement intra-créneau : même tournée + même date + même livreur
    // + même créneau, et un target_index explicite fourni par le drop.
    const isIntraSlotReorder =
      typeof target_index === 'number' &&
      target_index >= 0 &&
      !createdNewTournee &&
      targetTournee.id === livraison.tournee_id &&
      targetLivreurId === livraison.livreur_id &&
      currentCreneauDebut === targetCreneauDebut

    let newPosition: number

    if (isIntraSlotReorder) {
      // Récupère toute la tournée dans l'ordre courant (tournee_position),
      // déplace l'élément à l'index cible PARMI les cartes du même créneau,
      // puis renumérote toute la tournée séquentiellement.
      const { data: tourneeRows } = await adminClient
        .from('livraisons')
        .select('id, tournee_position, creneau_heure_debut')
        .eq('tournee_id', targetTournee.id)
        .order('tournee_position', { ascending: true, nullsFirst: false })
        .order('creneau_heure_debut', { ascending: true })

      const rows = (tourneeRows || []) as Array<{ id: string; creneau_heure_debut: string | null }>
      // Liste ordonnée des ids du créneau cible (hors la livraison déplacée)
      const slotIds = rows
        .filter(r => norm(r.creneau_heure_debut) === targetCreneauDebut && r.id !== livraison_id)
        .map(r => r.id)
      // Insère la livraison déplacée à l'index voulu (clampé)
      const clamped = Math.max(0, Math.min(target_index, slotIds.length))
      slotIds.splice(clamped, 0, livraison_id)

      // Ordre final de TOUTE la tournée : on remplace, à la 1re position
      // occupée par une carte du créneau cible, la séquence complète slotIds
      // (déjà réordonnée). Les autres créneaux gardent leur ordre relatif.
      const finalOrder: string[] = []
      let slotInjected = false
      for (const r of rows) {
        if (r.id === livraison_id) continue // retiré, réinjecté via slotIds
        if (norm(r.creneau_heure_debut) === targetCreneauDebut) {
          // 1re carte du créneau rencontrée → injecter toute la séquence slotIds
          if (!slotInjected) {
            finalOrder.push(...slotIds)
            slotInjected = true
          }
          // cartes suivantes du créneau : déjà incluses dans slotIds → ignorer
        } else {
          finalOrder.push(r.id)
        }
      }
      // Si le créneau cible n'avait aucune carte parmi `rows` (cas limite :
      // la livraison déplacée était la seule), injecter en fin.
      if (!slotInjected) finalOrder.push(...slotIds)

      // Renumérote séquentiellement
      for (let i = 0; i < finalOrder.length; i++) {
        if (finalOrder[i] === livraison_id) continue // mis à jour dans l'update principal
        const { error: reErr } = await adminClient
          .from('livraisons')
          .update({ tournee_position: i, updated_at: now })
          .eq('id', finalOrder[i])
        if (reErr) {
          return NextResponse.json({ error: `Réordonnancement: ${reErr.message}` }, { status: 500 })
        }
      }
      newPosition = finalOrder.indexOf(livraison_id)
    } else {
      // Comportement par défaut : position = max + 1 (fin du créneau/jour cible)
      const { data: posRows } = await adminClient
        .from('livraisons')
        .select('tournee_position')
        .eq('tournee_id', targetTournee.id)
        .order('tournee_position', { ascending: false, nullsFirst: false })
        .limit(1)
      const currentMax = posRows?.[0]?.tournee_position
      newPosition = (typeof currentMax === 'number' ? currentMax : -1) + 1
    }

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
