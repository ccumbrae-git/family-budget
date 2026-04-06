'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { format, subMonths } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
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

interface Vendor {
  name: string
  total: number
}

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

const PIE_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316']

export default function Dashboard() {
  const { signOut, user, token } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

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

  const months = Array.from({ length: 12 }, (_, i) => {
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
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const spend = data?.spend || []
  const prevSpend = data?.prevSpend || []
  const budgets = data?.budgets || []
  const totalSpend = data?.totalSpend || 0
  const prevTotal = prevSpend.reduce((s, x) => s + x.total, 0)
  const vsLastMonth = prevTotal > 0 ? ((totalSpend - prevTotal) / prevTotal) * 100 : null

  const budgetMap = new Map(budgets.map(b => [b.category_id, b]))
  const prevSpendMap = new Map(prevSpend.map(s => [s.category_name + '|' + s.subcategory, s.total]))

  // Category groups (summed)
  const catGroupMap = spend.reduce((acc, s) => {
    const key = s.category_name || 'Other'
    acc.set(key, (acc.get(key) || 0) + s.total)
    return acc
  }, new Map<string, number>())
  const topCategories = Array.from(catGroupMap.entries()).sort((a, b) => b[1] - a[1])

  // Top subcategories
  const topSubcats = [...spend].sort((a, b) => b.total - a.total).slice(0, 10)

  // Alerts
  const alerts = budgets.map(b => {
    const spent = spend.find(s => s.category_id === b.category_id)?.total || 0
    const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0
    return { b, spent, pct, isOver: spent > b.monthly_limit, isWarn: pct >= b.alert_at_percent && spent <= b.monthly_limit }
  }).filter(x => x.isOver || x.isWarn).sort((a, b) => b.pct - a.pct)

  // Over-budget categories
  const overBudget = budgets.filter(b => {
    const spent = spend.find(s => s.category_id === b.category_id)?.total || 0
    return spent > b.monthly_limit
  })

  // Smart insights
  const insights: string[] = []
  if (topCategories[0]) insights.push(`${topCategories[0][0]} is your biggest spend at $${topCategories[0][1].toLocaleString('en-AU', { maximumFractionDigits: 0 })}`)
  if (vsLastMonth !== null) {
    const dir = vsLastMonth > 0 ? 'up' : 'down'
    insights.push(`Total spend is ${dir} ${Math.abs(vsLastMonth).toFixed(0)}% vs last month`)
  }
  if (overBudget.length > 0) insights.push(`${overBudget.length} ${overBudget.length === 1 ? 'category is' : 'categories are'} over budget this month`)
  if (data?.topVendors?.[0]) insights.push(`${data.topVendors[0].name} is your top merchant at $${data.topVendors[0].total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`)
  const biggestSubcat = topSubcats[0]
  if (biggestSubcat) {
    const prev = prevSpendMap.get(biggestSubcat.category_name + '|' + biggestSubcat.subcategory) || 0
    if (prev > 0) {
      const chg = ((biggestSubcat.total - prev) / prev) * 100
      if (Math.abs(chg) > 10) insights.push(`${biggestSubcat.subcategory} is ${chg > 0 ? 'up' : 'down'} ${Math.abs(chg).toFixed(0)}% vs last month`)
    }
  }

  // Pie data (top 8 categories + other)
  const pieData = topCategories.slice(0, 8).map(([name, total]) => ({ name, value: Math.round(total) }))
  if (topCategories.length > 8) {
    const rest = topCategories.slice(8).reduce((s, [, v]) => s + v, 0)
    pieData.push({ name: 'Other', value: Math.round(rest) })
  }

  const maxCat = topCategories[0]?.[1] || 1

  return (
    <div className="px-4 pt-6 space-y-6 pb-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm">{greeting()},</p>
          <h1 className="text-xl font-bold capitalize">
            {firstName} {data?.isFamily && <span className="text-indigo-400 text-base font-normal">· Family</span>}
          </h1>
        </div>
        <button onClick={signOut} className="text-gray-500 text-sm px-3 py-1 rounded-lg border border-gray-800">
          Sign out
        </button>
      </div>

      {/* Month selector */}
      <select
        value={selectedMonth}
        onChange={e => setSelectedMonth(e.target.value)}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
      >
        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>

      {/* ── HERO: Total spend ── */}
      <div className="bg-gradient-to-br from-indigo-900/60 to-indigo-800/30 border border-indigo-700/30 rounded-2xl p-5">
        <p className="text-indigo-300 text-sm">Total spent · {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}</p>
        <p className="text-4xl font-bold mt-1">${totalSpend.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-indigo-300/60 text-xs">{spend.length} categories</p>
          {vsLastMonth !== null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${vsLastMonth > 0 ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}`}>
              {vsLastMonth > 0 ? '▲' : '▼'} {Math.abs(vsLastMonth).toFixed(0)}% vs last month
            </span>
          )}
        </div>

        {/* Quick stat chips */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {budgets.length > 0 && (
            <div className="bg-black/20 rounded-xl px-3 py-2 text-center min-w-[70px]">
              <p className="text-lg font-bold">{overBudget.length}</p>
              <p className="text-indigo-300/70 text-xs">Over budget</p>
            </div>
          )}
          <div className="bg-black/20 rounded-xl px-3 py-2 text-center min-w-[70px]">
            <p className="text-lg font-bold">{(data?.topVendors || []).length}</p>
            <p className="text-indigo-300/70 text-xs">Merchants</p>
          </div>
          <div className="bg-black/20 rounded-xl px-3 py-2 text-center min-w-[70px]">
            <p className="text-lg font-bold">{topCategories.length}</p>
            <p className="text-indigo-300/70 text-xs">Categories</p>
          </div>
          {prevTotal > 0 && (
            <div className="bg-black/20 rounded-xl px-3 py-2 text-center min-w-[70px]">
              <p className="text-lg font-bold">${Math.round(prevTotal / 1000)}k</p>
              <p className="text-indigo-300/70 text-xs">Last month</p>
            </div>
          )}
        </div>
      </div>

      {/* ── SMART ALERTS ── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Smart Alerts
          </h2>
          {alerts.map(({ b, spent, pct, isOver }) => (
            <div key={b.id} className={`rounded-xl p-3.5 border flex items-center justify-between ${isOver ? 'bg-red-900/20 border-red-700/50' : 'bg-amber-900/20 border-amber-700/50'}`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{b.categories?.icon}</span>
                <div>
                  <p className="text-sm font-medium">{b.categories?.subcategory}</p>
                  <p className={`text-xs ${isOver ? 'text-red-400' : 'text-amber-400'}`}>
                    {isOver
                      ? `$${(spent - b.monthly_limit).toLocaleString('en-AU', { maximumFractionDigits: 0 })} over limit`
                      : `${Math.round(pct)}% of $${b.monthly_limit.toLocaleString()} budget`}
                  </p>
                </div>
              </div>
              <p className={`text-sm font-bold ${isOver ? 'text-red-400' : 'text-amber-400'}`}>
                ${spent.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── SMART INSIGHTS ── */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 flex items-center gap-1.5">
            <span className="text-base">💡</span> Insights
          </h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-indigo-400 text-base shrink-0">→</span>
                <p className="text-sm text-gray-200">{ins}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CATEGORIES OVER BUDGET ── */}
      {overBudget.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">🚨 Categories over budget</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {overBudget.map(b => {
              const spent = spend.find(s => s.category_id === b.category_id)?.total || 0
              const pct = Math.round((spent / b.monthly_limit) * 100)
              return (
                <div key={b.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{b.categories?.icon}</span>
                      <p className="text-sm font-medium">{b.categories?.subcategory}</p>
                    </div>
                    <p className="text-sm font-bold text-red-400">
                      ${spent.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
                      <span className="text-xs font-normal text-gray-500"> / ${b.monthly_limit.toLocaleString()}</span>
                    </p>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <p className="text-xs text-red-400 mt-1">{pct}% used</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── HIGH SPEND CATEGORIES ── */}
      {topCategories.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">📊 High spend — categories</h2>
          <div className="bg-gray-900 rounded-xl p-4 space-y-3">
            {topCategories.slice(0, 8).map(([name, total], i) => {
              const bar = (total / maxCat) * 100
              const prevCatTotal = prevSpend.filter(s => s.category_name === name).reduce((s, x) => s + x.total, 0)
              const chg = prevCatTotal > 0 ? ((total - prevCatTotal) / prevCatTotal) * 100 : null
              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <p className="text-sm font-medium">{name}</p>
                      {chg !== null && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${chg > 10 ? 'text-red-400' : chg < -10 ? 'text-green-400' : 'text-gray-500'}`}>
                          {chg > 0 ? '+' : ''}{chg.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold">${total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${bar}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── HIGH SPEND SUBCATEGORIES ── */}
      {topSubcats.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">🔍 High spend — sub-categories</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {topSubcats.map((s, i) => {
              const prev = prevSpendMap.get(s.category_name + '|' + s.subcategory) || 0
              const chg = prev > 0 ? ((s.total - prev) / prev) * 100 : null
              return (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.subcategory}</p>
                    <p className="text-xs text-gray-500">{s.category_name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {chg !== null && (
                      <span className={`text-xs ${chg > 10 ? 'text-red-400' : chg < -10 ? 'text-green-400' : 'text-gray-500'}`}>
                        {chg > 0 ? '+' : ''}{chg.toFixed(0)}%
                      </span>
                    )}
                    <p className="text-sm font-semibold">${s.total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PIE CHART ── */}
      {pieData.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">🥧 Spending breakdown</h2>
          <div className="bg-gray-900 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [`$${v.toLocaleString('en-AU')}`, '']}
                  contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: '#9ca3af', fontSize: '11px' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── MONTHLY TREND ── */}
      {data?.trend && data.trend.some(t => t.total > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">📈 Monthly trend</h2>
          <div className="bg-gray-900 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data.trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number) => [`$${v.toLocaleString('en-AU')}`, 'Spend']}
                  contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {data.trend.map((entry, i) => (
                    <Cell key={i} fill={entry.month === selectedMonth ? '#6366f1' : '#312e81'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── TOP MERCHANTS ── */}
      {(data?.topVendors || []).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">🏪 High spend merchants</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {data!.topVendors.map((v, i) => {
              const maxV = data!.topVendors[0].total
              return (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                        {v.name[0]?.toUpperCase()}
                      </div>
                      <p className="text-sm font-medium truncate max-w-[160px]">{v.name}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">${v.total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden ml-10">
                    <div className="h-full bg-indigo-600/60 rounded-full" style={{ width: `${(v.total / maxV) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && totalSpend === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">📂</p>
          <p className="text-sm">No transactions for this month.</p>
          <p className="text-xs mt-1">Upload your bank statements to get started.</p>
        </div>
      )}
    </div>
  )
}
