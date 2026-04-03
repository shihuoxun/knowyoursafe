import { NextRequest, NextResponse } from 'next/server'
import { computeSafety } from '@/lib/safety-score'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lon = parseFloat(searchParams.get('lon') ?? '')

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  try {
    const result = await computeSafety(lat, lon)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
