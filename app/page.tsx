'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import SafetyPanel from '@/components/SafetyPanel'
import ReportModal from '@/components/ReportModal'
import SearchBar from '@/components/SearchBar'
import t, { type Lang, LANG_LABELS } from '@/lib/i18n'
import type { SafetyResult } from '@/lib/safety-score'
import { Crosshair } from '@phosphor-icons/react'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const DEFAULT_CENTER: [number, number] = [-37.8136, 144.9631]

// Bottom sheet snap points (dvh)
const SHEET_HEIGHT_VH = 78   // total sheet height
const PEEK_PX         = 72   // px visible when collapsed (just the handle bar)

interface SafePlace {
  id: number; name: string; category: string; address: string
  lat: number; lon: number; distance_m: number; hours: string | null
}
interface Report {
  id: number; lat: number; lon: number; category: string
  description: string | null; reported_at: string; distance_m?: number
  time_of_day?: string | null
}
export interface FootfallData {
  available: boolean; sensorName?: string; distanceMeters?: number
  current?: number; trend?: 'rising' | 'falling' | 'stable'
  level?: 'busy' | 'moderate' | 'quiet' | 'empty'; message?: string
}
export interface LiquorVenue {
  id: number; lat: number; lon: number; name: string
  license_type: string; address: string | null; suburb: string | null; distance_m: number
}

type ReportFilter = 'all' | 'night' | 'today'

const GRADE_COLOR: Record<string, string> = {
  A: '#10B981', B: '#10B981', C: '#F59E0B', D: '#EF4444', F: '#EF4444',
}

export default function HomePage() {
  const [lang, setLang]               = useState<Lang>('en')
  const tr                            = t[lang]
  const [center, setCenter]           = useState<[number, number]>(DEFAULT_CENTER)
  const [areaName, setAreaName]       = useState('Melbourne CBD')
  const [safetyData, setSafetyData]   = useState<SafetyResult | null>(null)
  const [safePlaces, setSafePlaces]   = useState<SafePlace[]>([])
  const [reports, setReports]         = useState<Report[]>([])
  const [footfall, setFootfall]       = useState<FootfallData | null>(null)
  const [liquorVenues, setLiquorVenues] = useState<LiquorVenue[]>([])
  const [loading, setLoading]         = useState(false)
  const [showReport, setShowReport]   = useState(false)
  const [reportFilter, setReportFilter] = useState<ReportFilter>('all')
  const [shareCopied, setShareCopied] = useState(false)
  const [isMobile, setIsMobile]       = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // ── Bottom sheet drag state ────────────────────────────────────
  const [sheetOpen, setSheetOpen]     = useState(false)
  const [dragOffset, setDragOffset]   = useState(0)
  const touchStartY                   = useRef(0)
  const isDragging                    = useRef(false)
  const lastDelta                     = useRef(0)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const fetchData = useCallback(async (lat: number, lon: number) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const [safetyRes, placesRes, reportsRes, ffRes, liquorRes] = await Promise.all([
        fetch(`/api/safety?lat=${lat}&lon=${lon}`,                     { signal: ctrl.signal }),
        fetch(`/api/safe-places?lat=${lat}&lon=${lon}&radius=1`,       { signal: ctrl.signal }),
        fetch(`/api/report?lat=${lat}&lon=${lon}&radius=1&hours=168`,  { signal: ctrl.signal }),
        fetch(`/api/footfall?lat=${lat}&lon=${lon}`,                   { signal: ctrl.signal }),
        fetch(`/api/liquor?lat=${lat}&lon=${lon}&radius=0.5`,          { signal: ctrl.signal }),
      ])
      const [safety, places, rpts, ff, liquor] = await Promise.all([
        safetyRes.json(), placesRes.json(), reportsRes.json(), ffRes.json(), liquorRes.json(),
      ])
      setSafetyData(safety)
      setSafePlaces(places.places ?? [])
      setReports(rpts.reports ?? [])
      setFootfall(ff)
      setLiquorVenues(liquor.venues ?? [])
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const reverseGeocode = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14`)
      const data = await res.json()
      const parts: string[] = (data.display_name ?? '').split(',')
      setAreaName(parts.slice(0, 2).join(',').trim() || 'Melbourne')
    } catch { /* keep existing */ }
  }, [])

  // Initial geolocation
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setCenter(c)
        fetchData(c[0], c[1])
        reverseGeocode(c[0], c[1])
      },
      () => fetchData(DEFAULT_CENTER[0], DEFAULT_CENTER[1])
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setCenter([lat, lon])
    fetchData(lat, lon)
    reverseGeocode(lat, lon)
    if (isMobile) setSheetOpen(true)
  }, [fetchData, reverseGeocode, isMobile])

  const handleSearch = useCallback((lat: number, lon: number, name?: string) => {
    setCenter([lat, lon])
    if (name) setAreaName(name)
    fetchData(lat, lon)
    if (isMobile) setSheetOpen(true)
  }, [fetchData, isMobile])

  // Locate me — fly back to current GPS position
  const handleLocateMe = useCallback(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setCenter(c)
        fetchData(c[0], c[1])
        reverseGeocode(c[0], c[1])
        if (isMobile) setSheetOpen(true)
      },
      () => {} // silently ignore if denied
    )
  }, [fetchData, reverseGeocode, isMobile])

  const handleShare = useCallback(async () => {
    const url = `https://maps.google.com/maps?q=${center[0]},${center[1]}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Melbourne Safety', url }); return } catch { /* fallthrough */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2500)
    } catch { /* ignore */ }
  }, [center])

  // ── Touch drag handlers for bottom sheet ──────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    isDragging.current = true
    lastDelta.current = 0
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return
    const delta = e.touches[0].clientY - touchStartY.current
    lastDelta.current = delta
    // Clamp: when open, only allow dragging down; when closed, only allow dragging up
    if (sheetOpen) setDragOffset(Math.max(0, delta))
    else           setDragOffset(Math.min(0, delta))
  }
  const onTouchEnd = () => {
    if (!isDragging.current) return
    isDragging.current = false
    const delta = lastDelta.current
    if (!sheetOpen && delta < -60) setSheetOpen(true)
    else if (sheetOpen && delta > 80) setSheetOpen(false)
    setDragOffset(0)
  }

  // Compute sheet translateY
  const sheetTransform = (() => {
    if (isMobile) {
      const peekOffset = `calc(${SHEET_HEIGHT_VH}dvh - ${PEEK_PX}px)`
      if (isDragging.current && dragOffset !== 0) {
        if (sheetOpen) return `translateY(${dragOffset}px)`
        else           return `translateY(calc(${peekOffset} + ${dragOffset}px))`
      }
      return sheetOpen ? 'translateY(0px)' : `translateY(${peekOffset})`
    }
    return 'none'
  })()

  const gradeColor = GRADE_COLOR[safetyData?.grade ?? ''] ?? '#6B7280'

  const panel = (
    <SafetyPanel
      safety={safetyData} footfall={footfall} safePlaces={safePlaces}
      reports={reports} reportFilter={reportFilter} onFilterChange={setReportFilter}
      loading={loading} gradeColor={gradeColor} areaName={areaName}
      lang={lang} tr={tr}
      onReportClick={() => setShowReport(true)}
      onShare={handleShare}
    />
  )

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-[var(--surface-base)] relative">

      {/* Mobile: floating search + lang toggle */}
      <div className="md:hidden absolute top-4 left-4 right-4 z-[1000] flex gap-2">
        <div className="flex-1">
          <SearchBar onSelect={handleSearch} lang={lang} placeholder={tr.searchPlaceholder} />
        </div>
        <button
          onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
          className="px-3 rounded-2xl text-sm font-bold shadow-[var(--shadow-float)] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--brand-primary)] whitespace-nowrap"
        >
          {LANG_LABELS[lang === 'zh' ? 'en' : 'zh']}
        </button>
      </div>

      {/* Map area — full screen on mobile */}
      <div className="absolute inset-0 md:relative md:flex-1 md:h-full z-0">
        <Map
          center={center} locationPin={center}
          safePlaces={safePlaces} reports={reports} liquorVenues={liquorVenues}
          onMapClick={handleMapClick} lang={lang}
        />

        {/* Locate me button */}
        <button
          onClick={handleLocateMe}
          title={lang === 'zh' ? '回到我的位置' : 'My location'}
          className="absolute z-[1000] flex items-center justify-center rounded-2xl bg-white border border-[var(--border-default)] shadow-[var(--shadow-float)] text-[var(--brand-primary)] transition-all hover:bg-[var(--surface-subtle)] active:scale-95"
          style={{ bottom: isMobile ? `${PEEK_PX + 16}px` : '88px', right: '12px', width: 44, height: 44 }}
        >
          <Crosshair weight="bold" size={22} />
        </button>

        {/* SOS button */}
        <button
          onClick={() => { window.location.href = 'tel:000' }}
          className="absolute z-[1000] w-14 h-14 rounded-full bg-[var(--danger-red)] text-white font-bold text-sm shadow-lg"
          style={{ bottom: isMobile ? `${PEEK_PX + 68}px` : '16px', right: '12px', boxShadow: '0 0 20px rgba(239,68,68,0.4)' }}
        >
          SOS
        </button>
      </div>

      {/* ── Bottom sheet (mobile) / Right sidebar (desktop) ── */}
      <div
        className="
          fixed bottom-0 left-0 right-0 bg-[var(--surface-base)] rounded-t-3xl
          shadow-[0_-4px_24px_rgba(124,58,237,0.12)] z-[500] flex flex-col
          md:relative md:inset-auto md:h-full md:w-[380px] md:rounded-none
          md:shadow-[-4px_0_24px_rgba(124,58,237,0.05)] md:z-10
          md:border-l md:border-[var(--border-default)]
        "
        style={{
          height: isMobile ? `${SHEET_HEIGHT_VH}dvh` : '100%',
          transform: sheetTransform,
          transition: isDragging.current ? 'none' : 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* ── Drag handle (mobile only) ── */}
        <div
          className="md:hidden flex-shrink-0 select-none touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={() => setSheetOpen(v => !v)}
          style={{ cursor: 'grab', paddingTop: 10, paddingBottom: 8 }}
        >
          {/* Pill handle */}
          <div className="w-10 h-1.5 bg-gray-300 rounded-full mx-auto mb-2" />
          {/* Summary row — always visible in peek state */}
          <div className="flex items-center gap-3 px-5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {loading ? tr.loading : areaName}
              </div>
              {reports.length > 0 && (
                <div className="text-xs text-[var(--brand-primary)] mt-0.5">
                  {tr.reportCount(reports.length)}
                </div>
              )}
            </div>
            {safetyData && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: gradeColor }}
                >
                  {safetyData.grade}
                </div>
                <span className="text-xs text-[var(--text-muted)]">{safetyData.score}/100</span>
              </div>
            )}
            <span className="text-[var(--text-muted)] text-sm flex-shrink-0">
              {sheetOpen ? '▾' : '▴'}
            </span>
          </div>
        </div>

        {/* Desktop: search + lang toggle */}
        <div className="hidden md:flex gap-2 px-6 pt-5 pb-2 flex-shrink-0">
          <div className="flex-1">
            <SearchBar onSelect={handleSearch} lang={lang} placeholder={tr.searchPlaceholder} />
          </div>
          <button
            onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
            className="px-3 rounded-2xl text-sm font-bold border border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--brand-primary)] whitespace-nowrap"
          >
            {LANG_LABELS[lang === 'zh' ? 'en' : 'zh']}
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pb-4 md:pt-2">
          {panel}
        </div>
      </div>

      {/* Report modal */}
      {showReport && (
        <ReportModal
          isOpen={showReport}
          lat={center[0]} lon={center[1]} lang={lang} tr={tr}
          onClose={() => setShowReport(false)}
          onSubmitted={() => { setShowReport(false); fetchData(center[0], center[1]) }}
        />
      )}

      {/* Share copied toast */}
      {shareCopied && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[3000] bg-[var(--surface-card)] border border-[var(--border-default)] rounded-full px-4 py-2 text-sm text-[var(--brand-primary)] shadow-[var(--shadow-float)] pointer-events-none">
          {tr.shareCopied}
        </div>
      )}
    </div>
  )
}
