/**
 * Import crime statistics into crime_stats table.
 * Source: data/crime_lga_offences.xlsx — Table 02 (offence type breakdown by LGA)
 *
 * Run: node scripts/seed-crime-stats.mjs
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

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

// ── LGA centroids (Melbourne metro) ───────────────────────────
// Approximate geographic centre of each LGA
const LGA_CENTROIDS = {
  'Melbourne':          { lat: -37.8136, lon: 144.9631 },
  'Port Phillip':       { lat: -37.8650, lon: 144.9690 },
  'Yarra':              { lat: -37.8010, lon: 145.0020 },
  'Stonnington':        { lat: -37.8530, lon: 145.0170 },
  'Boroondara':         { lat: -37.8270, lon: 145.0720 },
  'Whitehorse':         { lat: -37.8180, lon: 145.1540 },
  'Manningham':         { lat: -37.7720, lon: 145.1820 },
  'Darebin':            { lat: -37.7530, lon: 145.0010 },
  'Moreland':           { lat: -37.7410, lon: 144.9620 },
  'Moonee Valley':      { lat: -37.7540, lon: 144.9180 },
  'Maribyrnong':        { lat: -37.7960, lon: 144.8910 },
  'Hobsons Bay':        { lat: -37.8540, lon: 144.8750 },
  'Wyndham':            { lat: -37.9060, lon: 144.7160 },
  'Brimbank':           { lat: -37.7450, lon: 144.8300 },
  'Hume':               { lat: -37.6680, lon: 144.9250 },
  'Whittlesea':         { lat: -37.6080, lon: 145.0980 },
  'Nillumbik':          { lat: -37.6250, lon: 145.2100 },
  'Knox':               { lat: -37.8810, lon: 145.2360 },
  'Monash':             { lat: -37.8780, lon: 145.1230 },
  'Glen Eira':          { lat: -37.9000, lon: 145.0310 },
  'Bayside':            { lat: -37.9210, lon: 145.0060 },
  'Kingston':           { lat: -37.9730, lon: 145.0790 },
  'Greater Dandenong':  { lat: -37.9890, lon: 145.2120 },
  'Casey':              { lat: -38.0560, lon: 145.3040 },
  'Cardinia':           { lat: -38.0930, lon: 145.4690 },
  'Frankston':          { lat: -38.1430, lon: 145.1230 },
  'Mornington Peninsula': { lat: -38.3340, lon: 145.2010 },
  'Melton':             { lat: -37.6770, lon: 144.6070 },
  'Moorabool':          { lat: -37.6650, lon: 144.2530 },
  'Geelong':            { lat: -38.1490, lon: 144.3610 },
  'Surf Coast':         { lat: -38.3300, lon: 144.0960 },
  'Colac-Otway':        { lat: -38.3400, lon: 143.5900 },
  'Ballarat':           { lat: -37.5622, lon: 143.8503 },
  'Bendigo':            { lat: -36.7570, lon: 144.2794 },
  'Latrobe':            { lat: -38.2333, lon: 146.4333 },
  'East Gippsland':     { lat: -37.5520, lon: 148.1530 },
  'Mitchell':           { lat: -37.1050, lon: 145.1390 },
  'Murrindindi':        { lat: -37.3180, lon: 145.6640 },
  'Alpine':             { lat: -36.8930, lon: 147.1570 },
  'Towong':             { lat: -36.6360, lon: 147.7520 },
  'Indigo':             { lat: -36.3760, lon: 146.8880 },
  'Wodonga':            { lat: -36.1210, lon: 146.8880 },
  'Wangaratta':         { lat: -36.3590, lon: 146.3130 },
  'Benalla':            { lat: -36.5540, lon: 145.9820 },
  'Campaspe':           { lat: -36.3280, lon: 144.7280 },
  'Moira':              { lat: -36.1540, lon: 145.4490 },
  'Shepparton':         { lat: -36.3803, lon: 145.3989 },
  'Macedon Ranges':     { lat: -37.2200, lon: 144.6320 },
  'Mount Alexander':    { lat: -37.0790, lon: 144.2110 },
  'Hepburn':            { lat: -37.3700, lon: 144.1920 },
  'Pyrenees':           { lat: -37.1500, lon: 143.4660 },
  'Ararat':             { lat: -37.2820, lon: 143.2280 },
  'Northern Grampians': { lat: -37.0620, lon: 142.7840 },
  'Horsham':            { lat: -36.7130, lon: 142.1990 },
  'Yarriambiack':       { lat: -35.9990, lon: 142.3770 },
  'Buloke':             { lat: -35.9990, lon: 143.1440 },
  'Swan Hill':          { lat: -35.3420, lon: 143.5560 },
  'Mildura':            { lat: -34.1870, lon: 142.1600 },
  'Hindmarsh':          { lat: -36.0780, lon: 141.8240 },
  'West Wimmera':       { lat: -36.6870, lon: 141.5870 },
  'Glenelg':            { lat: -37.9530, lon: 141.4620 },
  'Southern Grampians': { lat: -37.8440, lon: 142.4810 },
  'Corangamite':        { lat: -38.2430, lon: 143.1890 },
  'Warrnambool':        { lat: -38.3830, lon: 142.4930 },
  'Moyne':              { lat: -38.2910, lon: 142.5560 },
  'Wellington':         { lat: -37.9940, lon: 146.9990 },
  'Bass Coast':         { lat: -38.5740, lon: 145.5840 },
  'South Gippsland':    { lat: -38.6260, lon: 146.0480 },
  'Baw Baw':            { lat: -38.0170, lon: 146.0820 },
}

// ── Relevant offence subgroups for safety assessment ──────────
// Focus: personal safety (assault, sexual, robbery, stalking)
const RELEVANT_SUBDIVISIONS = new Set([
  'A20 Assault and related offences',
  'A30 Sexual offences',
  'B30 Robbery',
  'A40 Stalking, harassment and threatening behaviour',
])

// Normalise LGA name (trim, strip leading space)
function normLGA(name) {
  return name?.toString().trim().replace(/^\s+/, '') ?? ''
}

// Parse number string like "  1,234 " → 1234
function parseNum(s) {
  return parseFloat(s?.toString().replace(/[,\s]/g, '')) || 0
}

async function main() {
  console.log('Crime Statistics Import\n')

  const filePath = resolve(ROOT, 'data/crime_lga_offences.xlsx')
  process.stdout.write('Reading XLSX… ')
  const wb = XLSX.readFile(filePath, { dense: false })

  // Table 02 = sheet index 3 (0-based = 3, but XLSX sheets are: Contents=0, Footnotes=1, Table01=2, Table02=3)
  const sheetName = 'Table 02'
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  console.log(`${rows.length} rows`)

  // Header row
  const header = rows[0].map(h => h?.toString().trim())
  const yearIdx    = header.findIndex(h => h === 'Year')
  const lgaIdx     = header.findIndex(h => h.includes('Local Government'))
  const subdivIdx  = header.findIndex(h => h.includes('Offence Subdivision'))
  const countIdx   = header.findIndex(h => h.includes('Offence Count'))
  const rateIdx    = header.findIndex(h => h.includes('LGA Rate'))

  console.log(`Columns — Year:${yearIdx}, LGA:${lgaIdx}, Subdivision:${subdivIdx}, Count:${countIdx}, Rate:${rateIdx}`)

  // Filter: last 3 years, relevant offences, known LGAs
  const currentYear = new Date().getFullYear()
  const minYear = currentYear - 3

  const toInsert = []
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const year   = parseInt(row[yearIdx])
    const lga    = normLGA(row[lgaIdx])
    const subdiv = row[subdivIdx]?.toString().trim()
    const count  = parseNum(row[countIdx])
    const rate   = parseNum(row[rateIdx])

    if (!year || year < minYear)           { skipped++; continue }
    if (!RELEVANT_SUBDIVISIONS.has(subdiv)) { skipped++; continue }

    const centroid = LGA_CENTROIDS[lga]
    if (!centroid) { skipped++; continue }

    // Map subdivision to our offence_type
    const offence_type =
      subdiv.includes('Assault')    ? 'assault' :
      subdiv.includes('Sexual')     ? 'sexual_offence' :
      subdiv.includes('Robbery')    ? 'robbery' :
      subdiv.includes('Stalking') || subdiv.includes('harassment') ? 'harassment' :
      'other'

    toInsert.push([lga, year, offence_type, count, rate, centroid.lat, centroid.lon])
  }

  console.log(`\nRows to insert: ${toInsert.length} (skipped ${skipped})\n`)

  // Clear and re-insert
  await pool.query('DELETE FROM crime_stats')

  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const vals = batch.map((_, j) => {
      const b = j * 7
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`
    }).join(',')
    await pool.query(`
      INSERT INTO crime_stats (suburb, year, offence_type, count, rate_per_100k, suburb_lat, suburb_lon)
      VALUES ${vals}
    `, batch.flat())
    inserted += batch.length
  }

  console.log(`Inserted ${inserted} rows into crime_stats\n`)

  const { rows: summary } = await pool.query(`
    SELECT offence_type, year, COUNT(*) AS lgas, ROUND(AVG(rate_per_100k)::numeric,1) AS avg_rate
    FROM crime_stats
    GROUP BY offence_type, year
    ORDER BY offence_type, year DESC
  `)
  console.log('Summary:')
  for (const r of summary) {
    console.log(`  ${r.offence_type} (${r.year}): ${r.lgas} LGAs, avg ${r.avg_rate}/100k`)
  }

  await pool.end()
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
