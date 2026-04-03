/**
 * Import street lighting data into street_lights table.
 * Sources:
 *   data/street_lights_lux.csv  — council-owned lights with Lux values
 *   data/feature_lighting.csv   — feature/decorative lights with wattage
 *
 * Run: node scripts/seed-street-lights.mjs
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = resolve(__dir, '..')

// Load .env.local
try {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
} catch {}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// ── Wattage → approximate Lux conversion ──────────────────────
// Very rough estimate for street light context
function wattsToLux(watts) {
  const w = parseFloat(watts)
  if (!w || isNaN(w)) return null
  if (w >= 250) return 30
  if (w >= 150) return 20
  if (w >= 70)  return 15
  if (w >= 35)  return 10
  return 5
}

// ── Parse semicolon-delimited CSV line (handles quoted fields) ─
function parseCsvLine(line, delim = ';') {
  const fields = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQ = !inQ }
    else if (ch === delim && !inQ) { fields.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  fields.push(cur.trim())
  return fields
}

// ── Stream-read CSV and collect rows ──────────────────────────
async function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const lines = []
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    rl.on('line', l => lines.push(l))
    rl.on('close', () => resolve(lines))
    rl.on('error', reject)
  })
}

// ── Bulk insert helper ─────────────────────────────────────────
async function bulkInsert(rows) {
  // Insert in batches of 500
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const values = batch.map((r, j) => {
      const base = j * 4
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4})`
    }).join(', ')
    const params = batch.flatMap(r => [r.lat, r.lon, r.lux, r.source])
    await pool.query(`
      INSERT INTO street_lights (lat, lon, lux_level, source)
      VALUES ${values}
      ON CONFLICT DO NOTHING
    `, params)
    total += batch.length
  }
  return total
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log('Street Lighting Import\n')

  // Clear existing
  await pool.query("DELETE FROM street_lights")
  console.log('Cleared existing street_lights rows\n')

  // ── 1. street_lights_lux.csv ──────────────────────────────
  process.stdout.write('Reading street_lights_lux.csv… ')
  const luxLines = await readCsv(resolve(ROOT, 'data/street_lights_lux.csv'))
  console.log(`${luxLines.length - 1} data rows`)

  const luxHeaders = parseCsvLine(luxLines[0])
  const geoIdx  = luxHeaders.indexOf('geo_point_2d')
  const luxIdx  = luxHeaders.indexOf('label')   // 'label' column holds lux value

  const luxRows = []
  let skipped = 0
  for (let i = 1; i < luxLines.length; i++) {
    const fields = parseCsvLine(luxLines[i])
    const geo = fields[geoIdx] ?? ''
    const lux = parseFloat(fields[luxIdx])

    // geo_point_2d format: "-37.813, 144.942"
    const parts = geo.split(',')
    if (parts.length !== 2) { skipped++; continue }
    const lat = parseFloat(parts[0])
    const lon = parseFloat(parts[1])
    if (isNaN(lat) || isNaN(lon) || isNaN(lux) || lux <= 0) { skipped++; continue }

    luxRows.push({ lat, lon, lux, source: 'com_lux' })
  }
  console.log(`  Valid rows: ${luxRows.length} (skipped ${skipped})`)
  process.stdout.write('  Inserting… ')
  const n1 = await bulkInsert(luxRows)
  console.log(`${n1} inserted\n`)

  // ── 2. feature_lighting.csv ───────────────────────────────
  process.stdout.write('Reading feature_lighting.csv… ')
  const featLines = await readCsv(resolve(ROOT, 'data/feature_lighting.csv'))
  console.log(`${featLines.length - 1} data rows`)

  const featHeaders = parseCsvLine(featLines[0])
  const latIdx  = featHeaders.indexOf('lat')
  const lonIdx  = featHeaders.indexOf('lon')
  const wattIdx = featHeaders.indexOf('lamp_rating_w')

  const featRows = []
  let skipped2 = 0
  for (let i = 1; i < featLines.length; i++) {
    const fields = parseCsvLine(featLines[i])
    const lat = parseFloat(fields[latIdx])
    const lon = parseFloat(fields[lonIdx])
    const lux = wattsToLux(fields[wattIdx])
    if (isNaN(lat) || isNaN(lon) || !lux) { skipped2++; continue }
    featRows.push({ lat, lon, lux, source: 'com_feature' })
  }
  console.log(`  Valid rows: ${featRows.length} (skipped ${skipped2})`)
  process.stdout.write('  Inserting… ')
  const n2 = await bulkInsert(featRows)
  console.log(`${n2} inserted\n`)

  // Summary
  const { rows } = await pool.query(`
    SELECT source, COUNT(*) AS n, ROUND(AVG(lux_level)::numeric,1) AS avg_lux
    FROM street_lights GROUP BY source ORDER BY source
  `)
  console.log('street_lights summary:')
  for (const r of rows) console.log(`  ${r.source}: ${r.n} lights, avg ${r.avg_lux} lux`)

  await pool.end()
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
