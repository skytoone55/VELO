import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate business days between two dates, excluding days NOT in jours_ouverture.
 * jours_ouverture is an array of day names in French lowercase:
 * ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
 */
function getBusinessDaysSince(
  fromDate: Date,
  toDate: Date,
  joursOuverture: string[]
): number {
  const jourMap: Record<number, string> = {
    0: 'dimanche',
    1: 'lundi',
    2: 'mardi',
    3: 'mercredi',
    4: 'jeudi',
    5: 'vendredi',
    6: 'samedi',
  }

  let count = 0
  const current = new Date(fromDate)
  current.setHours(0, 0, 0, 0)
  const end = new Date(toDate)
  end.setHours(0, 0, 0, 0)

  while (current < end) {
    current.setDate(current.getDate() + 1)
    const dayName = jourMap[current.getDay()]
    if (joursOuverture.includes(dayName)) {
      count++
    }
  }

  return count
}

// ---------------------------------------------------------------------------
// POST /api/admin/planning/anomalies
// Detect J+10 anomalies: clients stuck at 'a_livrer' without a scheduled date
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    // Auth: admin or super_admin only
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const adminClient = createAdminClient()
    const now = new Date()

    // 1. Fetch all clients with statut_commercial = 'a_livrer'
    const { data: clients, error: clientsError } = await adminClient
      .from('clients')
      .select(`
        id, raison_sociale, statut_commercial, depot_logistique_id,
        created_at, date_statut
      `)
      .eq('statut_commercial', 'a_livrer')

    if (clientsError) {
      console.error('Erreur fetch clients a_livrer:', clientsError)
      return NextResponse.json(
        { error: 'Erreur lors de la recherche des clients' },
        { status: 500 }
      )
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({
        count: 0,
        clients: [],
        message: 'Aucun client en statut "a_livrer"',
      })
    }

    // 2. Fetch livraisons for these clients (those without creneau_date)
    const clientIds = clients.map((c) => c.id)

    const { data: livraisons, error: livraisonsError } = await adminClient
      .from('livraisons')
      .select('id, client_id, creneau_date, created_at, depot_id')
      .in('client_id', clientIds)
      .is('creneau_date', null)

    if (livraisonsError) {
      console.error('Erreur fetch livraisons:', livraisonsError)
      return NextResponse.json(
        { error: 'Erreur lors de la recherche des livraisons' },
        { status: 500 }
      )
    }

    // Build a map: client_id → livraison (oldest without creneau)
    const livraisonByClient = new Map<
      string,
      { id: string; created_at: string; depot_id: string | null }
    >()
    for (const l of livraisons ?? []) {
      if (!l.client_id) continue
      const existing = livraisonByClient.get(l.client_id)
      if (!existing || l.created_at < existing.created_at) {
        livraisonByClient.set(l.client_id, {
          id: l.id,
          created_at: l.created_at,
          depot_id: l.depot_id,
        })
      }
    }

    // 3. Fetch all depots for jours_ouverture
    const depotIds = new Set<string>()
    for (const l of livraisonByClient.values()) {
      if (l.depot_id) depotIds.add(l.depot_id)
    }
    for (const c of clients) {
      if (c.depot_logistique_id) depotIds.add(c.depot_logistique_id)
    }

    let depotsMap = new Map<string, string[]>()
    if (depotIds.size > 0) {
      const { data: depots } = await adminClient
        .from('depots')
        .select('id, jours_ouverture')
        .in('id', Array.from(depotIds))

      if (depots) {
        for (const d of depots) {
          depotsMap.set(
            d.id,
            d.jours_ouverture ?? ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
          )
        }
      }
    }

    // Default opening days if no depot found
    const defaultJours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']

    // 4. Check each client: is the livraison created > 10 business days ago?
    const anomalies: { id: string; raison_sociale: string }[] = []

    for (const client of clients) {
      const livraison = livraisonByClient.get(client.id)
      if (!livraison) continue // No livraison without creneau → skip

      const createdAt = new Date(livraison.created_at)
      const depotId = livraison.depot_id ?? client.depot_logistique_id
      const joursOuverture = depotId
        ? (depotsMap.get(depotId) ?? defaultJours)
        : defaultJours

      const businessDays = getBusinessDaysSince(createdAt, now, joursOuverture)

      if (businessDays > 10) {
        anomalies.push({
          id: client.id,
          raison_sociale: client.raison_sociale,
        })
      }
    }

    if (anomalies.length === 0) {
      return NextResponse.json({
        count: 0,
        clients: [],
        message: 'Aucune anomalie J+10 détectée',
      })
    }

    // 5. Update clients to 'anomalie'
    const anomalyIds = anomalies.map((a) => a.id)
    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        statut_commercial: 'anomalie',
        statut_anomalie: `Anomalie J+10 : livraison non programmée depuis plus de 10 jours ouvrés (détecté le ${now.toISOString().split('T')[0]})`,
        date_statut: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .in('id', anomalyIds)

    if (updateError) {
      console.error('Erreur mise à jour anomalies:', updateError)
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour des anomalies' },
        { status: 500 }
      )
    }

    // 6. Log in audit_log
    const auditEntries = anomalies.map((a) => ({
      action: 'anomalie_j10',
      entity_type: 'client',
      entity_id: a.id,
      details: {
        raison_sociale: a.raison_sociale,
        previous_statut: 'a_livrer',
        new_statut: 'anomalie',
        detection_date: now.toISOString().split('T')[0],
      },
      created_at: now.toISOString(),
    }))

    const { error: auditError } = await adminClient
      .from('audit_log')
      .insert(auditEntries)

    if (auditError) {
      // Non-blocking: anomalies already updated
      console.error('Erreur insertion audit_log:', auditError)
    }

    return NextResponse.json({
      count: anomalies.length,
      clients: anomalies.map((a) => a.raison_sociale),
      message: `${anomalies.length} client(s) passé(s) en anomalie`,
    })
  } catch (error) {
    console.error('Erreur POST /api/admin/planning/anomalies:', error)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}
