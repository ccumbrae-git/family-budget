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

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316']

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
  const prevSpendMap = new Map(prevSpend.map(s => [`${s.category_name}|${s.subcategory}`, s.total]))

  // Category totals
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
    const limit = Number(b.monthly_limit)
    const spent = spend.find(s => s.category_id === b.category_id)?.total || 0
    const pct = limit > 0 ? (spent / limit) * 100 : 0
    return { b, spent, pct, isOver: spent > limit, isWarn: pct >= b.alert_at_percent && spent <= limit }
  }).filter(x => x.isOver || x.isWarn).sort((a, b) => b.pct - a.pct)

  const overBudget = budgets.filter(b => {
    const spent = spend.find(s => s.category_id === b.category_id)?.total || 0
    return spent > Number(b.monthly_limit)
  })

  // Smart insights
  const insights: string[] = []
  if (topCategories[0]) insights.push(`${topCategories[0][0]} is your biggest spend at $${topCategories[0][1].toLocaleString('en-AU', { maximumFractionDigits: 0 })}`)
  if (vsLastMonth !== null) insights.push(`Total spend is ${vsLastMonth > 0 ? 'up' : 'down'} ${Math.abs(vsLastMonth).toFixed(0)}% vs last month`)
  if (overBudget.length > 0) insights.push(`${overBudget.length} ${overBudget.length === 1 ? 'category is' : 'categories are'} over budget`)
  if (data?.topVendors?.[0]) insights.push(`${data.topVendors[0].name} is your top merchant at $${data.topVendors[0].total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`)
  if (topSubcats[0]) {
    const prev = prevSpendMap.get(`${topSubcats[0].category_name}|${topSubcats[0].subcategory}`) || 0
    if (prev > 0) {
      const chg = ((topSubcats[0].total - prev) / prev) * 100
      if (Math.abs(chg) > 10) insights.push(`${topSubcats[0].subcategory} is ${chg > 0 ? 'up' : 'down'} ${Math.abs(chg).toFixed(0)}% vs last month`)
    }
  }

  // Category bar chart data
  const catChartData = topCategories.slice(0, 8).map(([name, total]) => {
    const label = name || 'Uncategorised'
    return {
      name: label.length > 12 ? label.slice(0, 11) + '…' : label,
      fullName: label,
      total: Math.round(total)
    }
  })

  // Subcategory bar chart data
  const subcatChartData = topSubcats.slice(0, 8).map(s => {
    const label = s.subcategory || 'Uncategorised'
    return {
      name: label.length > 12 ? label.slice(0, 11) + '…' : label,
      fullName: label,
      total: Math.round(s.total)
    }
  })

  // Pie chart data
  const pieData = topCategories.slice(0, 8).map(([name, total]) => ({ name, value: Math.round(total) }))
  if (topCategories.length > 8) {
    pieData.push({ name: 'Other', value: Math.round(topCategories.slice(8).reduce((s, [, v]) => s + v, 0)) })
  }

  const tooltipStyle = { background: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }
  const labelStyle = { color: '#9ca3af' }

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
        <button onClick={signOut} className="text-gray-500 text-sm px-3 py-1 rounded-lg border border-gray-800">Sign out</button>
      </div>

      {/* Month selector */}
      <select
        value={selectedMonth}
        onChange={e => setSelectedMonth(e.target.value)}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
      >
        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>

      {/* ── HERO ── */}
      <div className="bg-gradient-to-br from-indigo-900/60 to-indigo-800/30 border border-indigo-700/30 rounded-2xl p-5">
        <p className="text-indigo-300 text-sm">Total spent · {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}</p>
        <p className="text-4xl font-bold mt-1">${totalSpend.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <p className="text-indigo-300/60 text-xs">{topCategories.length} categories</p>
          {vsLastMonth !== null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${vsLastMonth > 0 ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}`}>
              {vsLastMonth > 0 ? '▲' : '▼'} {Math.abs(vsLastMonth).toFixed(0)}% vs last month
            </span>
          )}
        </div>
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
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Smart Alerts
          </h2>
          {alerts.map(({ b, spent, pct, isOver }) => (
            <div key={b.id} className={`rounded-xl p-3.5 border flex items-center justify-between ${isOver ? 'bg-red-900/20 border-red-700/50' : 'bg-amber-900/20 border-amber-700/50'}`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{b.categories?.icon}</span>
                <div>
                  <p className="text-sm font-medium">{b.categories?.subcategory}</p>
                  <p className={`text-xs ${isOver ? 'text-red-400' : 'text-amber-400'}`}>
                    {isOver ? `$${(spent - Number(b.monthly_limit)).toLocaleString('en-AU', { maximumFractionDigits: 0 })} over limit` : `${Math.round(pct)}% of $${Number(b.monthly_limit).toLocaleString()} budget`}
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

      {/* ── INSIGHTS ── */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">💡 Insights</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-indigo-400 text-sm shrink-0">→</span>
                <p className="text-sm text-gray-200">{ins}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CATEGORIES OVER BUDGET ── */}
      {overBudget.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">🚨 Over budget</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {overBudget.map(b => {
              const limit = Number(b.monthly_limit)
              const spent = spend.find(s => s.category_id === b.category_id)?.total || 0
              const pct = Math.round((spent / limit) * 100)
              return (
                <div key={b.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{b.categories?.icon}</span>
                      <p className="text-sm font-medium">{b.categories?.subcategory}</p>
                    </div>
                    <p className="text-sm font-bold text-red-400">
                      ${spent.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
                      <span className="text-xs font-normal text-gray-500"> / ${limit.toLocaleString()}</span>
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

      {/* ── HIGH SPEND — CATEGORIES (column chart) ── */}
      {catChartData.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">📊 High spend — categories</h2>
          <div className="bg-gray-900 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={catChartData} margin={{ top: 4, right: 4, left: 4, bottom: 40 }}>
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number, _: unknown, props: { payload?: { fullName?: string } }) => [`$${v.toLocaleString('en-AU')}`, props.payload?.fullName || '']}
                  contentStyle={tooltipStyle} labelStyle={labelStyle} labelFormatter={() => ''}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {catChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── HIGH SPEND — SUBCATEGORIES (column chart) ── */}
      {subcatChartData.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">🔍 High spend — sub-categories</h2>
          <div className="bg-gray-900 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={subcatChartData} margin={{ top: 4, right: 4, left: 4, bottom: 40 }}>
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number, _: unknown, props: { payload?: { fullName?: string } }) => [`$${v.toLocaleString('en-AU')}`, props.payload?.fullName || '']}
                  contentStyle={tooltipStyle} labelStyle={labelStyle} labelFormatter={() => ''}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {subcatChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString('en-AU')}`, '']} contentStyle={tooltipStyle} labelStyle={labelStyle} />
                <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ color: '#9ca3af', fontSize: '11px' }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── MONTHLY TREND (column chart) ── */}
      {data?.trend && data.trend.some(t => t.total > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">📈 Monthly trend</h2>
          <div className="bg-gray-900 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={data.trend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString('en-AU')}`, 'Spend']} contentStyle={tooltipStyle} labelStyle={labelStyle} />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {data.trend.map((entry, i) => <Cell key={i} fill={entry.month === selectedMonth ? '#6366f1' : '#312e81'} />)}
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
          <div className="bg-gray-900 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={data!.topVendors.slice(0, 8).map(v => ({ name: v.name.length > 10 ? v.name.slice(0, 9) + '…' : v.name, fullName: v.name, total: Math.round(v.total) }))}
                margin={{ top: 4, right: 4, left: 4, bottom: 40 }}
              >
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number, _: unknown, props: { payload?: { fullName?: string } }) => [`$${v.toLocaleString('en-AU')}`, props.payload?.fullName || '']}
                  contentStyle={tooltipStyle} labelStyle={labelStyle} labelFormatter={() => ''}
                />
                <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
