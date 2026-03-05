import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/clients/departements
 * Retourne les valeurs distinctes de departements pour le filtre dropdown.
 * PPE : codes departement francais (75, 93, 44, etc.)
 * Si departement vide, derive du code postal (2 premiers chiffres).
 */
export async function GET() {
  try {
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('clients')
      .select('departement, adresse_societe_cp')
      .not('monday_sync_status', 'eq', 'deleted')

    if (error) throw error

    const depts = new Set<string>()
    data?.forEach(d => {
      const dept = d.departement || (d.adresse_societe_cp ? d.adresse_societe_cp.substring(0, 2) : null)
      if (dept) depts.add(dept)
    })

    return NextResponse.json([...depts].sort())
  } catch (error) {
    console.error('Erreur recuperation departements:', error)
    return NextResponse.json([], { status: 500 })
  }
}
