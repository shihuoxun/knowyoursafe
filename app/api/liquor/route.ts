import { NextRequest, NextResponse } from 'next/server'
import { query, bboxFilter } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat    = parseFloat(searchParams.get('lat') ?? '')
  const lon    = parseFloat(searchParams.get('lon') ?? '')
  const radius = Math.min(parseFloat(searchParams.get('radius') ?? '0.5'), 2)

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  const { latMin, latMax, lonMin, lonMax } = bboxFilter(lat, lon, radius)

  try {
    const venues = await query(`
      SELECT id, lat, lon, name, license_type, address, suburb,
             ROUND(haversine_km(lat, lon, $5, $6)::numeric * 1000) AS distance_m
      FROM liquor_licenses
      WHERE lat BETWEEN $1 AND $2
        AND lon BETWEEN $3 AND $4
        AND active = true
        AND haversine_km(lat, lon, $5, $6) < $7
      ORDER BY haversine_km(lat, lon, $5, $6)
      LIMIT 80
    `, [latMin, latMax, lonMin, lonMax, lat, lon, radius])

    return NextResponse.json({ venues, total: venues.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
