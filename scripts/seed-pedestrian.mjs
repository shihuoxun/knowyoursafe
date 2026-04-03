/**
 * Seed pedestrian sensor locations + historical hourly averages.
 *
 * Sources:
 *   - Sensor locations: CoM open data CSV (already downloaded)
 *   - Hourly counts: CoM API, last 6 months, fetched in pages
 *
 * Run: node scripts/seed-pedestrian.mjs
 */

import pg from 'pg'
import { readFileSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = resolve(__dir, '..')

try {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
} catch {}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// ── Parse semicolon CSV ────────────────────────────────────────
async function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const lines = []
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    rl.on('line', l => lines.push(l))
    rl.on('close', () => resolve(lines))
    rl.on('error', reject)
  })
}
function parseLine(line, delim = ';') {
  const fields = []; let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (ch === delim && !inQ) { fields.push(cur.trim()); cur = '' }
    else cur += ch
  }
  fields.push(cur.trim())
  return fields
}

// ── Step 1: sensor locations ───────────────────────────────────
async function seedSensors() {
  process.stdout.write('Seeding sensor locations… ')
  const lines = await readCsv(resolve(ROOT, 'data/pedestrian_sensors.csv'))
  const headers = parseLine(lines[0])
  const idIdx   = headers.indexOf('location_id')
  const nameIdx = headers.indexOf('sensor_description')
  const latIdx  = headers.indexOf('latitude')
  const lonIdx  = headers.indexOf('longitude')
  const statIdx = headers.indexOf('status')

  await pool.query('DELETE FROM pedestrian_sensors')
  let n = 0
  for (let i = 1; i < lines.length; i++) {
    const f = parseLine(lines[i])
    const lat    = parseFloat(f[latIdx])
    const lon    = parseFloat(f[lonIdx])
    const sensorId = f[idIdx]?.toString().trim()
    if (!sensorId || isNaN(lat) || isNaN(lon)) continue
    const active = (f[statIdx] ?? '').trim().toUpperCase() === 'A'
    await pool.query(`
      INSERT INTO pedestrian_sensors (sensor_id, lat, lon, name, active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (sensor_id) DO UPDATE SET lat=$2, lon=$3, name=$4, active=$5
    `, [sensorId, lat, lon, f[nameIdx]?.trim() ?? sensorId, active])
    n++
  }
  console.log(`${n} sensors`)
}

// ── Step 2: fetch counts from CoM API ─────────────────────────
async function fetchCounts() {
  // Last 6 months
  const since = new Date()
  since.setMonth(since.getMonth() - 6)
  const sinceStr = since.toISOString().slice(0, 10)

  const BASE = 'https://data.melbourne.vic.gov.au/api/v2/catalog/datasets/pedestrian-counting-system-monthly-counts-per-hour/records'
  const PAGE = 100
  let offset = 0
  let total = 0

  // sensor_id → hour_of_day → day_type → [counts]
  const buckets = new Map()

  console.log(`Fetching counts since ${sinceStr}…`)

  while (true) {
    const url = `${BASE}?limit=${PAGE}&offset=${offset}&where=sensing_date>='${sinceStr}'`
    let data
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
    } catch (e) {
      console.error(`  Fetch error at offset ${offset}: ${e.message}`)
      break
    }

    const records = data.records ?? []
    if (records.length === 0) break

    for (const rec of records) {
      const f  = rec.record.fields
      const sid = String(f.location_id)
      const hour = f.hourday   // 0-23
      const count = f.pedestriancount ?? 0
      const date = new Date(f.sensing_date)
      const dow = date.getDay()  // 0=Sun,6=Sat
      const dayType = (dow === 0 || dow === 6) ? 'weekend' : 'weekday'

      const key = `${sid}|${hour}|${dayType}`
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(count)
    }

    total += records.length
    offset += PAGE
    process.stdout.write(`\r  Fetched ${total} records…`)

    // API caps at 10000 records per query - if we hit the ceiling, adjust date range
    if (offset >= 10000) {
      console.log(`\n  Hit API limit (10000). Using ${total} records for averages.`)
      break
    }

    if (records.length < PAGE) break
  }
  console.log(`\n  Total records: ${total}, unique buckets: ${buckets.size}`)
  return buckets
}

// ── Step 3: write averages to DB ───────────────────────────────
async function writeAverages(buckets) {
  process.stdout.write('Writing hourly averages… ')
  await pool.query('DELETE FROM pedestrian_hourly_avg')

  let n = 0
  for (const [key, counts] of buckets) {
    const [sid, hourStr, dayType] = key.split('|')
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length
    await pool.query(`
      INSERT INTO pedestrian_hourly_avg (sensor_id, hour_of_day, day_type, avg_count, sample_days)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (sensor_id, hour_of_day, day_type) DO UPDATE
        SET avg_count=$4, sample_days=$5
    `, [sid, parseInt(hourStr), dayType, Math.round(avg * 10) / 10, counts.length])
    n++
  }
  console.log(`${n} rows`)
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log('Pedestrian Data Seed\n')
  await seedSensors()
  const buckets = await fetchCounts()
  await writeAverages(buckets)

  const { rows } = await pool.query(`
    SELECT s.sensor_id, s.name,
           ROUND(AVG(CASE WHEN a.day_type='weekday' AND a.hour_of_day BETWEEN 17 AND 20 THEN a.avg_count END)::numeric,0) AS peak_evening_avg
    FROM pedestrian_sensors s
    JOIN pedestrian_hourly_avg a ON a.sensor_id = s.sensor_id::text
    GROUP BY s.sensor_id, s.name
    ORDER BY peak_evening_avg DESC NULLS LAST
    LIMIT 5
  `)
  console.log('\nTop 5 sensors by Friday evening average:')
  rows.forEach(r => console.log(`  ${r.name}: ${r.peak_evening_avg ?? 'n/a'}/hr`))

  await pool.end()
  console.log('\nDone.')
}
main().catch(e => { console.error(e); process.exit(1) })
