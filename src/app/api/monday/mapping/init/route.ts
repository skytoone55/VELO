import { NextResponse } from 'next/server'
import { initializeMappingsFromConfig } from '@/lib/monday/dynamic-mapping'

/**
 * POST /api/monday/mapping/init
 * Initialise les mappings dans la base depuis la config hardcodée
 * À utiliser une fois pour migrer vers le système dynamique
 */
export async function POST() {
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
  return NextResponse.json({
    endpoint: '/api/monday/mapping/init',
    method: 'POST',
    description: 'Initialise les mappings dans la base depuis la config hardcodée',
  })
}
