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

interface DashboardData {
  month: string
  totalSpend: number
  spend: SpendItem[]
  budgets: Budget[]
  recentTransactions: Transaction[]
  trend: { month: string; label: string; total: number }[]
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

  const budgetMap = new Map(data?.budgets.map(b => [b.category_id, b]) || [])

  // Build budget progress items (categories that have budgets)
  const budgetItems = (data?.budgets || []).map(budget => {
    const spent = data?.spend.find(s => s.category_id === budget.category_id)?.total || 0
    const percent = Math.min((spent / budget.monthly_limit) * 100, 100)
    const isOver = spent > budget.monthly_limit
    const isWarning = percent >= budget.alert_at_percent && !isOver
    return { budget, spent, percent, isOver, isWarning }
  }).sort((a, b) => b.percent - a.percent)

  // Top spending categories (without budgets)
  const topSpend = (data?.spend || [])
    .filter(s => !budgetMap.has(s.category_id))
    .slice(0, 5)

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  return (
    <div className="px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm">{greeting()},</p>
          <h1 className="text-xl font-bold capitalize">{firstName}</h1>
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

      {/* Total spend card */}
      <div className="bg-gradient-to-br from-indigo-900/50 to-indigo-800/30 border border-indigo-700/30 rounded-2xl p-5">
        <p className="text-indigo-300 text-sm">Total spent in {format(new Date(selectedMonth + '-01'), 'MMMM')}</p>
        <p className="text-4xl font-bold mt-1">${(data?.totalSpend || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
        <p className="text-indigo-300/60 text-xs mt-1">{data?.spend.length || 0} categories</p>
      </div>

      {/* Spend trend chart */}
      {data?.trend && data.trend.some(t => t.total > 0) && (
        <div className="bg-gray-900 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">6-month trend</h2>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={data.trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(v) => [`$${Number(v).toLocaleString()}`, '']}
                contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {data.trend.map((entry, i) => (
                  <Cell key={i} fill={entry.month === selectedMonth ? '#6366f1' : '#374151'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Budget progress */}
      {budgetItems.length > 0 && (
        <div className="space-y-3">
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
                    ${spent.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
              {(isOver || isWarning) && (
                <p className={`text-xs mt-1.5 ${isOver ? 'text-red-400' : 'text-amber-400'}`}>
                  {isOver
                    ? `Over by $${(spent - budget.monthly_limit).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : `${Math.round(percent)}% used`
                  }
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Top spend (no budget) */}
      {topSpend.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400">Top spending</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
            {topSpend.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm">{s.subcategory} <span className="text-gray-500 text-xs">· {s.category_name}</span></p>
                <p className="text-sm font-medium">${s.total.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              </div>
            ))}
          </div>
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

