import { query, bboxFilter } from './db'

// ── Coverage zone detection ────────────────────────────────────

// Zone 1: City of Melbourne street lights (circle, ~4km radius)
const ZONE1_CENTER = { lat: -37.80842, lon: 144.95717 }
const ZONE1_RADIUS_KM = 4.1

// Zone 2: Melbourne metro bounding box (OSM safe places)
const ZONE2 = { latMin: -38.5, latMax: -37.2, lonMin: 144.3, lonMax: 145.8 }

function inZone1(lat: number, lon: number) {
  // Quick bbox pre-check
  const d = Math.sqrt((lat - ZONE1_CENTER.lat) ** 2 + ((lon - ZONE1_CENTER.lon) * Math.cos(lat * Math.PI / 180)) ** 2) * 111
  return d <= ZONE1_RADIUS_KM
}
function inZone2(lat: number, lon: number) {
  return lat >= ZONE2.latMin && lat <= ZONE2.latMax && lon >= ZONE2.lonMin && lon <= ZONE2.lonMax
}

// ── Melbourne current hour ─────────────────────────────────────
function getMelbourneHour(): { hour: number; dayType: 'weekday' | 'weekend' } {
  const now = new Date()
  // Melbourne time string
  const melbStr = now.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', hour12: false })
  // Parse: "DD/MM/YYYY, HH:MM:SS"
  const timePart = melbStr.split(', ')[1] ?? '12:00:00'
  const hour = parseInt(timePart.split(':')[0])

  const melbDate = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }))
  const dow = melbDate.getDay()  // 0=Sun, 6=Sat
  const dayType = (dow === 0 || dow === 6) ? 'weekend' : 'weekday'

  return { hour: isNaN(hour) ? 12 : hour, dayType }
}

// ── Factor: lighting (Zone 1 only) ────────────────────────────
async function getLightingScore(lat: number, lon: number): Promise<number> {
  const { latMin, latMax, lonMin, lonMax } = bboxFilter(lat, lon, 0.3)
  const rows = await query<{ avg_lux: number; count: string }>(`
    SELECT AVG(lux_level) AS avg_lux, COUNT(*) AS count
    FROM street_lights
    WHERE lat BETWEEN $1 AND $2
      AND lon BETWEEN $3 AND $4
      AND lux_level IS NOT NULL
      AND haversine_km(lat, lon, $5, $6) < 0.3
  `, [latMin, latMax, lonMin, lonMax, lat, lon])

  const { avg_lux, count } = rows[0]
  if (!avg_lux || Number(count) === 0) return 0
  return Math.min(25, Math.round((Number(avg_lux) / 30) * 25))
}

const COM_COUNTS_API = 'https://data.melbourne.vic.gov.au/api/v2/catalog/datasets/pedestrian-counting-system-monthly-counts-per-hour/records'

// ── Factor: footfall — realtime first, fallback to historical ──
async function getFootfallScore(lat: number, lon: number): Promise<number | null> {
  const { latMin, latMax, lonMin, lonMax } = bboxFilter(lat, lon, 0.8)

  const sensors = await query<{ sensor_id: string }>(`
    SELECT sensor_id FROM pedestrian_sensors
    WHERE lat BETWEEN $1 AND $2
      AND lon BETWEEN $3 AND $4
      AND active = true
    ORDER BY haversine_km(lat, lon, $5, $6)
    LIMIT 1
  `, [latMin, latMax, lonMin, lonMax, lat, lon])

  if (!sensors.length) return null

  const sid = sensors[0].sensor_id
  const { hour, dayType } = getMelbourneHour()

  // Try real-time first
  let count: number | null = null
  try {
    const now = new Date()
    const melbDate = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }))
    const date = melbDate.toISOString().slice(0, 10)
    const url = `${COM_COUNTS_API}?limit=1&where=location_id=${sid} AND sensing_date='${date}' AND hourday=${hour}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data = await res.json()
      const f = data.records?.[0]?.record?.fields
      if (f?.pedestriancount !== undefined) count = f.pedestriancount
    }
  } catch { /* fallthrough */ }

  // Fallback to historical average
  if (count === null) {
    const rows = await query<{ avg_count: number }>(`
      SELECT avg_count FROM pedestrian_hourly_avg
      WHERE sensor_id = $1 AND hour_of_day = $2 AND day_type = $3
    `, [sid, hour, dayType])
    if (!rows.length) return null
    count = Math.round(Number(rows[0].avg_count))
  }

  return Math.min(25, Math.round((count / 200) * 25))
}

// ── Factor: facilities (Zone 2) ───────────────────────────────
async function getFacilityScore(lat: number, lon: number): Promise<number> {
  const { latMin, latMax, lonMin, lonMax } = bboxFilter(lat, lon, 2)
  const rows = await query<{ dist_km: number }>(`
    SELECT haversine_km(lat, lon, $5, $6) AS dist_km
    FROM safe_places
    WHERE lat BETWEEN $1 AND $2
      AND lon BETWEEN $3 AND $4
      AND category IN ('police', 'hospital')
    ORDER BY haversine_km(lat, lon, $5, $6)
    LIMIT 1
  `, [latMin, latMax, lonMin, lonMax, lat, lon])

  if (!rows.length) return 0
  const d = rows[0].dist_km
  if (d < 0.3) return 25
  if (d < 0.5) return 20
  if (d < 1.0) return 14
  if (d < 2.0) return 8
  return 3
}

// ── Factor: crime (all Victoria via LGA centroids) ────────────
async function getCrimeScore(lat: number, lon: number): Promise<number> {
  const rows = await query<{ rate: number }>(`
    SELECT AVG(avg_rate) AS rate
    FROM (
      SELECT suburb, AVG(rate_per_100k) AS avg_rate,
             MIN(haversine_km(suburb_lat, suburb_lon, $1, $2)) AS dist
      FROM crime_stats
      WHERE year >= EXTRACT(YEAR FROM NOW())::int - 3
        AND offence_type IN ('assault', 'robbery', 'sexual_offence', 'harassment')
        AND suburb_lat IS NOT NULL
      GROUP BY suburb
      ORDER BY dist
      LIMIT 3
    ) nearest
  `, [lat, lon])

  if (!rows.length || !rows[0].rate) return 0
  const rate = Number(rows[0].rate)
  if (rate < 200)  return 25
  if (rate < 400)  return 20
  if (rate < 600)  return 15
  if (rate < 900)  return 8
  return 3
}

// ── Types ──────────────────────────────────────────────────────
export interface FactorResult {
  score: number
  max:   number
  available: boolean
}

export interface SafetyFactors {
  lighting:   FactorResult
  footfall:   FactorResult
  facilities: FactorResult
  crime:      FactorResult
}

export interface SafetyResult {
  score:   number        // 0–100, normalized to available factors
  grade:   'A' | 'B' | 'C' | 'D' | 'F'
  label:   string
  factors: SafetyFactors
  dataZone: 1 | 2 | 3   // which coverage zone
  note:    string
}

// ── Main ───────────────────────────────────────────────────────
export async function computeSafety(lat: number, lon: number): Promise<SafetyResult> {
  const zone1 = inZone1(lat, lon)
  const zone2 = inZone2(lat, lon)
  const dataZone: 1 | 2 | 3 = zone1 ? 1 : zone2 ? 2 : 3

  // Run all available factors in parallel
  const [lightingRaw, footfallRaw, facilityRaw, crimeRaw] = await Promise.all([
    zone1 ? getLightingScore(lat, lon) : Promise.resolve(null as null),
    getFootfallScore(lat, lon),
    zone2 ? getFacilityScore(lat, lon) : Promise.resolve(null as null),
    getCrimeScore(lat, lon),
  ])

  const factors: SafetyFactors = {
    lighting:   { score: lightingRaw  ?? 0, max: 25, available: lightingRaw  !== null },
    footfall:   { score: footfallRaw  ?? 0, max: 25, available: footfallRaw  !== null },
    facilities: { score: facilityRaw  ?? 0, max: 25, available: facilityRaw  !== null },
    crime:      { score: crimeRaw        , max: 25, available: true },
  }

  // Normalize to 100 based only on available factors
  const rawSum = Object.values(factors).reduce((s, f) => s + (f.available ? f.score : 0), 0)
  const maxPossible = Object.values(factors).reduce((s, f) => s + (f.available ? f.max : 0), 0)
  const score = maxPossible > 0 ? Math.round((rawSum / maxPossible) * 100) : 0

  const grade =
    score >= 80 ? 'A' :
    score >= 65 ? 'B' :
    score >= 50 ? 'C' :
    score >= 35 ? 'D' : 'F'

  const availableCount = Object.values(factors).filter(f => f.available).length

  const noteZh = dataZone === 1
    ? `基于${availableCount}项数据维度（路灯、人流、设施、犯罪）综合评分`
    : dataZone === 2
    ? `基于${availableCount}项数据维度（设施距离、犯罪统计），此区域无路灯数据`
    : `仅基于犯罪统计，此区域超出详细数据覆盖范围`

  return {
    score,
    grade,
    label: grade === 'A' ? '区域较安全'
         : grade === 'B' ? '基本安全，注意周围'
         : grade === 'C' ? '一般，保持警觉'
         : grade === 'D' ? '较危险，建议结伴'
         :                 '高风险区域',
    factors,
    dataZone,
    note: noteZh,
  }
}
