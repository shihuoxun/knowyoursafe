import { NextRequest, NextResponse } from 'next/server'
import { query, bboxFilter } from '@/lib/db'

const COM_API = 'https://data.melbourne.vic.gov.au/api/v2/catalog/datasets/pedestrian-counting-system-monthly-counts-per-hour/records'

// Melbourne time helpers
function getMelbourneDateTime() {
  const now = new Date()
  const melbStr = now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' })
  const melb = new Date(melbStr)
  return {
    date: melb.toISOString().slice(0, 10),        // YYYY-MM-DD
    hour: melb.getHours(),                         // 0-23
    dow:  melb.getDay(),                           // 0=Sun,6=Sat
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lon = parseFloat(searchParams.get('lon') ?? '')

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  const { latMin, latMax, lonMin, lonMax } = bboxFilter(lat, lon, 0.8)

  // Find nearest active sensor
  const sensors = await query<{ sensor_id: string; name: string; lat: number; lon: number; dist_km: number }>(`
    SELECT sensor_id, name, lat, lon,
           haversine_km(lat, lon, $5, $6) AS dist_km
    FROM pedestrian_sensors
    WHERE lat BETWEEN $1 AND $2
      AND lon BETWEEN $3 AND $4
      AND active = true
    ORDER BY haversine_km(lat, lon, $5, $6)
    LIMIT 1
  `, [latMin, latMax, lonMin, lonMax, lat, lon])

  if (!sensors.length) {
    return NextResponse.json({ available: false, message: '附近暂无人流传感器' })
  }

  const { sensor_id, name, dist_km } = sensors[0]
  const { date, hour, dow } = getMelbourneDateTime()
  const dayType = (dow === 0 || dow === 6) ? 'weekend' : 'weekday'

  // ── Try real-time: fetch today's last 3 hours from CoM API ──
  let currentCount: number | null = null
  let prevCount: number | null = null
  let dataSource: 'realtime' | 'historical' = 'historical'
  let updatedAt: string | null = null

  try {
    const prevHour = hour > 0 ? hour - 1 : 23
    const prevDate = hour > 0 ? date : new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    const url = `${COM_API}?limit=10&where=location_id=${sensor_id} AND sensing_date='${date}' AND hourday IN (${prevHour},${hour})`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 900 } })

    if (res.ok) {
      const data = await res.json()
      const records: any[] = data.records ?? []
      for (const rec of records) {
        const f = rec.record.fields
        if (f.sensing_date === date && f.hourday === hour) {
          currentCount = f.pedestriancount
          updatedAt = `${f.sensing_date}T${String(f.hourday).padStart(2, '0')}:00`
        }
        if (f.sensing_date === prevDate && f.hourday === prevHour) {
          prevCount = f.pedestriancount
        }
      }
      if (currentCount !== null) dataSource = 'realtime'
    }
  } catch {
    // API unavailable → fall through to historical
  }

  // ── Fallback: historical average for this hour ──────────────
  if (currentCount === null) {
    const rows = await query<{ avg_count: number }>(`
      SELECT avg_count FROM pedestrian_hourly_avg
      WHERE sensor_id = $1 AND hour_of_day = $2 AND day_type = $3
    `, [sensor_id, hour, dayType])
    if (rows.length) currentCount = Math.round(Number(rows[0].avg_count))

    // Previous hour historical
    const prevHourNum = hour > 0 ? hour - 1 : 23
    const prevRows = await query<{ avg_count: number }>(`
      SELECT avg_count FROM pedestrian_hourly_avg
      WHERE sensor_id = $1 AND hour_of_day = $2 AND day_type = $3
    `, [sensor_id, prevHourNum, dayType])
    if (prevRows.length) prevCount = Math.round(Number(prevRows[0].avg_count))
  }

  const current = currentCount ?? 0

  const trend = (currentCount !== null && prevCount !== null)
    ? currentCount > prevCount * 1.15 ? 'rising'
    : currentCount < prevCount * 0.85 ? 'falling'
    : 'stable'
    : 'stable'

  return NextResponse.json({
    available:      true,
    sensorName:     name,
    distanceMeters: Math.round(dist_km * 1000),
    current,
    trend,
    dataSource,   // 'realtime' or 'historical'
    updatedAt:    updatedAt ?? `historical avg for ${dayType} ${hour}:00`,
    level:
      current > 200 ? 'busy' :
      current > 80  ? 'moderate' :
      current > 20  ? 'quiet' : 'empty',
  })
}
