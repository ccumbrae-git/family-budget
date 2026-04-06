'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { format, subMonths } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

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

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  merchant?: string
  categories?: { name: string; subcategory: string; icon: string; color: string }
}

interface Vendor {
  name: string
  total: number
}

interface DashboardData {
  month: string
  totalSpend: number
  spend: SpendItem[]
  budgets: Budget[]
  recentTransactions: Transaction[]
  topVendors: Vendor[]
  trend: { month: string; label: string; total: number }[]
  isFamily: boolean
}

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
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [token, selectedMonth])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i)
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') }
  })

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const budgetMap = new Map((data?.budgets || []).map(b => [b.category_id, b]))

  // Issues: over budget or warning
  const issues = (data?.budgets || []).map(budget => {
    const spent = data?.spend.find(s => s.category_id === budget.category_id)?.total || 0
    const percent = (spent / budget.monthly_limit) * 100
    const isOver = spent > budget.monthly_limit
    const isWarning = percent >= budget.alert_at_percent && !isOver
    return { budget, spent, percent, isOver, isWarning }
  }).filter(i => i.isOver || i.isWarning)
    .sort((a, b) => b.percent - a.percent)

  // All budget items for budget section
  const budgetItems = (data?.budgets || []).map(budget => {
    const spent = data?.spend.find(s => s.category_id === budget.category_id)?.total || 0
    const percent = Math.min((spent / budget.monthly_limit) * 100, 100)
    const isOver = spent > budget.monthly_limit
    const isWarning = percent >= budget.alert_at_percent && !isOver
    return { budget, spent, percent, isOver, isWarning }
  }).sort((a, b) => b.percent - a.percent)

  // Top spend categories (all, sorted by amount)
  const topCategories = (data?.spend || []).slice(0, 10)

  // Max spend for bar width calc
  const maxSpend = topCategories[0]?.total || 1

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  return (
    <div className="px-4 pt-6 space-y-5 pb-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm">{greeting()},</p>
          <h1 className="text-xl font-bold capitalize">{firstName} {data?.isFamily && <span className="text-indigo-400 text-base font-normal">· Family</span>}</h1>
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
        {months.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>

      {/* Total spend + trend */}
      <div className="bg-gradient-to-br from-indigo-900/50 to-indigo-800/30 border border-indigo-700/30 rounded-2xl p-5">
        <p className="text-indigo-300 text-sm">Total spent in {format(new Date(selectedMonth + '-01'), 'MMMM')}</p>
        <p className="text-4xl font-bold mt-1">${(data?.totalSpend || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
        <p className="text-indigo-300/60 text-xs mt-1">{data?.spend.length || 0} categories</p>
        {data?.trend && data.trend.some(t => t.total > 0) && (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={data.trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: '#818cf8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(v) => [`$${Number(v).toLocaleString()}`, '']}
                  contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                  {data.trend.map((entry, i) => (
                    <Cell key={i} fill={entry.month === selectedMonth ? '#a5b4fc' : '#312e81'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
            Alerts
          </h2>
          {issues.map(({ budget, spent, percent, isOver }) => (
            <div key={budget.id} className={`rounded-xl p-3.5 border flex items-center justify-between ${isOver ? 'bg-red-900/20 border-red-700/50' : 'bg-amber-900/20 border-amber-700/50'}`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{budget.categories?.icon}</span>
                <div>
                  <p className="text-sm font-medium">{budget.categories?.subcategory}</p>
                  <p className={`text-xs ${isOver ? 'text-red-400' : 'text-amber-400'}`}>
                    {isOver
                      ? `Over by $${(spent - budget.monthly_limit).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
                      : `${Math.round(percent)}% of $${budget.monthly_limit.toLocaleString()} budget`}
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

      {/* Top spending categories */}
      {topCategories.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400">Spending by category</h2>
          <div className="bg-gray-900 rounded-xl p-4 space-y-3">
            {topCategories.map((s, i) => {
              const budget = budgetMap.get(s.category_id)
              const barPercent = (s.total / maxSpend) * 100
              const overBudget = budget && s.total > budget.monthly_limit
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm">{s.subcategory} <span className="text-gray-500 text-xs">· {s.category_name}</span></p>
                    <div className="flex items-center gap-2">
                      {budget && (
                        <span className={`text-xs ${overBudget ? 'text-red-400' : 'text-gray-500'}`}>
                          /{budget.monthly_limit.toLocaleString()}
                        </span>
                      )}
                      <p className="text-sm font-semibold">${s.total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${overBudget ? 'bg-red-500' : 'bg-indigo-500'}`}
                      style={{ width: `${barPercent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top vendors */}
      {(data?.topVendors || []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400">Top vendors</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {data!.topVendors.map((v, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">
                    {v.name[0]?.toUpperCase()}
                  </div>
                  <p className="text-sm font-medium">{v.name}</p>
                </div>
                <p className="text-sm font-semibold">${v.total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget progress */}
      {budgetItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400">Budgets</h2>
          {budgetItems.map(({ budget, spent, percent, isOver, isWarning }) => (
            <div key={budget.id} className={`bg-gray-900 rounded-xl p-4 border ${isOver ? 'border-red-800/50' : isWarning ? 'border-amber-800/50' : 'border-gray-800'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{budget.categories?.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{budget.categories?.subcategory}</p>
                    <p className="text-xs text-gray-500">{budget.categories?.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${isOver ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-white'}`}>
                    ${spent.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-gray-500">of ${budget.monthly_limit.toLocaleString()}</p>
                </div>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-indigo-500'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent transactions */}
      {data?.recentTransactions && data.recentTransactions.length > 0 && (
        <div className="space-y-3 pb-2">
          <h2 className="text-sm font-semibold text-gray-400">Recent transactions</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {data.recentTransactions.map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.merchant || t.description}</p>
                  <p className="text-xs text-gray-500">
                    {t.categories ? `${t.categories.icon} ${t.categories.subcategory}` : 'Uncategorised'} · {format(new Date(t.date), 'd MMM')}
                  </p>
                </div>
                <p className="text-sm font-semibold text-red-400 ml-3 shrink-0">
                  -${Math.abs(t.amount).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && data?.totalSpend === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📂</p>
          <p className="text-sm">No transactions for this month.</p>
          <p className="text-xs mt-1">Upload your bank statements to get started.</p>
        </div>
      )}
    </div>
  )
}
