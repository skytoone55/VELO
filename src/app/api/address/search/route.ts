import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.length < 3) {
      return NextResponse.json({ features: [] })
    }

    const response = await fetch(
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`
    )

    if (!response.ok) {
      throw new Error('Erreur API adresse')
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error: any) {
    console.error('Erreur recherche adresse:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur', features: [] },
      { status: 500 }
    )
  }
}
