import { NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

// ---------------------------------------------------------------------------
// Automatisation ANOMALIE DEBRANCHEE (decision John, 2026-06-02).
//
// Cette route detectait les clients "a_livrer" depuis +10 jours ouvres sans
// creneau et les basculait automatiquement au statut "anomalie". Le statut
// "anomalie" a ete retire du parcours (PROCESS_STATUTS_NON_SELECTABLES) car
// juge sans interet. La bascule automatique est donc desactivee.
//
// On conserve la route en stub (au lieu de la supprimer) pour neutraliser tout
// appel residuel : elle ne modifie plus aucune donnee. L'implementation
// d'origine reste disponible dans l'historique git si besoin de la reactiver.
// ---------------------------------------------------------------------------

export async function POST() {
  const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
  if (isAuthError(auth)) return auth

  return NextResponse.json(
    {
      disabled: true,
      message: 'Detection automatique des anomalies desactivee (statut "anomalie" retire du parcours).',
      updated: 0,
    },
    { status: 410 },
  )
}
