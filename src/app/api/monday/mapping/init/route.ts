import { NextResponse } from 'next/server'
import { initializeMappingsFromConfig } from '@/lib/monday/dynamic-mapping'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/monday/mapping/init
 * Initialise les mappings dans la base depuis la config hardcod\u00e9e
 * \u00c0 utiliser une fois pour migrer vers le syst\u00e8me dynamique
 */
export async function POST() {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  try {
    const result = await initializeMappingsFromConfig()

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Erreur lors de l\'initialisation' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${result.count} mappings initialis\u00e9s depuis la config`,
      count: result.count,
    })
  } catch (error: any) {
    console.error('Erreur init mappings:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const auth = await requireRole(['super_admin', 'admin'])
  if (isAuthError(auth)) return auth

  return NextResponse.json({
    endpoint: '/api/monday/mapping/init',
    method: 'POST',
    description: 'Initialise les mappings dans la base depuis la config hardcod\u00e9e',
  })
}
