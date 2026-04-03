'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { X, Siren, HandWaving, Flashlight, Moon, Warning, Check } from '@phosphor-icons/react'
import type { Lang, Translations } from '@/lib/i18n'

interface Props {
  isOpen: boolean
  lat: number
  lon: number
  lang: Lang
  tr: Translations
  onClose: () => void
  onSubmitted: () => void
}

const REPORT_TYPES = [
  { value: 'unsafe',        icon: Siren,      weight: 'duotone' as const, en: 'Generally Unsafe',     zh: '总体不安全' },
  { value: 'harassment',    icon: HandWaving, weight: 'duotone' as const, en: 'Harassment',           zh: '骚扰/跟踪' },
  { value: 'poor_lighting', icon: Flashlight, weight: 'duotone' as const, en: 'Poor Lighting',        zh: '照明不足' },
  { value: 'isolated',      icon: Moon,       weight: 'duotone' as const, en: 'Isolated / No People', zh: '偏僻/无人' },
  { value: 'other',         icon: Warning,    weight: 'duotone' as const, en: 'Other Issue',          zh: '其他问题' },
]

function getAnonId(): string {
  let id = localStorage.getItem('msafe_anon')
  if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem('msafe_anon', id) }
  return id
}

export default function ReportModal({ isOpen, lat, lon, lang, tr, onClose, onSubmitted }: Props) {
  const [selectedType, setSelectedType] = useState('')
  const [description, setDescription]   = useState('')
  const [timeOfDay, setTimeOfDay]       = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [success, setSuccess]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const overlayRef                      = useRef<HTMLDivElement>(null)
  const zh = lang === 'zh'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedType) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat, lon, category: selectedType,
          description: description.trim() || null,
          timeOfDay: timeOfDay || null,
          anonId: getAnonId(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tr.submitError)
      setSubmitting(false); setSuccess(true)
      setTimeout(() => {
        setSuccess(false); setSelectedType(''); setDescription(''); setTimeOfDay('')
        onSubmitted()
      }, 1500)
    } catch (err: any) {
      setError(err.message); setSubmitting(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center"
    >
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-[4px]" onClick={onClose} />

      <div className="relative w-full md:w-[500px] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col" style={{ maxHeight: '92dvh' }}>
        {/* Top gradient bar */}
        <div className="h-1 w-full flex-shrink-0" style={{ backgroundImage: 'var(--brand-gradient)' }} />

        {/* Header — sticky, always visible */}
        <div className="flex justify-between items-center px-5 pt-4 pb-3 flex-shrink-0 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{tr.reportTitle}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--brand-primary)] transition-colors flex-shrink-0"
          >
            <X weight="bold" size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-6 pt-4">

          <p className="text-xs text-[var(--text-muted)] mb-5">
            {tr.locationLabel}: {lat.toFixed(5)}, {lon.toFixed(5)} · {tr.anonymous}
          </p>

          <form onSubmit={handleSubmit}>
            {/* Type grid */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">{tr.categoryLabel}</label>
              <div className="grid grid-cols-2 gap-2.5">
                {REPORT_TYPES.map(({ value, icon: Icon, weight, en, zh: zhLabel }) => {
                  const selected = selectedType === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelectedType(value)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-[1.5px] transition-all duration-200 ${
                        selected
                          ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5 text-[var(--brand-primary)]'
                          : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--brand-secondary)]'
                      }`}
                    >
                      <Icon weight={weight} size={24} className="mb-2" />
                      <span className="text-xs font-medium text-center leading-tight">{zh ? zhLabel : en}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time of day */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">{tr.timeLabel}</label>
              <select
                value={timeOfDay}
                onChange={e => setTimeOfDay(e.target.value)}
                className="w-full p-3 rounded-xl border-[1.5px] border-[var(--border-default)] bg-white text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--brand-primary)] transition-colors"
              >
                <option value="">{tr.timeUnknown}</option>
                {tr.timeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">{tr.descLabel}</label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 200))}
                placeholder={tr.descPlaceholder}
                className="w-full p-3 rounded-xl border-[1.5px] border-[var(--border-default)] bg-white text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--brand-primary)] transition-colors resize-none"
              />
              <div className="text-right text-xs text-[var(--text-muted)] mt-1">{description.length}/200</div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={!selectedType || submitting || success}
              className={`w-full h-[52px] rounded-xl text-base font-medium text-white transition-all duration-300 flex items-center justify-center ${
                success
                  ? 'bg-[var(--safe-green)]'
                  : !selectedType
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'cursor-pointer hover:opacity-90 active:scale-[0.98]'
              }`}
              style={!success && selectedType ? { backgroundImage: 'var(--brand-gradient)' } : {}}
            >
              {submitting ? (
                <><Loader2 className="animate-spin mr-2" size={20} />{tr.submitting}</>
              ) : success ? (
                <><Check weight="bold" className="mr-2" size={20} />{zh ? '举报已提交' : 'Report Submitted'}</>
              ) : (
                tr.submitBtn
              )}
            </button>
          </form>
        </div>{/* end scrollable body */}
      </div>
    </div>
  )
}
