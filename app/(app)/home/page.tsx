'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { format, subMonths } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'

interface SpendItem {
  category_id: string
  category_name: string
  subcategory: string
  total: number
}

interface Budget {
  id: string
  category_id: string
  monthly_limit: number
  alert_at_percent: number
  categories: { id: string; name: string; subcategory: string; icon: string; color: string }
}

interface Vendor { name: string; total: number }

interface DashboardData {
  month: string
  totalSpend: number
  spend: SpendItem[]
  prevSpend: SpendItem[]
  budgets: Budget[]
  topVendors: Vendor[]
  trend: { month: string; label: string; total: number }[]
  isFamily: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

function fmtCompact(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${fmt(n)}`
}

type StatusKey = 'over' | 'warn' | 'ok' | 'none'

function getStatus(pct: number | null, warnAt: number): StatusKey {
  if (pct === null) return 'none'
  if (pct > 100) return 'over'
  if (pct >= warnAt) return 'warn'
  return 'ok'
}

const STATUS = {
  over: { bar: '#ef4444', glow: 'rgba(239,68,68,0.3)', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', badge: 'bg-red-500/20 text-red-400', label: 'OVER BUDGET' },
  warn: { bar: '#f59e0b', glow: 'rgba(245,158,11,0.3)', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', badge: 'bg-amber-500/20 text-amber-400', label: 'AT RISK' },
  ok: { bar: '#22c55e', glow: 'rgba(34,197,94,0.25)', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', badge: 'bg-emerald-500/20 text-emerald-400', label: 'ON TRACK' },
  none: { bar: '#6366f1', glow: 'rgba(99,102,241,0.2)', text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', badge: 'bg-indigo-500/20 text-indigo-400', label: 'NO BUDGET' },
}

// SVG circular progress ring
function RingGauge({ pct, size = 80 }: { pct: number; size?: number }) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(pct, 100)
  const offset = circumference - (clamped / 100) * circumference
  const sk: StatusKey = pct > 100 ? 'over' : pct >= 80 ? 'warn' : 'ok'
  const color = STATUS[sk].bar

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease', filter: `drop-shadow(0 0 4px ${STATUS[sk].glow})` }}
      />
    </svg>
  )
}

const tooltipStyle = { background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '12px', color: '#e2e8f0' }

export default function Dashboard() {
  const { signOut, user, token } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSubcategory, setSelectedSubcategory] = useState('')
  const [allCategories, setAllCategories] = useState<{ name: string; subcategory: string }[]>([])

  const fetchDashboard = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard?month=${selectedMonth}`, {
        headers: { authorization: `Bearer ${token}` }
      })
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token, selectedMonth])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  useEffect(() => {
    if (!token) return
    fetch('/api/categories', { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(cats => { if (Array.isArray(cats)) setAllCategories(cats) })
  }, [token])

  const months = Array.from({ length: 24 }, (_, i) => {
    const d = subMonths(new Date(), i)
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') }
  })

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-600">Loading dashboards…</p>
      </div>
    )
  }

  const spend = data?.spend || []
  const budgets = data?.budgets || []
  const prevSpend = data?.prevSpend || []
  const totalSpend = data?.totalSpend || 0
  const prevTotal = prevSpend.reduce((s, x) => s + x.total, 0)
  const vsLastMonth = prevTotal > 0 ? ((totalSpend - prevTotal) / prevTotal) * 100 : null

  // ── Dropdown options from full category list ─────────────────────────────
  const categoryOptions = Array.from(new Set(allCategories.map(c => c.name).filter(Boolean))).sort()
  const subcategoryOptions = selectedCategory
    ? allCategories.filter(c => c.name === selectedCategory).map(c => c.subcategory).filter(Boolean).sort()
    : []

  // ── Filtered spend for dashboards 2 & 3 ──────────────────────────────────
  const filteredSpend = spend.filter(s => {
    if (selectedCategory && s.category_name !== selectedCategory) return false
    if (selectedSubcategory && s.subcategory !== selectedSubcategory) return false
    return true
  })
  const filteredBudgets = budgets.filter(b => {
    if (selectedCategory && b.categories?.name !== selectedCategory) return false
    if (selectedSubcategory && b.categories?.subcategory !== selectedSubcategory) return false
    return true
  })

  // ── Derived budget data (always uses full spend for hero/scorecard) ───────
  const totalBudget = budgets.reduce((s, b) => s + Number(b.monthly_limit), 0)
  const overallPct = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : null
  const remaining = totalBudget > 0 ? totalBudget - totalSpend : 0

  // Subcategory rows — filtered, sorted over → warn → ok
  const subcatRows = filteredBudgets.map(b => {
    const spent = filteredSpend.find(s => s.category_id === b.category_id)?.total || 0
    const limit = Number(b.monthly_limit)
    const pct = limit > 0 ? (spent / limit) * 100 : 0
    const warnAt = Number(b.alert_at_percent) || 80
    const sk = getStatus(pct, warnAt)
    return { b, spent, limit, pct, sk, warnAt, overage: spent - limit }
  }).sort((a, b) => {
    const order = { over: 0, warn: 1, ok: 2, none: 3 }
    if (order[a.sk] !== order[b.sk]) return order[a.sk] - order[b.sk]
    return b.pct - a.pct
  })

  const overCount = subcatRows.filter(r => r.sk === 'over').length
  const warnCount = subcatRows.filter(r => r.sk === 'warn').length
  const okCount = subcatRows.filter(r => r.sk === 'ok').length

  // Category-level spend (filtered)
  const catSpendMap = filteredSpend.reduce((acc, s) => {
    const k = s.category_name || 'Other'
    acc.set(k, (acc.get(k) || 0) + s.total)
    return acc
  }, new Map<string, number>())

  // Category-level budget (sum subcategory limits per category, filtered)
  const catBudgetMap = filteredBudgets.reduce((acc, b) => {
    const k = b.categories?.name || 'Other'
    acc.set(k, (acc.get(k) || 0) + Number(b.monthly_limit))
    return acc
  }, new Map<string, number>())

  const catRows = Array.from(catSpendMap.entries()).map(([name, spent]) => {
    const budget = catBudgetMap.get(name) || 0
    const pct = budget > 0 ? (spent / budget) * 100 : null
    const sk = getStatus(pct, 80)
    return { name, spent, budget, pct, sk }
  }).sort((a, b) => (b.pct ?? b.spent / 1e6) - (a.pct ?? a.spent / 1e6))

  // Smart alerts
  const alerts = subcatRows.filter(r => r.sk === 'over' || r.sk === 'warn')

  // Trend
  const trendData = (data?.trend || []).map(t => ({ ...t, total: Math.round(t.total) }))

  // Group subcategory rows by status for Dashboard 3
  const groupedSubcat: { label: string; rows: typeof subcatRows; sk: StatusKey }[] = []
  const overRows = subcatRows.filter(r => r.sk === 'over')
  const warnRows = subcatRows.filter(r => r.sk === 'warn')
  const okRows = subcatRows.filter(r => r.sk === 'ok')
  if (overRows.length) groupedSubcat.push({ label: 'Over Budget', rows: overRows, sk: 'over' })
  if (warnRows.length) groupedSubcat.push({ label: 'At Risk', rows: warnRows, sk: 'warn' })
  if (okRows.length) groupedSubcat.push({ label: 'On Track', rows: okRows, sk: 'ok' })

  return (
    <div className="px-4 pt-5 space-y-5 pb-10 max-w-lg mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-xs">{greeting()}</p>
          <h1 className="text-lg font-bold tracking-tight">
            {firstName}
            {data?.isFamily && <span className="text-indigo-400 text-sm font-normal ml-1.5">· Family</span>}
          </h1>
        </div>
        <button onClick={signOut} className="text-gray-600 text-xs px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
          Sign out
        </button>
      </div>

      {/* ── Month selector ── */}
      <select
        value={selectedMonth}
        onChange={e => setSelectedMonth(e.target.value)}
        className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/60 appearance-none"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
      >
        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>

      {/* ── Hero: Total Spend ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950/80 via-indigo-900/40 to-purple-950/30 border border-indigo-500/20 rounded-2xl p-5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.15),transparent_60%)]" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-indigo-300/70 text-xs font-medium tracking-wide uppercase">
              {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
            </p>
            <p className="text-4xl font-extrabold tracking-tight mt-1 leading-none">${fmt(totalSpend)}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {totalBudget > 0 && (
                <span className="text-indigo-300/50 text-xs">of ${fmt(totalBudget)} budget</span>
              )}
              {vsLastMonth !== null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${vsLastMonth > 0 ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  {vsLastMonth > 0 ? '▲' : '▼'} {Math.abs(vsLastMonth).toFixed(0)}% vs last mo
                </span>
              )}
            </div>
          </div>
          {overallPct !== null && (
            <div className="relative shrink-0 flex items-center justify-center" style={{ width: 72, height: 72 }}>
              <RingGauge pct={overallPct} size={72} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-sm font-bold leading-none">{Math.round(overallPct)}%</p>
                <p className="text-[9px] text-gray-500 leading-none mt-0.5">used</p>
              </div>
            </div>
          )}
        </div>
        {overallPct !== null && (
          <div className="relative mt-4">
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(overallPct, 100)}%`,
                  background: overallPct > 100 ? '#ef4444' : overallPct >= 80 ? '#f59e0b' : 'linear-gradient(90deg, #6366f1, #818cf8)',
                  boxShadow: overallPct > 100 ? '0 0 8px rgba(239,68,68,0.5)' : overallPct >= 80 ? '0 0 8px rgba(245,158,11,0.4)' : '0 0 8px rgba(99,102,241,0.4)',
                  transition: 'width 0.6s ease'
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Smart Alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {alerts.length} Budget {alerts.length === 1 ? 'Alert' : 'Alerts'}
          </p>
          <div className="space-y-1.5">
            {alerts.map(({ b, spent, limit, pct, sk }) => {
              const s = STATUS[sk]
              return (
                <div key={b.id} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${s.bg} ${s.border}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{b.categories?.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{b.categories?.subcategory}</p>
                      <p className={`text-xs ${s.text}`}>
                        {sk === 'over' ? `$${fmt(spent - limit)} over limit` : `${Math.round(pct)}% of $${fmt(limit)}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${s.text}`}>${fmt(spent)}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${s.badge}`}>{s.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Dashboard Filters ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filter Dashboards</p>
        <div className="flex gap-2">
          <select
            value={selectedCategory}
            onChange={e => { setSelectedCategory(e.target.value); setSelectedSubcategory('') }}
            className={`flex-1 min-w-0 border rounded-xl px-3 py-2.5 text-sm focus:outline-none appearance-none transition-colors ${selectedCategory ? 'bg-indigo-900/30 border-indigo-500/40 text-indigo-200' : 'bg-white/[0.04] border-white/[0.07] text-gray-400'}`}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '14px' }}
          >
            <option value="">All categories</option>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedSubcategory}
            onChange={e => setSelectedSubcategory(e.target.value)}
            disabled={!selectedCategory}
            className={`flex-1 min-w-0 border rounded-xl px-3 py-2.5 text-sm focus:outline-none appearance-none transition-colors disabled:opacity-30 ${selectedSubcategory ? 'bg-indigo-900/30 border-indigo-500/40 text-indigo-200' : 'bg-white/[0.04] border-white/[0.07] text-gray-400'}`}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '14px' }}
          >
            <option value="">All subcategories</option>
            {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {(selectedCategory || selectedSubcategory) && (
          <div className="flex items-center justify-between px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
            <p className="text-xs text-indigo-300 truncate">
              {[selectedCategory, selectedSubcategory].filter(Boolean).join(' › ')}
            </p>
            <button
              onClick={() => { setSelectedCategory(''); setSelectedSubcategory('') }}
              className="text-xs text-indigo-400 hover:text-white transition-colors ml-3 shrink-0"
            >
              Clear ✕
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          DASHBOARD 1 — Budget Health Scorecard
      ══════════════════════════════════════════ */}
      {budgets.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Budget Health</p>
            <span className="text-[10px] text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-full border border-white/[0.05]">Dashboard 1</span>
          </div>

          {/* 2×2 stat grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Remaining */}
            <div className={`rounded-2xl p-4 border ${remaining >= 0 ? 'bg-emerald-500/[0.07] border-emerald-500/20' : 'bg-red-500/[0.07] border-red-500/20'}`}>
              <p className="text-[11px] text-gray-500 font-medium mb-2">Remaining</p>
              <p className={`text-2xl font-extrabold tracking-tight leading-none ${remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {remaining >= 0 ? `$${fmt(remaining)}` : `-$${fmt(Math.abs(remaining))}`}
              </p>
              <p className="text-[11px] text-gray-600 mt-1.5">${fmt(totalBudget)} total limit</p>
            </div>

            {/* Budget used */}
            <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06]">
              <p className="text-[11px] text-gray-500 font-medium mb-2">Budget used</p>
              <p className={`text-2xl font-extrabold tracking-tight leading-none ${(overallPct || 0) > 100 ? 'text-red-400' : (overallPct || 0) >= 80 ? 'text-amber-400' : 'text-white'}`}>
                {overallPct !== null ? `${Math.round(overallPct)}%` : '—'}
              </p>
              <p className="text-[11px] text-gray-600 mt-1.5">${fmt(totalSpend)} spent</p>
            </div>

            {/* Over budget */}
            <div className={`rounded-2xl p-4 border ${overCount > 0 ? 'bg-red-500/[0.07] border-red-500/20' : 'bg-white/[0.03] border-white/[0.06]'}`}>
              <p className="text-[11px] text-gray-500 font-medium mb-2">Over budget</p>
              <p className={`text-2xl font-extrabold tracking-tight leading-none ${overCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {overCount}
              </p>
              <p className="text-[11px] text-gray-600 mt-1.5">{overCount === 1 ? 'category' : 'categories'}</p>
            </div>

            {/* Status summary */}
            <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06]">
              <p className="text-[11px] text-gray-500 font-medium mb-2">Status</p>
              <div className="space-y-1.5 mt-1">
                {warnCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <p className="text-xs text-amber-400">{warnCount} at risk</p>
                  </div>
                )}
                {okCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <p className="text-xs text-emerald-400">{okCount} on track</p>
                  </div>
                )}
                {warnCount === 0 && okCount === 0 && (
                  <p className="text-xs text-gray-600">No data</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          DASHBOARD 2 — Category Budget vs Actual
      ══════════════════════════════════════════ */}
      {catRows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Category Performance</p>
            <span className="text-[10px] text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-full border border-white/[0.05]">Dashboard 2</span>
          </div>

          <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
            {catRows.map(({ name, spent, budget, pct, sk }, idx) => {
              const s = STATUS[sk]
              const barPct = pct !== null ? Math.min(pct, 100) : 100
              const isLast = idx === catRows.length - 1
              return (
                <div
                  key={name}
                  className={`px-4 py-3.5 bg-white/[0.025] ${!isLast ? 'border-b border-white/[0.05]' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <p className="text-sm font-semibold text-gray-100 leading-tight">{name}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {pct !== null && pct > 100 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.badge}`}>OVER</span>
                      )}
                      <p className={`text-sm font-bold ${s.text}`}>${fmt(spent)}</p>
                    </div>
                  </div>

                  <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      style={{
                        width: `${barPct}%`,
                        background: s.bar,
                        boxShadow: `0 0 6px ${s.glow}`
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[11px] text-gray-600">
                      {budget > 0 ? `$${fmt(budget)} budget` : 'No budget set'}
                    </p>
                    {pct !== null && (
                      <p className={`text-[11px] font-medium ${s.text}`}>
                        {Math.round(pct)}%
                        {pct > 100 ? ` (+$${fmt(spent - budget)})` : ` · $${fmt(budget - spent)} left`}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          DASHBOARD 3 — Subcategory Budget Tracker
      ══════════════════════════════════════════ */}
      {subcatRows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Subcategory Tracker</p>
            <span className="text-[10px] text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-full border border-white/[0.05]">Dashboard 3</span>
          </div>

          <div className="space-y-4">
            {groupedSubcat.map(({ label, rows, sk }) => {
              const s = STATUS[sk]
              return (
                <div key={label}>
                  {/* Group header */}
                  <div className={`flex items-center gap-2 mb-2`}>
                    <span className={`w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: s.bar }} />
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${s.text}`}>{label}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${s.badge}`}>{rows.length}</span>
                  </div>

                  <div className="space-y-2">
                    {rows.map(({ b, spent, limit, pct, sk: rsk, overage }) => {
                      const rs = STATUS[rsk]
                      const barPct = Math.min(pct, 100)
                      return (
                        <div key={b.id} className={`rounded-xl border px-4 py-3.5 ${rs.bg} ${rs.border}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-xl shrink-0" role="img">{b.categories?.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate leading-tight">{b.categories?.subcategory}</p>
                                  <p className="text-[11px] text-gray-600 truncate">{b.categories?.name}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className={`text-sm font-bold ${rs.text}`}>{fmtCompact(spent)}</p>
                                  <p className="text-[11px] text-gray-600">{fmtCompact(limit)}</p>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="relative h-1.5 bg-black/20 rounded-full overflow-hidden">
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${barPct}%`,
                                    background: rs.bar,
                                    boxShadow: `0 0 5px ${rs.glow}`
                                  }}
                                />
                              </div>

                              <div className="flex items-center justify-between mt-1.5">
                                <p className={`text-[11px] ${rs.text}`}>{Math.round(pct)}% used</p>
                                {rsk === 'over'
                                  ? <p className="text-[11px] font-semibold text-red-400">+{fmtCompact(overage)} over</p>
                                  : rsk === 'warn'
                                    ? <p className="text-[11px] text-amber-400">{fmtCompact(limit - spent)} left</p>
                                    : <p className="text-[11px] text-emerald-400">{fmtCompact(limit - spent)} remaining</p>
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════
          DASHBOARD 4 — Monthly Spend vs Budget Trend
      ══════════════════════════════════════════ */}
      {trendData.some(t => t.total > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Spend vs Budget Trend</p>
            <span className="text-[10px] text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-full border border-white/[0.05]">Dashboard 4</span>
          </div>

          <div className="bg-white/[0.025] border border-white/[0.06] rounded-2xl p-4">
            {totalBudget > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm bg-indigo-500 inline-block" />
                  <span className="text-[11px] text-gray-500">Monthly spend</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4" style={{ borderTop: '2px dashed #ef4444' }} />
                  <span className="text-[11px] text-gray-500">Budget limit ${fmtCompact(totalBudget)}</span>
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={trendData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="30%">
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#4b5563', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [`$${Number(v).toLocaleString('en-AU')}`, 'Spend']}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                {totalBudget > 0 && (
                  <ReferenceLine
                    y={totalBudget}
                    stroke="#ef4444"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                  />
                )}
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {trendData.map((entry, i) => {
                    const isSelected = entry.month === selectedMonth
                    const isOver = totalBudget > 0 && entry.total > totalBudget
                    return (
                      <Cell
                        key={i}
                        fill={isOver ? '#ef4444' : isSelected ? '#6366f1' : '#1e1b4b'}
                        opacity={isSelected ? 1 : isOver ? 0.85 : 0.6}
                        style={{ filter: isSelected ? 'drop-shadow(0 0 4px rgba(99,102,241,0.5))' : isOver ? 'drop-shadow(0 0 4px rgba(239,68,68,0.4))' : 'none' }}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Top Merchants ── */}
      {(data?.topVendors || []).length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top Merchants</p>
          <div className="rounded-2xl overflow-hidden border border-white/[0.06]">
            {data!.topVendors.slice(0, 6).map((v, i) => {
              const maxSpend = data!.topVendors[0]?.total || 1
              const barWidth = (v.total / maxSpend) * 100
              return (
                <div key={i} className={`relative px-4 py-3 bg-white/[0.02] ${i < 5 ? 'border-b border-white/[0.05]' : ''} overflow-hidden`}>
                  <div className="absolute inset-y-0 left-0 bg-indigo-500/5" style={{ width: `${barWidth}%` }} />
                  <div className="relative flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-300 truncate">{v.name}</p>
                    <p className="text-sm font-semibold text-gray-200 shrink-0">${fmt(v.total)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!loading && totalSpend === 0 && (
        <div className="text-center py-20 text-gray-600">
          <p className="text-5xl mb-4">📂</p>
          <p className="text-sm font-medium text-gray-500">No transactions this month</p>
          <p className="text-xs mt-1.5">Upload your bank statements to get started</p>
        </div>
      )}
    </div>
  )
}
