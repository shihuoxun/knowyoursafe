'use client'

import { useState } from 'react'
import { Clock, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Shield, Siren, HandWaving, Flashlight, Moon, Warning,
  PoliceCar, Hospital, Train, Pill, FirstAidKit,
  ShareNetwork,
} from '@phosphor-icons/react'
import type { SafetyResult, FactorResult } from '@/lib/safety-score'
import type { FootfallData } from '@/app/page'
import type { Lang, Translations } from '@/lib/i18n'

interface SafePlace {
  id: number; name: string; category: string; address: string
  lat: number; lon: number; distance_m: number; hours: string | null
}
interface Report {
  id: number; lat: number; lon: number; category: string
  description: string | null; reported_at: string; distance_m?: number
  time_of_day?: string | null
}
type ReportFilter = 'all' | 'night' | 'today'

interface Props {
  safety: SafetyResult | null
  footfall: FootfallData | null
  safePlaces: SafePlace[]
  reports: Report[]
  reportFilter: ReportFilter
  onFilterChange: (f: ReportFilter) => void
  loading: boolean
  gradeColor: string
  areaName: string
  lang: Lang
  tr: Translations
  onReportClick: () => void
  onShare: () => void
}

const REPORT_ICON: Record<string, React.ReactNode> = {
  unsafe:        <Siren weight="duotone" size={18} />,
  harassment:    <HandWaving weight="duotone" size={18} />,
  poor_lighting: <Flashlight weight="duotone" size={18} />,
  isolated:      <Moon weight="duotone" size={18} />,
  other:         <Warning weight="duotone" size={18} />,
}
const SEVERITY_COLOR: Record<string, string> = {
  unsafe: '#EF4444', harassment: '#F97316', poor_lighting: '#F59E0B',
  isolated: '#A78BFA', other: '#9CA3AF',
}
const PLACE_ICON: Record<string, React.ReactNode> = {
  police:     <PoliceCar weight="duotone" size={20} />,
  hospital:   <Hospital weight="duotone" size={20} />,
  safe_place: <Shield weight="duotone" size={20} />,
  ptv:        <Train weight="duotone" size={20} />,
  pharmacy:   <Pill weight="duotone" size={20} />,
}
const PLACE_COLOR: Record<string, string> = {
  police: '#3B82F6', hospital: '#10B981', safe_place: '#8B5CF6',
  ptv: '#F59E0B', pharmacy: '#06B6D4',
}
const GRADE_MESSAGES: Record<string, { en: string; zh: string }> = {
  A: { en: 'Generally safe 🌟', zh: '区域较安全 🌟' },
  B: { en: 'Mostly safe, stay aware ✨', zh: '基本安全，注意周围 ✨' },
  C: { en: 'Exercise caution ⚠️', zh: '一般，保持警觉 ⚠️' },
  D: { en: 'High alert area 🛑', zh: '较危险，建议结伴 🛑' },
  F: { en: 'High risk area 🚫', zh: '高风险区域 🚫' },
}

function minutesAgo(dateStr: string): number {
  return Math.round((Date.now() - new Date(dateStr).getTime()) / 60000)
}

function TimeAgo({ minutes, tr }: { minutes: number; tr: Translations }) {
  return <span className="text-[var(--text-muted)] text-xs">{tr.timeAgo(minutes)}</span>
}

function FactorRow({ label, factor }: { label: string; factor: FactorResult }) {
  const pct = Math.round((factor.score / factor.max) * 100)
  const color = pct >= 70 ? 'var(--safe-green)' : pct >= 45 ? 'var(--warn-yellow)' : 'var(--danger-red)'
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
        <span>{label}</span>
        <span style={{ color }}>{factor.score}/{factor.max}</span>
      </div>
      <div className="h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function SafetyPanel({
  safety, footfall, safePlaces, reports, reportFilter, onFilterChange,
  loading, gradeColor, areaName, lang, tr, onReportClick, onShare,
}: Props) {
  const [scoreOpen, setScoreOpen] = useState(false)
  const zh = lang === 'zh'

  const now = Date.now()
  const filteredReports = reports.filter(r => {
    if (reportFilter === 'night') return r.time_of_day === 'night'
    if (reportFilter === 'today') return (now - new Date(r.reported_at).getTime()) < 86400000
    return true
  })

  const FACTOR_LABELS: Record<string, string> = zh
    ? { lighting: '街道照明', footfall: '人流密度', facilities: '周边设施', crime: '历史犯罪' }
    : { lighting: 'Street lighting', footfall: 'Foot traffic', facilities: 'Nearby facilities', crime: 'Crime history' }

  const gradeMsg = safety ? (GRADE_MESSAGES[safety.grade]?.[zh ? 'zh' : 'en'] ?? '') : ''
  const score = safety?.score ?? 0
  const circumference = 2 * Math.PI * 45

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-4 pb-28 md:pb-0">

        {/* ── Safety score card ── */}
        <div className="card p-5">
          <div className="flex justify-between items-start mb-1">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight">{areaName}</h2>
              <p className="text-[var(--text-secondary)] text-sm mt-0.5">{loading ? tr.loading : gradeMsg}</p>
            </div>
            {safety && (
              <div className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: gradeColor }}>
                {zh ? '等级' : 'Grade'} {safety.grade}
              </div>
            )}
          </div>

          <div className="flex items-center gap-5 mt-4">
            {/* Circular score ring */}
            <div className="relative w-24 h-24 flex-shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border-default)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="45" fill="none"
                  stroke={loading || !safety ? 'var(--border-default)' : gradeColor}
                  strokeWidth="8"
                  strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--brand-primary)] border-t-transparent animate-spin" />
                ) : (
                  <span className="text-3xl font-bold" style={{ color: safety ? gradeColor : 'var(--text-muted)' }}>
                    {safety ? score : '–'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {zh
                  ? '基于社区举报、路灯、人流和历史犯罪数据综合评分，仅供参考。'
                  : 'Based on community reports, lighting, foot traffic and crime history. For guidance only.'}
              </p>
              {/* Score breakdown toggle */}
              {safety && (
                <button
                  onClick={() => setScoreOpen(v => !v)}
                  className="mt-2 flex items-center gap-1 text-xs text-[var(--brand-primary)] font-medium"
                >
                  {scoreOpen
                    ? <><ChevronDown size={13} />{zh ? '收起细分' : 'Hide breakdown'}</>
                    : <><ChevronRight size={13} />{zh ? '查看细分' : 'Score breakdown'}</>
                  }
                </button>
              )}
            </div>
          </div>

          {/* Expandable breakdown */}
          {scoreOpen && safety && (
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
              {(Object.entries(safety.factors) as [string, FactorResult][])
                .filter(([, f]) => f.available)
                .map(([key, f]) => <FactorRow key={key} label={FACTOR_LABELS[key] ?? key} factor={f} />)
              }
              {(Object.entries(safety.factors) as [string, FactorResult][])
                .filter(([, f]) => !f.available)
                .map(([key]) => (
                  <div key={key} className="flex justify-between text-xs text-[var(--text-muted)] mb-2">
                    <span>{FACTOR_LABELS[key] ?? key}</span>
                    <span>{zh ? '无数据' : 'No data'}</span>
                  </div>
                ))
              }
              <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">{safety.note}</p>
            </div>
          )}
        </div>

        {/* ── Report filters + list ── */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-[var(--text-primary)]">
              {zh ? '社区举报' : 'Community Reports'}
            </h3>
            {reports.length > 0 && (
              <span className="text-xs text-[var(--brand-primary)] font-medium">
                {tr.reportCount(reports.length)}
              </span>
            )}
          </div>

          {/* Filter tabs */}
          <div className="bg-[var(--surface-subtle)] p-1 rounded-xl flex gap-1 mb-4">
            {(['all', 'night', 'today'] as ReportFilter[]).map(f => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 capitalize ${
                  reportFilter === f
                    ? 'bg-[var(--brand-primary)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:bg-white/50'
                }`}
              >
                {f === 'all' ? tr.filterAll : f === 'night' ? tr.filterNight : tr.filterToday}
              </button>
            ))}
          </div>

          {/* Report cards */}
          {loading ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-6">{tr.loading}</p>
          ) : filteredReports.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">{tr.noReports}</p>
          ) : (
            <div className="space-y-3">
              {filteredReports.slice(0, 8).map(r => {
                const mins = minutesAgo(r.reported_at)
                const isRecent = mins < 120
                const color = SEVERITY_COLOR[r.category] ?? SEVERITY_COLOR.other
                const icon = REPORT_ICON[r.category] ?? <Warning weight="duotone" size={18} />
                const catLabel = tr.categories.find(c => c.value === r.category)?.label ?? r.category
                return (
                  <div key={r.id} className="bg-[var(--surface-card)] rounded-xl p-4 shadow-sm border border-[var(--border-subtle)] relative overflow-hidden transition-all hover:-translate-y-px hover:shadow-md">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: color }} />
                    <div className="pl-3">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span style={{ color }}>{icon}</span>
                          <span className="font-medium text-[var(--text-primary)] text-sm">{catLabel}</span>
                          {isRecent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold">
                              {tr.recentBadge}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={11} className="text-[var(--text-muted)]" />
                          <TimeAgo minutes={mins} tr={tr} />
                        </div>
                      </div>
                      {r.description && (
                        <p className="text-[var(--text-secondary)] text-sm truncate">{r.description}</p>
                      )}
                      {r.distance_m !== undefined && (
                        <p className="text-xs text-[var(--text-muted)] mt-1">{tr.distance(r.distance_m)} away</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Footfall ── */}
        {footfall?.available && (
          <div className="card p-4">
            <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">{tr.footfallTitle}</h4>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-2xl font-bold text-[var(--brand-primary)]">{footfall.current}</span>
                <span className="text-xs text-[var(--text-muted)] ml-1">{tr.perMin}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-[var(--text-primary)]">{tr.footfallLevel[footfall.level ?? ''] ?? footfall.level}</div>
                <div className="text-xs text-[var(--text-secondary)]">{tr.trend[footfall.trend ?? ''] ?? ''}</div>
              </div>
            </div>
            {footfall.sensorName && (
              <p className="text-xs text-[var(--text-muted)] mt-2">{footfall.sensorName} · {tr.awayM(footfall.distanceMeters ?? 0)}</p>
            )}
          </div>
        )}

        {/* ── Safe places ── */}
        {safePlaces.length > 0 && (
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] mb-3">{tr.nearbyTitle}</h3>
            <div className="space-y-2">
              {safePlaces.slice(0, 5).map(p => {
                const placeIcon = PLACE_ICON[p.category] ?? <Shield weight="duotone" size={20} />
                const placeColor = PLACE_COLOR[p.category] ?? '#9CA3AF'
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-[var(--surface-card)] rounded-xl p-3 border border-[var(--border-subtle)]">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: placeColor + '15', color: placeColor }}>
                      {placeIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)] truncate">{p.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">{tr.awayM(p.distance_m)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky bottom buttons ── */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[var(--border-subtle)] md:relative md:bg-transparent md:border-t-0 md:p-0 md:pt-4 flex gap-3 z-50">
        <button onClick={onReportClick} className="flex-1 btn-primary py-3 text-sm">
          <Siren weight="fill" size={16} className="mr-2" />
          {zh ? '举报隐患' : 'Report Issue'}
        </button>
        <button onClick={onShare} className="flex-1 btn-ghost py-3 text-sm">
          <ShareNetwork weight="regular" size={16} className="mr-2" />
          {zh ? '分享位置' : 'Share Location'}
        </button>
      </div>
    </div>
  )
}
