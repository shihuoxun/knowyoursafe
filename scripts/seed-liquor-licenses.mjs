/**
 * Import Victorian liquor licenses into liquor_licenses table.
 * Source: data/liquor_licenses.xlsx
 * Headers are on row 5, data starts row 6.
 * Coordinates (lat/lon) are included in the file — no geocoding needed.
 *
 * Run: node scripts/seed-liquor-licenses.mjs
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

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

// Category → normalised license_type
function normCategory(cat) {
  const c = cat?.toString().trim() ?? ''
  if (c.includes('General'))          return 'general'
  if (c.includes('Restaurant') || c.includes('cafe')) return 'restaurant'
  if (c.includes('Club'))             return 'club'
  if (c.includes('Producer'))         return 'producer'
  if (c.includes('BYO'))              return 'byo'
  if (c.includes('Late Night'))       return 'late_night'
  if (c.includes('Wine and Beer'))    return 'wine_beer'
  return 'other'
}

async function main() {
  console.log('Liquor Licenses Import\n')

  const filePath = resolve(ROOT, 'data/liquor_licenses.xlsx')
  process.stdout.write('Reading XLSX… ')
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]

  // Data starts at row 6 (0-indexed row 5), header at row 5 (0-indexed row 4)
  // Use sheet_to_json with header row offset
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', range: 4 })
  // allRows[0] = header row (row 5 in Excel), allRows[1+] = data
  console.log(`${allRows.length - 1} data rows`)

  const header = allRows[0].map(h => h?.toString().trim())
  console.log('Columns:', header.filter(h => h).join(' | '))

  // Column indices
  const licNumIdx  = header.findIndex(h => h.includes('Licence Num'))
  const licenseeIdx= header.findIndex(h => h === 'Licensee')
  const tradingIdx = header.findIndex(h => h.includes('Trading As'))
  const catIdx     = header.findIndex(h => h === 'Category')
  const addrIdx    = header.findIndex(h => h === 'Address')
  const suburbIdx  = header.findIndex(h => h === 'Suburb')
  const latIdx     = header.findIndex(h => h.includes('Latitude') || h === 'Lat')
  const lonIdx     = header.findIndex(h => h.includes('Longitude') || h === 'Lon')

  console.log(`Col indices — LicNum:${licNumIdx} Licensee:${licenseeIdx} Trading:${tradingIdx} Cat:${catIdx} Addr:${addrIdx} Suburb:${suburbIdx} Lat:${latIdx} Lon:${lonIdx}\n`)

  const toInsert = []
  let skipped = 0

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i]
    const lat = parseFloat(row[latIdx])
    const lon = parseFloat(row[lonIdx])
    if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) { skipped++; continue }

    const name         = row[tradingIdx]?.toString().trim() || row[licenseeIdx]?.toString().trim() || 'Unknown'
    const license_type = normCategory(row[catIdx])
    const address      = row[addrIdx]?.toString().trim() || null
    const suburb       = row[suburbIdx]?.toString().trim() || null

    toInsert.push([lat, lon, name, license_type, address, suburb, true])
  }

  console.log(`Valid rows: ${toInsert.length} (skipped ${skipped} — no coordinates)\n`)

  await pool.query('DELETE FROM liquor_licenses')

  const BATCH = 300
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const vals = batch.map((_, j) => {
      const b = j * 7
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`
    }).join(',')
    await pool.query(`
      INSERT INTO liquor_licenses (lat, lon, name, license_type, address, suburb, active)
      VALUES ${vals}
    `, batch.flat())
    inserted += batch.length
    process.stdout.write(`\r  Inserted ${inserted}/${toInsert.length}…`)
  }
  console.log()

  const { rows: summary } = await pool.query(`
    SELECT license_type, COUNT(*) AS n
    FROM liquor_licenses GROUP BY license_type ORDER BY n DESC
  `)
  console.log('\nLiquor licenses by type:')
  for (const r of summary) console.log(`  ${r.license_type}: ${r.n}`)

  // Melbourne-specific count
  const { rows: melb } = await pool.query(`
    SELECT COUNT(*) FROM liquor_licenses
    WHERE haversine_km(lat, lon, -37.8136, 144.9631) < 3
  `)
  console.log(`\nWithin 3km of Melbourne CBD: ${melb[0].count}`)

  await pool.end()
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
