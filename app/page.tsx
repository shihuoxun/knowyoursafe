'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import SafetyPanel from '@/components/SafetyPanel'
import ReportModal from '@/components/ReportModal'
import SearchBar from '@/components/SearchBar'
import t, { type Lang, LANG_LABELS } from '@/lib/i18n'
import type { SafetyResult } from '@/lib/safety-score'
import { Crosshair, Siren } from '@phosphor-icons/react'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const DEFAULT_CENTER: [number, number] = [-37.8136, 144.9631]

// Mobile bottom sheet
const SHEET_VH  = 80    // total sheet height in dvh
const PEEK_PX   = 140   // visible height when collapsed (handle + report button)
const DRAG_OPEN_THRESHOLD  = 60
const DRAG_CLOSE_THRESHOLD = 80

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
  const [lang, setLang]             = useState<Lang>('en')
  const tr                          = t[lang]
  const [center, setCenter]         = useState<[number, number]>(DEFAULT_CENTER)
  const [areaName, setAreaName]     = useState('Melbourne CBD')
  const [safetyData, setSafetyData] = useState<SafetyResult | null>(null)
  const [safePlaces, setSafePlaces] = useState<SafePlace[]>([])
  const [reports, setReports]       = useState<Report[]>([])
  const [footfall, setFootfall]     = useState<FootfallData | null>(null)
  const [liquorVenues, setLiquorVenues] = useState<LiquorVenue[]>([])
  const [loading, setLoading]       = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportFilter, setReportFilter] = useState<ReportFilter>('all')
  const [shareCopied, setShareCopied]   = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Bottom sheet drag
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const touchStartY  = useRef(0)
  const dragging     = useRef(false)
  const lastDelta    = useRef(0)

  const fetchData = useCallback(async (lat: number, lon: number) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const [safetyRes, placesRes, reportsRes, ffRes, liquorRes] = await Promise.all([
        fetch(`/api/safety?lat=${lat}&lon=${lon}`,                    { signal: ctrl.signal }),
        fetch(`/api/safe-places?lat=${lat}&lon=${lon}&radius=1`,      { signal: ctrl.signal }),
        fetch(`/api/report?lat=${lat}&lon=${lon}&radius=1&hours=168`, { signal: ctrl.signal }),
        fetch(`/api/footfall?lat=${lat}&lon=${lon}`,                  { signal: ctrl.signal }),
        fetch(`/api/liquor?lat=${lat}&lon=${lon}&radius=0.5`,         { signal: ctrl.signal }),
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
    } catch { }
  }, [])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setCenter(c); fetchData(c[0], c[1]); reverseGeocode(c[0], c[1])
      },
      () => fetchData(DEFAULT_CENTER[0], DEFAULT_CENTER[1])
    )
  }, []) // eslint-disable-line

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setCenter([lat, lon]); fetchData(lat, lon); reverseGeocode(lat, lon); setSheetOpen(true)
  }, [fetchData, reverseGeocode])

  const handleSearch = useCallback((lat: number, lon: number, name?: string) => {
    setCenter([lat, lon]); if (name) setAreaName(name); fetchData(lat, lon); setSheetOpen(true)
  }, [fetchData])

  const handleLocateMe = useCallback(() => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      const c: [number, number] = [pos.coords.latitude, pos.coords.longitude]
      setCenter(c); fetchData(c[0], c[1]); reverseGeocode(c[0], c[1]); setSheetOpen(true)
    })
  }, [fetchData, reverseGeocode])

  const handleShare = useCallback(async () => {
    const url = `https://maps.google.com/maps?q=${center[0]},${center[1]}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Melbourne Safety', url }); return } catch { }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2500)
    } catch { }
  }, [center])

  // ── Touch drag ────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    dragging.current = true; lastDelta.current = 0
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return
    const delta = e.touches[0].clientY - touchStartY.current
    lastDelta.current = delta
    if (sheetOpen) setDragOffset(Math.max(0, delta))
    else           setDragOffset(Math.min(0, delta))
  }
  const onTouchEnd = () => {
    if (!dragging.current) return
    dragging.current = false
    const d = lastDelta.current
    if (!sheetOpen && d < -DRAG_OPEN_THRESHOLD)  setSheetOpen(true)
    if (sheetOpen  && d >  DRAG_CLOSE_THRESHOLD) setSheetOpen(false)
    setDragOffset(0)
  }

  const collapsedTranslate = `calc(${SHEET_VH}dvh - ${PEEK_PX}px)`
  const sheetStyle: React.CSSProperties = {
    transform: (() => {
      if (dragging.current && dragOffset !== 0) {
        return sheetOpen
          ? `translateY(${dragOffset}px)`
          : `translateY(calc(${collapsedTranslate} + ${dragOffset}px))`
      }
      return sheetOpen ? 'translateY(0)' : `translateY(${collapsedTranslate})`
    })(),
    transition: dragging.current ? 'none' : 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
  }

  const gradeColor = GRADE_COLOR[safetyData?.grade ?? ''] ?? '#6B7280'

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-[var(--surface-base)] relative">

      {/* ── Mobile: floating search bar ── */}
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

      {/* ── Map: full screen on mobile, flex-1 on desktop ── */}
      <div className="absolute inset-0 md:relative md:flex-1 md:h-full z-0">
        <Map
          center={center} locationPin={center}
          safePlaces={safePlaces} reports={reports} liquorVenues={liquorVenues}
          onMapClick={handleMapClick} lang={lang}
        />

        {/* Locate me — CSS positioned, always above peek on mobile */}
        <button
          onClick={handleLocateMe}
          title={lang === 'zh' ? '回到我的位置' : 'My location'}
          className="
            absolute z-[1000] w-11 h-11 rounded-2xl
            bg-white border border-[var(--border-default)] shadow-[var(--shadow-float)]
            text-[var(--brand-primary)] flex items-center justify-center
            hover:bg-[var(--surface-subtle)] active:scale-95 transition-all
            right-3
            bottom-[calc(96px+124px)]
            md:bottom-24
          "
        >
          <Crosshair weight="bold" size={22} />
        </button>

        {/* SOS — always above peek */}
        <button
          onClick={() => { window.location.href = 'tel:000' }}
          className="
            absolute z-[1000] w-14 h-14 rounded-full
            bg-[var(--danger-red)] text-white font-bold text-sm
            flex items-center justify-center
            right-3
            bottom-[calc(96px+60px)]
            md:bottom-16
          "
          style={{ boxShadow: '0 0 20px rgba(239,68,68,0.4)' }}
        >
          SOS
        </button>
      </div>

      {/* ── Bottom sheet (mobile) / Right sidebar (desktop) ── */}
      <div
        className="
          bottom-sheet-reset
          fixed bottom-0 left-0 right-0
          bg-[var(--surface-base)] rounded-t-3xl
          shadow-[0_-4px_24px_rgba(124,58,237,0.12)]
          z-[500] flex flex-col
          md:w-[380px] md:rounded-none
          md:shadow-[-4px_0_24px_rgba(124,58,237,0.05)]
          md:z-10 md:border-l md:border-[var(--border-default)]
        "
        style={{
          height: `${SHEET_VH}dvh`,
          ...sheetStyle,
        }}
      >
        {/* ── Handle + always-visible Report CTA (mobile only) ── */}
        <div
          className="md:hidden flex-shrink-0 select-none touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ cursor: 'grab' }}
        >
          {/* Pill + info row (tap to toggle) */}
          <div
            onClick={() => setSheetOpen(v => !v)}
            className="flex items-center gap-3 px-5 pt-3 pb-2"
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full absolute top-3 left-1/2 -translate-x-1/2" />
            <div className="flex-1 min-w-0 mt-2">
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {loading ? tr.loading : areaName}
              </div>
              {reports.length > 0 && (
                <div className="text-xs text-orange-500 mt-0.5">{tr.reportCount(reports.length)}</div>
              )}
            </div>
            {safetyData && (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-2"
                style={{ background: gradeColor }}
              >
                {safetyData.grade}
              </div>
            )}
            <span className="text-[var(--text-muted)] text-sm flex-shrink-0 mt-2">
              {sheetOpen ? '▾' : '▴'}
            </span>
          </div>

          {/* Report button — always visible in peek */}
          <div className="px-4 pb-3">
            <button
              onClick={() => { setShowReport(true) }}
              className="w-full py-3 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ backgroundImage: 'linear-gradient(135deg, #f97316, #ef4444)', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}
            >
              <Siren weight="fill" size={18} />
              {lang === 'zh' ? '举报安全隐患' : 'Report a Safety Concern'}
            </button>
          </div>
        </div>

        {/* ── Desktop: search + lang toggle ── */}
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

        {/* ── Panel content ── */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 md:pt-2">
          <SafetyPanel
            safety={safetyData} footfall={footfall} safePlaces={safePlaces}
            reports={reports} reportFilter={reportFilter} onFilterChange={setReportFilter}
            loading={loading} gradeColor={gradeColor} areaName={areaName}
            lang={lang} tr={tr}
            onReportClick={() => setShowReport(true)}
            onShare={handleShare}
          />
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

      {/* Share toast */}
      {shareCopied && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[3000] bg-[var(--surface-card)] border border-[var(--border-default)] rounded-full px-4 py-2 text-sm text-[var(--brand-primary)] shadow-[var(--shadow-float)] pointer-events-none whitespace-nowrap">
          {tr.shareCopied}
        </div>
      )}
    </div>
  )
}
