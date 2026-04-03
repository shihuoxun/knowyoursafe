/**
 * Seed safe_places table from OpenStreetMap via Overpass API.
 * Run once (and re-run any time to refresh):
 *   node scripts/seed-safe-places.mjs
 *
 * Requires DATABASE_URL in .env.local or environment.
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load .env.local ────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(resolve(__dir, '../.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
} catch { /* .env.local optional */ }

// ── DB ─────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// ── Overpass query ─────────────────────────────────────────────
// Melbourne bounding box: S -38.5, W 144.3, N -37.2, E 145.8
const BBOX = '-38.5,144.3,-37.2,145.8'

const QUERIES = {
  police: `
    [out:json][timeout:60];
    (
      node["amenity"="police"](${BBOX});
      way["amenity"="police"](${BBOX});
      relation["amenity"="police"](${BBOX});
    );
    out center tags;`,

  hospital: `
    [out:json][timeout:60];
    (
      node["amenity"~"hospital|clinic"](${BBOX});
      way["amenity"~"hospital|clinic"](${BBOX});
    );
    out center tags;`,

  pharmacy: `
    [out:json][timeout:60];
    (
      node["amenity"="pharmacy"](${BBOX});
      way["amenity"="pharmacy"](${BBOX});
    );
    out center tags;`,

  safe_place: `
    [out:json][timeout:60];
    (
      node["amenity"="community_centre"](${BBOX});
      way["amenity"="community_centre"](${BBOX});
      node["amenity"="social_facility"](${BBOX});
    );
    out center tags;`,

  ptv: `
    [out:json][timeout:60];
    (
      node["railway"~"station|halt"](${BBOX});
      node["public_transport"="station"](${BBOX});
    );
    out center tags;`,
}

// ── Overpass fetch with retry ──────────────────────────────────
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

async function overpassQuery(ql) {
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(ql),
        signal: AbortSignal.timeout(70_000),
      })
      if (!res.ok) continue
      const json = await res.json()
      return json.elements ?? []
    } catch (e) {
      console.warn(`  ${endpoint} failed: ${e.message}`)
    }
  }
  throw new Error('All Overpass endpoints failed')
}

// ── Extract lat/lon from node or way/relation (center) ────────
function getLatLon(el) {
  if (el.type === 'node') return { lat: el.lat, lon: el.lon }
  if (el.center)          return { lat: el.center.lat, lon: el.center.lon }
  return null
}

// ── Insert rows ────────────────────────────────────────────────
async function upsertPlaces(category, elements) {
  let inserted = 0
  for (const el of elements) {
    const coords = getLatLon(el)
    if (!coords) continue
    const t = el.tags ?? {}
    const name    = t.name ?? t['name:en'] ?? t.operator ?? `${category} (OSM ${el.id})`
    const address = [t['addr:housenumber'], t['addr:street'], t['addr:suburb']]
      .filter(Boolean).join(' ')
    const phone   = t.phone ?? t['contact:phone'] ?? null
    const hours   = t.opening_hours ?? null

    await pool.query(`
      INSERT INTO safe_places (lat, lon, name, category, address, phone, hours, verified, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'osm')
      ON CONFLICT DO NOTHING
    `, [coords.lat, coords.lon, name, category, address || null, phone, hours])
    inserted++
  }
  return inserted
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log('Melbourne Safe Places — OSM seed script\n')

  for (const [category, ql] of Object.entries(QUERIES)) {
    process.stdout.write(`Fetching ${category}… `)
    try {
      const elements = await overpassQuery(ql)
      console.log(`${elements.length} elements found`)
      const n = await upsertPlaces(category, elements)
      console.log(`  → ${n} rows inserted into safe_places\n`)
    } catch (e) {
      console.error(`  ERROR: ${e.message}\n`)
    }
  }

  const { rows } = await pool.query('SELECT category, COUNT(*) FROM safe_places GROUP BY category ORDER BY category')
  console.log('Current safe_places counts:')
  for (const r of rows) console.log(`  ${r.category}: ${r.count}`)

  await pool.end()
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
