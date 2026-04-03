import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const VALID_CATEGORIES = ['unsafe', 'harassment', 'poor_lighting', 'isolated', 'other']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lat, lon, category, description, timeOfDay, anonId } = body

    if (
      typeof lat !== 'number' || typeof lon !== 'number' ||
      !VALID_CATEGORIES.includes(category)
    ) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Melbourne bounding box check
    if (lat < -38.5 || lat > -37.2 || lon < 144.3 || lon > 145.8) {
      return NextResponse.json({ error: '仅支持墨尔本范围内的举报' }, { status: 400 })
    }

    const rows = await query(`
      INSERT INTO safety_reports (lat, lon, category, description, time_of_day, anon_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [lat, lon, category, description ?? null, timeOfDay ?? null, anonId ?? null])

    return NextResponse.json({ id: rows[0].id, message: '举报已提交，感谢您的贡献' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat    = parseFloat(searchParams.get('lat') ?? '')
  const lon    = parseFloat(searchParams.get('lon') ?? '')
  const radius = Math.min(parseFloat(searchParams.get('radius') ?? '0.5'), 2)
  const hours  = Math.min(parseInt(searchParams.get('hours') ?? '24'), 168)  // max 1 week

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  try {
    const reports = await query(`
      SELECT id, lat, lon, category, description, time_of_day, reported_at, upvotes,
             ROUND(haversine_km(lat, lon, $3, $4)::numeric * 1000) AS distance_m
      FROM safety_reports
      WHERE haversine_km(lat, lon, $3, $4) < $1
        AND reported_at > NOW() - ($2 || ' hours')::INTERVAL
      ORDER BY reported_at DESC
      LIMIT 100
    `, [radius, hours, lat, lon])

    return NextResponse.json({ reports, total: reports.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
