import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePagination } from '@/lib/constants'
import { sendEmail } from '@/lib/email/gmail'
import { getTenantConfig } from '@/lib/tenants'

export async function GET(request: NextRequest) {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  const adminClient = createAdminClient()
  const { searchParams } = new URL(request.url)

  const filter = searchParams.get('filter') || 'all' // all | non_traites | en_cours
  const search = searchParams.get('search') || ''
  const agentFilter = searchParams.get('agent') || 'all' // all | me | <user_id>
  const { page, pageSize } = validatePagination(
    searchParams.get('page') || '1',
    searchParams.get('pageSize') || '50'
  )

  // Base query: livraisons livrees non validees CQ
  let query = adminClient
    .from('livraisons')
    .select(`
      id, statut, date_livraison, date_livraison_effective,
      livreur_id, depot_id,
      cq_piece_identite, cq_photo_enemat, cq_signature_installateur,
      cq_signature_client, cq_fnuci, cq_velo,
      cq_valide, cq_valide_par, cq_valide_at, cq_en_cours, cq_commentaire,
      cq_pris_par, cq_pris_at, reactivated_at,
      client:clients!livraisons_client_id_fkey(id, raison_sociale, contact_nom, contact_prenom, telephone, reference_retina, commercial_assigne, depot_logistique_id, depot_retrait_id, velo_valide, fnuci_ids, in_enemat),
      depot:depots!livraisons_depot_id_fkey(id, nom)
    `, { count: 'exact' })
    .eq('statut', 'livree')
    .eq('cq_valide', false)

  // Filtre par type
  if (filter === 'non_traites') {
    query = query.eq('cq_en_cours', false)
  } else if (filter === 'en_cours') {
    query = query.eq('cq_en_cours', true)
  } else if (filter === 'sav') {
    query = query.not('reactivated_at', 'is', null)
  }

  // Filtre par agent (verrouillage)
  if (agentFilter === 'me') {
    query = query.eq('cq_pris_par', auth.id)
  } else if (agentFilter !== 'all') {
    query = query.eq('cq_pris_par', agentFilter)
  }

  // Role-based filtering (garde-fou si les rôles changent)
  if (auth.role === 'agent_secteur' && auth.depot_ids?.length) {
    query = query.in('depot_id', auth.depot_ids)
  }

  // Search — pre-fetch client IDs matching search
  if (search) {
    const { data: matchingClients } = await adminClient
      .from('clients')
      .select('id')
      .or(`raison_sociale.ilike.%${search}%,siret.ilike.%${search}%,reference_retina.ilike.%${search}%,telephone.ilike.%${search}%,email.ilike.%${search}%`)
    const matchingIds = matchingClients?.map(c => c.id) || []
    if (matchingIds.length === 0) {
      return NextResponse.json({
        items: [],
        agents: [],
        stats: { non_traites: 0, en_cours: 0, total: 0 },
        pagination: { page, pageSize, total: 0 },
      })
    }
    query = query.in('client_id', matchingIds)
  }

  // Pagination + order
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query
    .order('reactivated_at', { ascending: false, nullsFirst: false })
    .order('date_livraison_effective', { ascending: false, nullsFirst: false })
    .range(from, to)

  const { data: items, error, count } = await query

  if (error) {
    console.error('Erreur controle qualite GET:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Resolve livreur: use livreur_id, or fallback to workflow_transitions.effectue_par
  const itemsWithLivreurId = (items || []).filter(i => i.livreur_id)
  const itemsWithoutLivreurId = (items || []).filter(i => !i.livreur_id)

  let transitionMap: Record<string, string> = {}
  if (itemsWithoutLivreurId.length > 0) {
    const { data: transitions } = await adminClient
      .from('workflow_transitions')
      .select('entity_id, effectue_par')
      .eq('entity_type', 'livraison')
      .eq('statut_apres', 'livree')
      .in('entity_id', itemsWithoutLivreurId.map(i => i.id))
    if (transitions) {
      transitionMap = Object.fromEntries(transitions.map(t => [t.entity_id, t.effectue_par]))
    }
  }

  // Collect ALL user IDs to resolve (livreurs + agents who locked)
  const allUserIds = new Set<string>()
  for (const item of itemsWithLivreurId) allUserIds.add(item.livreur_id)
  for (const userId of Object.values(transitionMap)) allUserIds.add(userId)
  for (const item of (items || [])) {
    if (item.cq_pris_par) allUserIds.add(item.cq_pris_par)
  }

  let userMap: Record<string, { nom: string; prenom: string }> = {}
  if (allUserIds.size > 0) {
    const { data: users } = await adminClient
      .from('users_profile')
      .select('id, nom, prenom')
      .in('id', [...allUserIds])
    if (users) {
      userMap = Object.fromEntries(users.map(u => [u.id, { nom: u.nom, prenom: u.prenom }]))
    }
  }

  // Enrich items
  const enrichedItems = (items || []).map(item => {
    const livreurUserId = item.livreur_id || transitionMap[item.id]
    return {
      ...item,
      livreur: livreurUserId && userMap[livreurUserId] ? userMap[livreurUserId] : null,
      cq_pris_par_nom: item.cq_pris_par && userMap[item.cq_pris_par]
        ? `${userMap[item.cq_pris_par].prenom} ${userMap[item.cq_pris_par].nom}`
        : null,
    }
  })

  // Liste des agents qui ont pris au moins 1 dossier (pour le filtre)
  const { data: agentsRaw } = await adminClient
    .from('livraisons')
    .select('cq_pris_par')
    .eq('statut', 'livree')
    .eq('cq_valide', false)
    .not('cq_pris_par', 'is', null)

  const uniqueAgentIds = [...new Set((agentsRaw || []).map(a => a.cq_pris_par).filter(Boolean))]
  let agents: { id: string; nom: string; prenom: string }[] = []
  if (uniqueAgentIds.length > 0) {
    const { data: agentProfiles } = await adminClient
      .from('users_profile')
      .select('id, nom, prenom')
      .in('id', uniqueAgentIds)
    agents = agentProfiles || []
  }

  // Stats
  const { count: totalNonTraites } = await adminClient
    .from('livraisons')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'livree')
    .eq('cq_valide', false)
    .eq('cq_en_cours', false)

  const { count: totalEnCours } = await adminClient
    .from('livraisons')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'livree')
    .eq('cq_valide', false)
    .eq('cq_en_cours', true)

  const { count: totalSav } = await adminClient
    .from('livraisons')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'livree')
    .eq('cq_valide', false)
    .not('reactivated_at', 'is', null)

  // Compteur d'alertes : dossiers non pris depuis > 1 min
  const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString()
  const { count: alertsCount } = await adminClient
    .from('livraisons')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'livree')
    .eq('cq_valide', false)
    .is('cq_pris_par', null)
    .lt('date_livraison_effective', oneMinAgo)

  // Fire-and-forget : alerter par email si dossiers > 5 min non pris
  checkAndSendAlerts(adminClient).catch(() => {})

  return NextResponse.json({
    items: enrichedItems,
    agents,
    stats: {
      non_traites: totalNonTraites || 0,
      en_cours: totalEnCours || 0,
      sav: totalSav || 0,
      total: count || 0,
    },
    alerts_count: alertsCount || 0,
    pagination: { page, pageSize, total: count || 0 },
  })
}

/**
 * Fire-and-forget : envoie un email d'alerte si des dossiers CQ
 * sont non pris depuis > 5 minutes (et pas déjà alertés).
 */
async function checkAndSendAlerts(adminClient: ReturnType<typeof createAdminClient>) {
  const tenant = getTenantConfig()
  const alertEmail = tenant.emailAlerteCQ
  if (!alertEmail) return

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  // Marquer les alertes AVANT d'envoyer (évite doublons multi-admin)
  const { data: toAlert } = await adminClient
    .from('livraisons')
    .select('id, client:clients!livraisons_client_id_fkey(raison_sociale)')
    .eq('statut', 'livree')
    .eq('cq_valide', false)
    .is('cq_pris_par', null)
    .eq('cq_alerte_envoyee', false)
    .lt('date_livraison_effective', fiveMinAgo)
    .limit(20)

  if (!toAlert || toAlert.length === 0) return

  // Marquer immédiatement
  await adminClient
    .from('livraisons')
    .update({ cq_alerte_envoyee: true })
    .in('id', toAlert.map(l => l.id))

  // Construire et envoyer l'email
  const clientNames = toAlert.map(l => {
    const c = l.client as any
    return c?.raison_sociale || 'N/A'
  })

  await sendEmail({
    to: alertEmail,
    subject: `\u26a0\ufe0f ${toAlert.length} dossier(s) CQ en attente > 5 min \u2014 ${tenant.name}`,
    html: `
      <h2>Alerte Contr\u00f4le Qualit\u00e9 \u2014 ${tenant.name}</h2>
      <p>${toAlert.length} dossier(s) livr\u00e9(s) sont en attente de contr\u00f4le depuis plus de 5 minutes :</p>
      <ul>${clientNames.map(n => `<li>${n}</li>`).join('')}</ul>
      <p>Connectez-vous \u00e0 <a href="${tenant.url}/admin/alertes">l'interface CQ</a> pour les traiter.</p>
    `,
  })
}
