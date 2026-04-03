'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import SafetyPanel from '@/components/SafetyPanel'
import ReportModal from '@/components/ReportModal'
import SearchBar from '@/components/SearchBar'
import t, { type Lang, LANG_LABELS } from '@/lib/i18n'
import type { SafetyResult } from '@/lib/safety-score'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const DEFAULT_CENTER: [number, number] = [-37.8136, 144.9631]

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
  const abortRef = useRef<AbortController | null>(null)

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
    } catch { /* keep existing areaName */ }
  }, [])

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
  }, [fetchData, reverseGeocode])

  const handleSearch = useCallback((lat: number, lon: number, name?: string) => {
    setCenter([lat, lon])
    if (name) setAreaName(name)
    fetchData(lat, lon)
  }, [fetchData])

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

      {/* Map area */}
      <div className="flex-1 h-full relative z-0">
        <Map
          center={center} locationPin={center}
          safePlaces={safePlaces} reports={reports} liquorVenues={liquorVenues}
          onMapClick={handleMapClick} lang={lang}
        />

        {/* SOS button */}
        <button
          onClick={() => { window.location.href = 'tel:000' }}
          className="absolute bottom-20 right-3 z-[1000] w-14 h-14 rounded-full bg-[var(--danger-red)] text-white font-bold text-sm shadow-lg"
          style={{ boxShadow: '0 0 20px rgba(239,68,68,0.5)' }}
        >
          SOS
        </button>
      </div>

      {/* Panel: bottom sheet (mobile) / right sidebar (desktop) */}
      <div className="
        fixed bottom-0 left-0 right-0 h-[65vh] bg-[var(--surface-base)] rounded-t-3xl
        shadow-[0_-4px_24px_rgba(124,58,237,0.1)] z-[1000] flex flex-col
        md:relative md:h-full md:w-[380px] md:rounded-none
        md:shadow-[-4px_0_24px_rgba(124,58,237,0.05)] md:z-10 md:border-l md:border-[var(--border-default)]
      ">
        {/* Mobile drag handle */}
        <div className="w-full flex justify-center py-3 md:hidden">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Desktop: search + lang toggle */}
        <div className="hidden md:flex gap-2 px-6 pt-5 pb-2">
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
        <div className="flex-1 overflow-hidden px-6 pb-6 md:pt-2">
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
