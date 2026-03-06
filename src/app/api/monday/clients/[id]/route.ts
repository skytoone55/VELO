import { NextRequest, NextResponse } from 'next/server'

const DISABLED_MSG = { status: 'disabled', message: 'Monday read API is disabled. Supabase is the source of truth.' }

export async function GET() {
  return NextResponse.json(DISABLED_MSG, { status: 410 })
}

export async function PUT(request: NextRequest) {
  return NextResponse.json(DISABLED_MSG, { status: 410 })
}
