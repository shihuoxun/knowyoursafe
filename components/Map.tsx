'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Lang } from '@/lib/i18n'
import type { LiquorVenue } from '@/app/page'

interface SafePlace {
  id: number; name: string; category: string; address: string
  lat: number; lon: number; distance_m: number; hours: string | null
}
interface Report {
  id: number; lat: number; lon: number; category: string
  description: string | null; reported_at: string
}
interface Props {
  center: [number, number]
  locationPin: [number, number] | null
  safePlaces: SafePlace[]
  reports: Report[]
  liquorVenues: LiquorVenue[]
  onMapClick: (lat: number, lon: number) => void
  lang: Lang
}

// Phosphor icon SVG paths (duotone: primary layer only, simplified for inline use)
const PLACE_SVG: Record<string, string> = {
  // Police — ShieldStar
  police: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M208,40H48A16,16,0,0,0,32,56V120c0,72,88,112,88,112s88-40,88-112V56A16,16,0,0,0,208,40Zm0,80c0,57.23-55.47,93.68-80,107.28C103.44,213.65,48,177.12,48,120V56H208ZM140.49,100.51l-13,38.08,32.43-23.52a8,8,0,0,0-9.4-12.94l-22.55,16.36,8.59-25.14a8,8,0,1,0-15.16-5.18L108.84,115l-22.55-16.36a8,8,0,0,0-9.4,12.94l32.43,23.52-13,38.08a8,8,0,0,0,15.16,5.18L128,143.67l16.52,34.67a8,8,0,0,0,15.16-5.18Z" opacity=".3"/><path d="M208,40H48A16,16,0,0,0,32,56V120c0,72,88,112,88,112s88-40,88-112V56A16,16,0,0,0,208,40Zm0,80c0,57.23-55.47,93.68-80,107.28C103.44,213.65,48,177.12,48,120V56H208Z"/></svg>`,
  // Hospital — Hospital
  hospital: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M232,96H176V40a8,8,0,0,0-8-8H88a8,8,0,0,0-8,8V96H24a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H232a8,8,0,0,0,8-8V104A8,8,0,0,0,232,96ZM96,48h64V96H96ZM80,216H32V112H80Zm96,0H80V112h96Zm48,0H192V112h32ZM112,144v-16a8,8,0,0,1,16,0v16h16a8,8,0,0,1,0,16H128v16a8,8,0,0,1-16,0V160H96a8,8,0,0,1,0-16Z" opacity=".3"/><path d="M232,96H176V40a8,8,0,0,0-8-8H88a8,8,0,0,0-8,8V96H24a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H232a8,8,0,0,0,8-8V104A8,8,0,0,0,232,96ZM96,48h64V96H96ZM80,216H32V112H80Zm96,0H80V112h96Zm48,0H192V112h32ZM144,152h16a8,8,0,0,0,0-16H144V120a8,8,0,0,0-16,0v16H112a8,8,0,0,0,0,16h16v16a8,8,0,0,0,16,0Z"/></svg>`,
  // Safe place — Shield
  safe_place: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M208,40H48A16,16,0,0,0,32,56V120c0,72,88,112,88,112s88-40,88-112V56A16,16,0,0,0,208,40Zm0,80c0,57.23-55.47,93.68-80,107.28C103.44,213.65,48,177.12,48,120V56H208Z" opacity=".3"/><path d="M208,40H48A16,16,0,0,0,32,56V120c0,72,88,112,88,112s88-40,88-112V56A16,16,0,0,0,208,40Zm0,80c0,57.23-55.47,93.68-80,107.28C103.44,213.65,48,177.12,48,120V56H208Z"/></svg>`,
  // Train station
  ptv: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M208,48H48A24,24,0,0,0,24,72V184a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V72A24,24,0,0,0,208,48ZM96,168a16,16,0,1,1,16-16A16,16,0,0,1,96,168Zm64,0a16,16,0,1,1,16-16A16,16,0,0,1,160,168ZM216,112H40V72a8,8,0,0,1,8-8H208a8,8,0,0,1,8,8Z" opacity=".3"/><path d="M208,40H48A32,32,0,0,0,16,72V184a32,32,0,0,0,32,32L29.66,234.34a8,8,0,0,0,11.31,11.31L60.69,226H195.31l19.72,19.66a8,8,0,0,0,11.31-11.31L208,216a32,32,0,0,0,32-32V72A32,32,0,0,0,208,40Zm16,144a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V120H224Zm0-80H32V72a16,16,0,0,1,16-16H208a16,16,0,0,1,16,16ZM96,152a16,16,0,1,1-16-16A16,16,0,0,1,96,152Zm96,0a16,16,0,1,1-16-16A16,16,0,0,1,192,152Z"/></svg>`,
  // Pharmacy — Pill
  pharmacy: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M168,48H88A80,80,0,0,0,88,208h80a80,80,0,0,0,0-160Zm0,128H88a48,48,0,0,1,0-96h80a48,48,0,0,1,0,96Z" opacity=".3"/><path d="M168,40H88a88,88,0,0,0,0,176h80a88,88,0,0,0,0-176Zm0,160H88a72,72,0,0,1,0-144h80a72,72,0,0,1,0,144Zm-8-112H96a8,8,0,0,0-8,8v64a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V96A8,8,0,0,0,160,88Zm-56,16h48v32H104Z"/></svg>`,
}
const PLACE_COLOR: Record<string, string> = {
  police: '#3b82f6', hospital: '#10b981', safe_place: '#8b5cf6',
  ptv: '#f59e0b', pharmacy: '#06b6d4',
}
// Report category SVG icons
const REPORT_SVG: Record<string, string> = {
  unsafe:        `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z"/></svg>`,
  harassment:    `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M201.54,54.46A104,104,0,1,0,54.46,201.54,104,104,0,1,0,201.54,54.46ZM128,232a104,104,0,1,1,104-104A104.11,104.11,0,0,1,128,232Zm37.66-90.34a8,8,0,0,1,0,11.31C152.6,166,141.11,170,128,170s-24.6-4-37.66-17.03a8,8,0,0,1,11.32-11.31C111.48,151.48,119,154,128,154s16.52-2.52,26.34-12.34A8,8,0,0,1,165.66,141.66ZM96,120a12,12,0,1,1,12,12A12,12,0,0,1,96,120Zm64-12a12,12,0,1,1-12-12A12,12,0,0,1,160,108Z"/></svg>`,
  poor_lighting: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M176,120a48,48,0,1,1-48-48A48,48,0,0,1,176,120Zm-48,72a8,8,0,0,0-8,8v16a8,8,0,0,0,16,0V200A8,8,0,0,0,128,192ZM60.12,68.44A8,8,0,0,0,71.44,57.12l-12-12A8,8,0,0,0,48.12,56.44Zm0,103.12-12,12a8,8,0,1,0,11.32,11.32l12-12a8,8,0,1,0-11.32-11.32ZM192,120a8,8,0,0,0,8,8h16a8,8,0,0,0,0-16H200A8,8,0,0,0,192,120ZM40,120a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H32A8,8,0,0,0,40,120ZM184.56,68.44l12-12A8,8,0,0,0,185.24,45.1l-12,12a8,8,0,1,0,11.32,11.34Zm0,103.12a8,8,0,1,0-11.32,11.32l12,12a8,8,0,0,0,11.32-11.32ZM128,40a8,8,0,0,0,8-8V16a8,8,0,0,0-16,0V32A8,8,0,0,0,128,40Z"/></svg>`,
  isolated:      `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M235.54,150.21a104.84,104.84,0,0,1-37,52.91A104,104,0,0,1,32,120,103.09,103.09,0,0,1,56.16,51.73,104.27,104.27,0,0,1,105.5,20.55a8,8,0,0,1,8.13,3.65,8,8,0,0,1-.55,9.18A56.08,56.08,0,0,0,176,96a55.26,55.26,0,0,0,8.63-.68,8,8,0,0,1,8.55,4.54A104.08,104.08,0,0,1,235.54,150.21Z"/></svg>`,
  other:         `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09Z" opacity=".3"/></svg>`,
}
const REPORT_COLOR: Record<string, string> = {
  unsafe: '#ff4f7b', harassment: '#f97316', poor_lighting: '#eab308',
  isolated: '#a78bfa', other: '#6b7280',
}
const LIQUOR_TYPE_COLOR: Record<string, string> = {
  general: '#f59e0b', restaurant: '#fb923c', club: '#e879f9',
  late_night: '#f43f5e', other: '#94a3b8',
}

// ── Coverage zone definitions ──────────────────────────────────
// Zone 1: City of Melbourne street lights (circle, ~4km radius)
const ZONE1_CENTER: [number, number] = [-37.80842, 144.95717]
const ZONE1_RADIUS_M = 4100

// Zone 2: Melbourne metro bounding box (OSM safe places)
const ZONE2_BOUNDS: [[number, number], [number, number]] = [[-38.5, 144.3], [-37.2, 145.8]]

// Zone 3: Victoria bounding box (crime stats LGA centroids)
const ZONE3_BOUNDS: [[number, number], [number, number]] = [[-39.2, 140.9], [-33.9, 149.8]]

// ── Icon factories ─────────────────────────────────────────────
function makeIcon(svgHtml: string, color: string) {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;border-radius:10px;background:white;border:1.5px solid ${color}44;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.12);color:${color}">${svgHtml}</div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20],
  })
}
function reportIcon(color: string, recent = false) {
  const size = recent ? 26 : 18
  const half = size / 2
  const pulseClass = recent ? ' msafe-report-pulse' : ''
  const svgHtml = REPORT_SVG.other
  return L.divIcon({
    html: `<div class="msafe-report-dot${pulseClass}" style="width:${size}px;height:${size}px;border-radius:50%;background:white;border:2px solid ${color};box-shadow:0 2px 6px ${color}55;display:flex;align-items:center;justify-content:center;color:${color}"></div>`,
    className: '', iconSize: [size, size], iconAnchor: [half, half], popupAnchor: [0, -half - 2],
  })
}
function locationPinIcon() {
  return L.divIcon({
    html: `
      <div style="position:relative;width:22px;height:22px">
        <div class="msafe-pin-ring" style="position:absolute;inset:0;border-radius:50%;background:#7C3AED33;border:2px solid #7C3AED88"></div>
        <div style="position:absolute;inset:5px;border-radius:50%;background:#7C3AED;border:2px solid white;box-shadow:0 2px 6px rgba(124,58,237,0.5)"></div>
      </div>`,
    className: '', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14],
  })
}
function liquorIcon(color: string) {
  // Wine glass Phosphor path (simplified)
  const wineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 256 256" fill="currentColor"><path d="M200,32H56a8,8,0,0,0-6.34,12.9L112,125.65V208H80a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16H144V125.65l62.34-80.75A8,8,0,0,0,200,32Z"/></svg>`
  return L.divIcon({
    html: `<div style="width:16px;height:16px;border-radius:4px;background:white;border:1.5px solid ${color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.15);color:${color}">${wineSvg}</div>`,
    className: '', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10],
  })
}

// Pulse animations are in globals.css

export default function Map({ center, locationPin, safePlaces, reports, liquorVenues, onMapClick, lang }: Props) {
  const mapRef       = useRef<L.Map | null>(null)
  const divRef       = useRef<HTMLDivElement>(null)
  const layersRef    = useRef<L.Layer[]>([])
  const pinRef       = useRef<L.Marker | null>(null)
  const liquorRef    = useRef<L.Layer[]>([])
  const coverageRef  = useRef<L.Layer[]>([])
  const [showCoverage, setShowCoverage] = useState(false)

  const zh = lang === 'zh'

  // ── Init map once ────────────────────────────────────────────
  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    const map = L.map(divRef.current, { center, zoom: 15, zoomControl: false })
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { attribution: '© OSM © CARTO', maxZoom: 19, subdomains: 'abcd' }
    ).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    map.on('click', (e) => onMapClick(e.latlng.lat, e.latlng.lng))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fly to center ────────────────────────────────────────────
  useEffect(() => {
    mapRef.current?.flyTo(center, 15, { duration: 1 })
  }, [center])

  // ── Location pin ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (pinRef.current) { pinRef.current.remove(); pinRef.current = null }
    if (!locationPin) return
    const marker = L.marker(locationPin, { icon: locationPinIcon(), zIndexOffset: 1000, interactive: false })
    marker.addTo(map)
    pinRef.current = marker
  }, [locationPin])

  // ── Coverage zones ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    coverageRef.current.forEach(l => l.remove())
    coverageRef.current = []
    if (!showCoverage) return

    // Zone 3 — Victoria (crime stats only)
    const z3 = L.rectangle(ZONE3_BOUNDS, {
      color: '#ff4f7b', weight: 1.5, dashArray: '6 4',
      fillColor: '#ff4f7b', fillOpacity: 0.04, interactive: false,
    })
    z3.addTo(map)
    coverageRef.current.push(z3)

    // Zone 2 — Melbourne metro (safe places)
    const z2 = L.rectangle(ZONE2_BOUNDS, {
      color: '#fbbf24', weight: 1.5, dashArray: '6 4',
      fillColor: '#fbbf24', fillOpacity: 0.05, interactive: false,
    })
    z2.addTo(map)
    coverageRef.current.push(z2)

    // Zone 1 — CoM CBD (street lighting)
    const z1 = L.circle(ZONE1_CENTER, {
      radius: ZONE1_RADIUS_M,
      color: '#00e5a0', weight: 2, dashArray: '5 3',
      fillColor: '#00e5a0', fillOpacity: 0.07, interactive: false,
    })
    z1.addTo(map)
    coverageRef.current.push(z1)

  }, [showCoverage])

  // ── Safe place + report markers ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layersRef.current.forEach(l => l.remove())
    layersRef.current = []

    const distLabel = zh ? (m: number) => `${m}m 以外` : (m: number) => `${m}m away`
    const reportTitle = zh ? '⚠ 社区举报' : '⚠ Community report'
    const locale = zh ? 'zh-CN' : 'en-AU'

    for (const p of safePlaces) {
      const color = PLACE_COLOR[p.category] ?? '#9CA3AF'
      const svgHtml = PLACE_SVG[p.category] ?? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M128,16a96,96,0,1,0,96,96A96.11,96.11,0,0,0,128,16Zm0,176a80,80,0,1,1,80-80A80.09,80.09,0,0,1,128,192Z"/></svg>`
      const marker = L.marker([p.lat, p.lon], { icon: makeIcon(svgHtml, color) })
      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:160px">
          <div style="font-weight:700;color:${color};margin-bottom:4px">${p.name}</div>
          ${p.address ? `<div style="font-size:12px;color:#6B7280">${p.address}</div>` : ''}
          ${p.hours ? `<div style="font-size:11px;color:#9CA3AF;margin-top:2px">🕐 ${p.hours}</div>` : ''}
          <div style="font-size:11px;color:#9CA3AF;margin-top:4px">${distLabel(p.distance_m)}</div>
        </div>`)
      marker.addTo(map)
      layersRef.current.push(marker)
    }

    for (const r of reports) {
      const color = REPORT_COLOR[r.category] ?? REPORT_COLOR.other
      const ageMinutes = (Date.now() - new Date(r.reported_at).getTime()) / 60000
      const recent = ageMinutes < 120
      const marker = L.marker([r.lat, r.lon], { icon: reportIcon(color, recent), zIndexOffset: recent ? 500 : 0 })
      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:140px">
          <div style="font-weight:600;color:${color};margin-bottom:3px">${reportTitle}</div>
          <div style="font-size:12px;color:#1A1A2E">${r.category.replace('_', ' ')}</div>
          ${r.description ? `<div style="font-size:11px;color:#6B7280;margin-top:2px">${r.description}</div>` : ''}
          <div style="font-size:10px;color:#9CA3AF;margin-top:4px">${new Date(r.reported_at).toLocaleString(locale)}</div>
        </div>`)
      marker.addTo(map)
      layersRef.current.push(marker)
    }
  }, [safePlaces, reports, lang])

  // ── Liquor markers ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    liquorRef.current.forEach(l => l.remove())
    liquorRef.current = []

    const distLabel = zh ? (m: number) => `${m}m 以外` : (m: number) => `${m}m away`
    const typeLabel = zh
      ? { general: '通用酒牌', restaurant: '餐厅/咖啡', club: '俱乐部', late_night: '深夜营业', other: '其他' }
      : { general: 'General licence', restaurant: 'Restaurant/café', club: 'Club', late_night: 'Late night', other: 'Other' }

    for (const v of liquorVenues) {
      const color = LIQUOR_TYPE_COLOR[v.license_type] ?? LIQUOR_TYPE_COLOR.other
      const tl = (typeLabel as Record<string, string>)[v.license_type] ?? v.license_type
      const marker = L.marker([v.lat, v.lon], { icon: liquorIcon(color) })
      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:150px">
          <div style="font-weight:700;color:${color};margin-bottom:4px">🍺 ${v.name}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px">${tl}</div>
          ${v.address ? `<div style="font-size:11px;color:#9CA3AF;margin-top:2px">${v.address}</div>` : ''}
          <div style="font-size:10px;color:#9CA3AF;margin-top:4px">${distLabel(v.distance_m)}</div>
        </div>`)
      marker.addTo(map)
      liquorRef.current.push(marker)
    }
  }, [liquorVenues, lang])

  // ── Coverage toggle button + legend ─────────────────────────
  const legendItems = zh
    ? [
        { color: '#00e5a0', label: '路灯数据覆盖（CoM CBD）',     detail: '路灯+设施+犯罪 · 3/4维度' },
        { color: '#fbbf24', label: '安全设施覆盖（墨尔本都市圈）', detail: '设施+犯罪 · 2/4维度' },
        { color: '#ff4f7b', label: '犯罪统计覆盖（维州全境）',    detail: '仅犯罪 · 1/4维度' },
      ]
    : [
        { color: '#00e5a0', label: 'Street lighting (CoM CBD)',      detail: 'Lighting + facilities + crime · 3/4' },
        { color: '#fbbf24', label: 'Safe places (Melbourne metro)',  detail: 'Facilities + crime · 2/4' },
        { color: '#ff4f7b', label: 'Crime stats (all Victoria)',     detail: 'Crime only · 1/4' },
      ]

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div ref={divRef} style={{ height: '100%', width: '100%' }} />

      {/* Coverage toggle button */}
      <button
        onClick={() => setShowCoverage(v => !v)}
        title={zh ? '显示/隐藏数据覆盖范围' : 'Toggle data coverage'}
        style={{
          position: 'absolute', bottom: 220, right: 12, zIndex: 1000,
          width: 36, height: 36, borderRadius: 8,
          background: showCoverage ? '#EDE9FE' : 'rgba(255,255,255,0.9)',
          border: `1.5px solid ${showCoverage ? '#7C3AED' : '#EDE9FE'}`,
          color: showCoverage ? '#7C3AED' : '#9CA3AF',
          cursor: 'pointer', fontSize: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
      >
        ◎
      </button>

      {/* Legend */}
      {showCoverage && (
        <div style={{
          position: 'absolute', bottom: 264, right: 12, zIndex: 1000,
          background: 'rgba(255,255,255,0.95)', border: '1px solid #EDE9FE',
          borderRadius: 10, padding: '10px 12px',
          backdropFilter: 'blur(12px)',
          minWidth: 220,
          pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(124,58,237,0.12)',
        }}>
          <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {zh ? '数据覆盖范围' : 'Data coverage'}
          </div>
          {legendItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: i < legendItems.length - 1 ? 8 : 0 }}>
              <div style={{
                width: 12, height: 12, borderRadius: 2, flexShrink: 0, marginTop: 2,
                border: `2px dashed ${item.color}`,
                background: item.color + '22',
              }} />
              <div>
                <div style={{ fontSize: 11, color: '#1A1A2E', fontWeight: 500 }}>{item.label}</div>
                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>{item.detail}</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 8, borderTop: '1px solid #EDE9FE', paddingTop: 6 }}>
            {zh ? '圈外区域评分仅供参考，数据不完整' : 'Outside zones: score is partial / indicative only'}
          </div>
        </div>
      )}
    </div>
  )
}
