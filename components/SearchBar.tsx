'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, MapPin } from 'lucide-react'
import type { Lang } from '@/lib/i18n'

interface NominatimResult {
  place_id: number; display_name: string; lat: string; lon: string
}
interface Props {
  onSelect: (lat: number, lon: number, displayName?: string) => void
  lang: Lang
  placeholder: string
}

const VIEWBOX = '144.3,-38.5,145.8,-37.2'
const ACCEPT_LANG: Record<Lang, string> = { zh: 'zh-CN,zh', en: 'en-AU,en' }

export default function SearchBar({ onSelect, lang, placeholder }: Props) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [open, setOpen]       = useState(false)
  const [active, setActive]   = useState(-1)
  const [focused, setFocused] = useState(false)
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef              = useRef<HTMLInputElement>(null)
  const wrapRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const acceptLang = ACCEPT_LANG[lang]
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=au&viewbox=${VIEWBOX}&bounded=1&limit=6&addressdetails=0&accept-language=${encodeURIComponent(acceptLang)}`
        const res = await fetch(url, { headers: { 'Accept-Language': acceptLang } })
        const data: NominatimResult[] = await res.json()
        setResults(data); setOpen(data.length > 0); setActive(-1)
      } catch { setResults([]) }
    }, 300)
  }, [query, lang])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); selectResult(results[active]) }
    if (e.key === 'Escape') setOpen(false)
  }

  function selectResult(r: NominatimResult) {
    const parts = r.display_name.split(',')
    const shortName = parts.slice(0, 2).join(',').trim()
    setQuery(shortName)
    setOpen(false)
    onSelect(parseFloat(r.lat), parseFloat(r.lon), shortName)
  }

  return (
    <div ref={wrapRef} className="relative w-full z-[1000]">
      <div className={`flex items-center bg-[var(--surface-card)] rounded-2xl h-12 px-4 shadow-[var(--shadow-float)] border transition-all duration-200 relative overflow-hidden ${
        focused ? 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/10' : 'border-[var(--border-default)]'
      }`}>
        {focused && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--brand-primary)]" />}
        <Search className="text-[var(--brand-primary)] mr-3 flex-shrink-0" size={18} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true) }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        {query && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus() }}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none ml-1"
          >×</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--surface-card)] rounded-2xl shadow-[var(--shadow-float)] border border-[var(--border-default)] overflow-hidden py-2 z-[2000]">
          {results.map((r, i) => {
            const parts = r.display_name.split(',')
            const title = parts.slice(0, 2).join(',').trim()
            const sub   = parts.slice(2, 4).join(',').trim()
            return (
              <button
                key={r.place_id}
                onMouseEnter={() => setActive(i)}
                onMouseDown={() => selectResult(r)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors group ${
                  active === i ? 'bg-[var(--surface-subtle)]' : 'hover:bg-[var(--surface-subtle)]'
                }`}
              >
                <MapPin size={16} className="text-[var(--text-muted)] group-hover:text-[var(--brand-primary)] flex-shrink-0 transition-colors" />
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-primary)] font-medium group-hover:text-[var(--brand-primary)] transition-colors truncate">{title}</div>
                  {sub && <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{sub}</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
