import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * GET /api/admin/naf
 * Liste paginee des codes NAF avec count clients par code
 * Query params: search, valide (true|false), page, pageSize
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin', 'admin', 'agent_secteur'])
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const valide = searchParams.get('valide')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get('pageSize') || '100')))

    const sortByParam = searchParams.get('sortBy') || 'code'
    const sortOrderParam = searchParams.get('sortOrder') || 'asc'
    const SORTABLE_COLS = ['code', 'label', 'valide', 'created_at', 'updated_at']
    const safeSortBy = SORTABLE_COLS.includes(sortByParam) ? sortByParam : 'code'
    const ascending = sortOrderParam === 'asc'

    const supabase = createAdminClient()

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('naf_codes')
      .select('*', { count: 'exact' })
      .order(safeSortBy, { ascending })
      .range(from, to)

    if (search) {
      query = query.or(`code.ilike.%${search}%,label.ilike.%${search}%`)
    }
    if (valide === 'true') query = query.eq('valide', true)
    if (valide === 'false') query = query.eq('valide', false)

    const { data: codes, count, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Count clients per code in current page
    const codeList = (codes || []).map(c => c.code)
    const clientCounts: Record<string, number> = {}

    if (codeList.length > 0) {
      const { data: countData } = await supabase
        .from('clients')
        .select('code_ape')
        .in('code_ape', codeList)

      for (const row of (countData || [])) {
        if (row.code_ape) {
          clientCounts[row.code_ape] = (clientCounts[row.code_ape] || 0) + 1
        }
      }
    }

    return NextResponse.json({
      naf_codes: (codes || []).map(c => ({
        ...c,
        clients_count: clientCounts[c.code] || 0,
      })),
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
        totalCodes: count || 0,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur GET /api/admin/naf:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
