import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { sendTourneeConfirmationEmail } from '@/lib/email/gmail'

/**
 * GET /api/admin/tournees
 * Liste les tournées avec leurs livraisons
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin'])
    if (isAuthError(auth)) return auth

    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('from')
    const dateTo = searchParams.get('to')

    let query = supabase
      .from('tournees')
      .select(`
        *,
        livreur:users_profile!tournees_livreur_id_fkey(id, nom, prenom, email),
        depot:depots!tournees_depot_id_fkey(id, nom)
      `)
      .order('date', { ascending: false })

    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)

    const { data: tournees, error } = await query.limit(50)

    if (error) {
      console.error('Erreur GET tournées:', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // Pour chaque tournée, compter les livraisons
    const tourneeIds = (tournees || []).map((t) => t.id)
    let livraisonsCount: Record<string, { total: number; confirmees: number; refusees: number }> = {}

    if (tourneeIds.length > 0) {
      const { data: livraisons } = await supabase
        .from('livraisons')
        .select('tournee_id, confirmation_statut')
        .in('tournee_id', tourneeIds)

      if (livraisons) {
        for (const liv of livraisons) {
          if (!liv.tournee_id) continue
          if (!livraisonsCount[liv.tournee_id]) {
            livraisonsCount[liv.tournee_id] = { total: 0, confirmees: 0, refusees: 0 }
          }
          livraisonsCount[liv.tournee_id].total++
          if (liv.confirmation_statut === 'confirmee') livraisonsCount[liv.tournee_id].confirmees++
          if (liv.confirmation_statut === 'refusee') livraisonsCount[liv.tournee_id].refusees++
        }
      }
    }

    return NextResponse.json({
      tournees: (tournees || []).map((t) => ({
        ...t,
        stats: livraisonsCount[t.id] || { total: 0, confirmees: 0, refusees: 0 },
      })),
    })
  } catch (error: unknown) {
    console.error('Erreur GET /api/admin/tournees:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}

/**
 * POST /api/admin/tournees
 * Créer une tournée : assigner des livraisons à une date + livreur, envoyer emails de confirmation
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin'])
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const { livraison_ids, date, livreur_id, depot_id, creneau_debut, creneau_fin, notes } = body

    // Validations
    if (!livraison_ids || !Array.isArray(livraison_ids) || livraison_ids.length === 0) {
      return NextResponse.json({ error: 'Au moins une livraison requise' }, { status: 400 })
    }
    if (!date) {
      return NextResponse.json({ error: 'Date requise' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Créer la tournée
    const { data: tournee, error: tourneeError } = await supabase
      .from('tournees')
      .insert({
        date,
        livreur_id: livreur_id || null,
        depot_id: depot_id || null,
        creneau_debut: creneau_debut || null,
        creneau_fin: creneau_fin || null,
        notes: notes || null,
        created_by: auth.id,
      })
      .select()
      .single()

    if (tourneeError || !tournee) {
      console.error('Erreur création tournée:', tourneeError)
      return NextResponse.json({ error: 'Erreur lors de la création de la tournée' }, { status: 500 })
    }

    // Récupérer les livraisons avec clients
    const { data: livraisons, error: livError } = await supabase
      .from('livraisons')
      .select('id, client_id, token_livraison')
      .in('id', livraison_ids)

    if (livError || !livraisons || livraisons.length === 0) {
      return NextResponse.json({ error: 'Livraisons introuvables' }, { status: 404 })
    }

    // Récupérer les clients
    const clientIds = livraisons.map((l) => l.client_id).filter(Boolean) as string[]
    const { data: clients } = await supabase
      .from('clients')
      .select('id, raison_sociale, contact_prenom, contact_nom, email_beneficiaire, email')
      .in('id', clientIds)

    const clientMap = new Map((clients || []).map((c) => [c.id, c]))

    // Mettre à jour chaque livraison
    const emailResults: { clientId: string; success: boolean; error?: string }[] = []
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    for (const liv of livraisons) {
      // Générer un token de confirmation
      const confirmToken = crypto.randomBytes(32).toString('hex')

      await supabase
        .from('livraisons')
        .update({
          tournee_id: tournee.id,
          confirmation_statut: 'en_attente',
          creneau_date: date,
          creneau_heure_debut: creneau_debut || null,
          creneau_heure_fin: creneau_fin || null,
          statut: 'programmee',
          token_livraison: confirmToken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', liv.id)

      // Envoyer email de confirmation au client
      const client = clientMap.get(liv.client_id!)
      if (client) {
        const clientEmail = client.email_beneficiaire || client.email
        const clientName = [client.contact_prenom, client.contact_nom].filter(Boolean).join(' ') || client.raison_sociale

        if (clientEmail) {
          try {
            const confirmUrl = `${baseUrl}/tournee/confirmation?token=${confirmToken}`
            await sendTourneeConfirmationEmail({
              to: clientEmail,
              clientName,
              date,
              creneauDebut: creneau_debut || '09:00',
              creneauFin: creneau_fin || '18:00',
              confirmUrl,
            })
            emailResults.push({ clientId: client.id, success: true })
          } catch (emailErr) {
            console.error(`Erreur email tournée pour ${clientEmail}:`, emailErr)
            emailResults.push({ clientId: client.id, success: false, error: 'Email non envoyé' })
          }
        } else {
          emailResults.push({ clientId: client.id, success: false, error: 'Pas d\'email' })
        }
      }
    }

    // Workflow transition pour chaque client
    for (const liv of livraisons) {
      await supabase.from('workflow_transitions').insert({
        entity_type: 'livraison',
        entity_id: liv.id,
        statut_avant: 'en_attente',
        statut_apres: 'programmee',
        effectue_par: auth.id,
        raison: `Tournée programmée le ${date}`,
      })
    }

    return NextResponse.json({
      success: true,
      tournee_id: tournee.id,
      nb_livraisons: livraisons.length,
      emails: emailResults,
    })
  } catch (error: unknown) {
    console.error('Erreur POST /api/admin/tournees:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
