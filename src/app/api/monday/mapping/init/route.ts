import { NextResponse } from 'next/server'
import { initializeMappingsFromConfig } from '@/lib/monday/dynamic-mapping'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

/**
 * POST /api/monday/mapping/init
 * Initialise les mappings dans la base depuis la config hardcodée
 * À utiliser une fois pour migrer vers le système dynamique
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
      message: `${result.count} mappings initialisés depuis la config`,
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
    description: 'Initialise les mappings dans la base depuis la config hardcodée',
  })
}
