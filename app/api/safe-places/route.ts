import { NextRequest, NextResponse } from 'next/server'
import { query, bboxFilter } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat      = parseFloat(searchParams.get('lat') ?? '')
  const lon      = parseFloat(searchParams.get('lon') ?? '')
  const radius   = Math.min(parseFloat(searchParams.get('radius') ?? '1'), 5)
  const category = searchParams.get('category') ?? null  // comma-separated

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  const { latMin, latMax, lonMin, lonMax } = bboxFilter(lat, lon, radius)
  const cats = category ? category.split(',').map(c => c.trim()) : null

  try {
    const places = await query(`
      SELECT
        id, name, category, address, phone, hours, verified, source,
        lat, lon,
        ROUND(haversine_km(lat, lon, $5, $6)::numeric * 1000) AS distance_m
      FROM safe_places
      WHERE lat BETWEEN $1 AND $2
        AND lon BETWEEN $3 AND $4
        AND haversine_km(lat, lon, $5, $6) < $7
        ${cats ? `AND category = ANY($8)` : ''}
      ORDER BY haversine_km(lat, lon, $5, $6)
      LIMIT 50
    `, cats
      ? [latMin, latMax, lonMin, lonMax, lat, lon, radius, cats]
      : [latMin, latMax, lonMin, lonMax, lat, lon, radius]
    )

    return NextResponse.json({ places, total: places.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
