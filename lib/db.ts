import { Pool } from 'pg'

// Connection pool — reused across API route invocations
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
})

export default pool

// Helper: run a query and return rows
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const { rows } = await pool.query(text, params)
  return rows as T[]
}

// Helper: within-radius bounding box filter (fast pre-filter before haversine)
export function bboxFilter(lat: number, lon: number, radiusKm: number) {
  const latDelta = radiusKm / 111
  const lonDelta = radiusKm / (111 * Math.cos(lat * (Math.PI / 180)))
  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lonMin: lon - lonDelta,
    lonMax: lon + lonDelta,
  }
}
