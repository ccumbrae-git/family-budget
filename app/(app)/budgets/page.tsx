'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { format, subMonths } from 'date-fns'

interface Category {
  id: string
  name: string
  subcategory: string
  icon: string
  color: string
}

interface Budget {
  id: string
  category_id: string
  monthly_limit: number
  alert_at_percent: number
  categories: Category
}

interface SpendItem {
  category_id: string
  total: number
}

interface Suggestion {
  category_id: string
  category_name: string
  subcategory: string
  suggested_limit: number
  avg_monthly: number
}

export default function BudgetsPage() {
  const { token } = useAuth()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [spend, setSpend] = useState<SpendItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLimit, setEditLimit] = useState('')
  const [applyingAll, setApplyingAll] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const now = new Date()
  const month = selectedMonth
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(now, i)
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') }
  })

  useEffect(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      fetch('/api/budgets', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/categories', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/budgets/suggest', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`/api/dashboard?month=${selectedMonth}`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([b, c, s, dash]) => {
      setBudgets(Array.isArray(b) ? b : [])
      setCategories(Array.isArray(c) ? c : [])
      setSuggestions(Array.isArray(s) ? s : [])
      setSpend(Array.isArray(dash?.spend) ? dash.spend : [])
      setLoading(false)
    })
  }, [token, selectedMonth])

  const spendMap = new Map(spend.map(s => [s.category_id, s.total]))
  const budgetMap = new Map(budgets.map(b => [b.category_id, b]))
  const suggestMap = new Map(suggestions.map(s => [s.category_id, s]))

  async function saveBudget(categoryId: string, limitVal: string) {
    if (!limitVal || !token) return
    const res = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ category_id: categoryId, monthly_limit: parseFloat(limitVal) })
    })
    const updated = await res.json()
    setBudgets(prev => {
      const filtered = prev.filter(b => b.category_id !== categoryId)
      return [...filtered, updated]
    })
    setEditingId(null)
  }

  async function deleteBudget(categoryId: string) {
    if (!token) return
    const budget = budgetMap.get(categoryId)
    if (!budget) return
    await fetch(`/api/budgets?id=${budget.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
    setBudgets(prev => prev.filter(b => b.category_id !== categoryId))
    setEditingId(null)
  }

  async function applyAllSuggestions() {
    if (!token || suggestions.length === 0) return
    setApplyingAll(true)
    const res = await fetch('/api/budgets/apply-suggestions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ suggestions })
    })
    if (res.ok) {
      const b = await fetch('/api/budgets', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json())
      setBudgets(b)
    }
    setApplyingAll(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Group categories by parent name
  const groups = categories.reduce((acc, c) => {
    if (!acc[c.name]) acc[c.name] = []
    acc[c.name].push(c)
    return acc
  }, {} as Record<string, Category[]>)

  return (
    <div className="px-4 pt-6 space-y-5 pb-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Budgets</h1>
        </div>
        {suggestions.length > 0 && (
          <button
            onClick={applyAllSuggestions}
            disabled={applyingAll}
            className="px-3 py-2 bg-indigo-600 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {applyingAll
              ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Applying...</>
              : '✨ Set from history'}
          </button>
        )}
      </div>

      {/* Month selector */}
      <select
        value={selectedMonth}
        onChange={e => setSelectedMonth(e.target.value)}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
      >
        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>

      {/* Summary chips */}
      <div className="flex gap-2">
        <div className="flex-1 bg-gray-900 rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold">{budgets.length}</p>
          <p className="text-xs text-gray-500">Budgets set</p>
        </div>
        <div className="flex-1 bg-gray-900 rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-red-400">{budgets.filter(b => (spendMap.get(b.category_id) || 0) > Number(b.monthly_limit)).length}</p>
          <p className="text-xs text-gray-500">Over budget</p>
        </div>
        <div className="flex-1 bg-gray-900 rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold">{categories.length - budgets.length}</p>
          <p className="text-xs text-gray-500">Not set</p>
        </div>
      </div>

      {/* Categories grouped */}
      {Object.entries(groups).map(([groupName, cats]) => (
        <div key={groupName} className="space-y-1.5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">{groupName}</h2>
          <div className="bg-gray-900 rounded-xl divide-y divide-gray-800 overflow-hidden">
            {cats.map(cat => {
              const budget = budgetMap.get(cat.id)
              const limit = budget ? Number(budget.monthly_limit) : null
              const spent = spendMap.get(cat.id) || 0
              const suggest = suggestMap.get(cat.id)
              const isEditing = editingId === cat.id
              const percent = limit && limit > 0 ? Math.min((spent / limit) * 100, 100) : 0
              const isOver = limit !== null && spent > limit
              const isWarn = limit !== null && !isOver && percent >= (budget?.alert_at_percent ?? 80)

              return (
                <div key={cat.id}>
                  <div
                    className="px-4 py-3 cursor-pointer"
                    onClick={() => {
                      setEditingId(isEditing ? null : cat.id)
                      setEditLimit(limit ? String(limit) : suggest ? String(suggest.suggested_limit) : '')
                    }}
                  >
                    {/* Row: icon + name + amount */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xl w-7 text-center">{cat.icon}</span>
                        <div>
                          <p className="text-sm font-medium">{cat.subcategory}</p>
                          {limit !== null ? (
                            <p className="text-xs text-gray-500">
                              ${spent.toLocaleString('en-AU', { maximumFractionDigits: 0 })} of ${limit.toLocaleString()} budget
                            </p>
                          ) : (
                            <p className="text-xs text-gray-600">
                              {suggest ? `Suggested $${suggest.suggested_limit}/mo · tap to set` : 'No budget set · tap to add'}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {limit !== null ? (
                          <p className={`text-sm font-bold ${isOver ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-white'}`}>
                            {isOver ? `+$${(spent - limit).toLocaleString('en-AU', { maximumFractionDigits: 0 })}` : `$${(limit - spent).toLocaleString('en-AU', { maximumFractionDigits: 0 })} left`}
                          </p>
                        ) : spent > 0 ? (
                          <p className="text-sm text-gray-400">${spent.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</p>
                        ) : null}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {limit !== null ? (
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isOver ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-indigo-500'}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    ) : spent > 0 ? (
                      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-600 rounded-full" style={{ width: '100%' }} />
                      </div>
                    ) : null}
                  </div>

                  {/* Inline edit */}
                  {isEditing && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-800 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          value={editLimit}
                          onChange={e => setEditLimit(e.target.value)}
                          placeholder="Monthly limit"
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                          onClick={e => e.stopPropagation()}
                        />
                        <span className="text-gray-400 text-sm">/mo</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); saveBudget(cat.id, editLimit) }}
                          className="flex-1 py-2 bg-indigo-600 rounded-lg text-sm font-medium"
                        >
                          Save
                        </button>
                        {limit !== null && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteBudget(cat.id) }}
                            className="py-2 px-4 bg-red-900/40 text-red-400 rounded-lg text-sm"
                          >
                            Remove
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); setEditingId(null) }}
                          className="py-2 px-4 bg-gray-800 rounded-lg text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
