'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { format } from 'date-fns'

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

interface Suggestion {
  category_id: string
  category_name: string
  subcategory: string
  suggested_limit: number
  avg_monthly: number
}

interface SpendItem {
  category_id: string
  total: number
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
  const [showAdd, setShowAdd] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [newLimit, setNewLimit] = useState('')
  const [applyingAll, setApplyingAll] = useState(false)

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = format(now, 'MMMM yyyy')

  useEffect(() => {
    if (!token) return
    Promise.all([
      fetch('/api/budgets', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/categories', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/budgets/suggest', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`/api/dashboard?month=${month}`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([b, c, s, dash]) => {
      setBudgets(Array.isArray(b) ? b : [])
      setCategories(Array.isArray(c) ? c : [])
      setSuggestions(Array.isArray(s) ? s : [])
      setSpend(Array.isArray(dash?.spend) ? dash.spend : [])
      setLoading(false)
    })
  }, [token, month])

  const spendMap = new Map(spend.map(s => [s.category_id, s.total]))
  const budgetCatIds = new Set(budgets.map(b => b.category_id))
  const unusedSuggestions = suggestions.filter(s => !budgetCatIds.has(s.category_id))

  const catGroups = categories.reduce((acc, c) => {
    if (!acc[c.name]) acc[c.name] = []
    acc[c.name].push(c)
    return acc
  }, {} as Record<string, Category[]>)

  async function saveBudget(id: string) {
    if (!editLimit || !token) return
    const budget = budgets.find(b => b.id === id)
    if (!budget) return
    const res = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ category_id: budget.category_id, monthly_limit: parseFloat(editLimit) })
    })
    const updated = await res.json()
    setBudgets(prev => prev.map(b => b.id === id ? updated : b))
    setEditingId(null)
  }

  async function addBudget() {
    if (!selectedCategoryId || !newLimit || !token) return
    const res = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ category_id: selectedCategoryId, monthly_limit: parseFloat(newLimit) })
    })
    const budget = await res.json()
    setBudgets(prev => [...prev.filter(b => b.category_id !== selectedCategoryId), budget])
    setShowAdd(false)
    setSelectedCategoryId('')
    setNewLimit('')
  }

  async function deleteBudget(id: string) {
    if (!token) return
    await fetch(`/api/budgets?id=${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
    setBudgets(prev => prev.filter(b => b.id !== id))
    setEditingId(null)
  }

  async function addSuggestion(s: Suggestion) {
    if (!token) return
    const res = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ category_id: s.category_id, monthly_limit: s.suggested_limit })
    })
    const budget = await res.json()
    setBudgets(prev => [...prev.filter(b => b.category_id !== s.category_id), budget])
    setSuggestions(prev => prev.filter(s2 => s2.category_id !== s.category_id))
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
      const [b, s] = await Promise.all([
        fetch('/api/budgets', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/budgets/suggest', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      ])
      setBudgets(b)
      setSuggestions(s)
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

  const sortedBudgets = [...budgets].sort((a, b) => {
    const spentA = spendMap.get(a.category_id) || 0
    const spentB = spendMap.get(b.category_id) || 0
    const pctA = spentA / a.monthly_limit
    const pctB = spentB / b.monthly_limit
    return pctB - pctA
  })

  return (
    <div className="px-4 pt-6 space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Budgets</h1>
          <p className="text-gray-400 text-sm mt-0.5">{monthLabel}</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-2 bg-indigo-600 rounded-xl text-sm font-medium"
        >
          + Add
        </button>
      </div>

      {/* Always-visible: set all from spending history */}
      <button
        onClick={applyAllSuggestions}
        disabled={applyingAll || suggestions.length === 0}
        className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-sm font-medium text-indigo-300 disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {applyingAll ? (
          <><div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> Applying...</>
        ) : (
          <>✨ Set all budgets from spending history {suggestions.length > 0 ? `(${suggestions.length})` : ''}</>
        )}
      </button>

      {/* AI suggestions banner */}
      {unusedSuggestions.length > 0 && (
        <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-indigo-300">✨ {unusedSuggestions.length} suggested budgets</p>
            <button
              onClick={applyAllSuggestions}
              disabled={applyingAll}
              className="text-xs bg-indigo-600 px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {applyingAll ? 'Applying...' : 'Apply all'}
            </button>
          </div>
          <p className="text-xs text-indigo-300/70">Based on your spending history</p>
          <div className="space-y-1.5 pt-1">
            {unusedSuggestions.slice(0, 5).map(s => (
              <div key={s.category_id} className="flex items-center justify-between bg-indigo-950/50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{s.subcategory}</p>
                  <p className="text-xs text-gray-400">avg ${s.avg_monthly}/mo</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-indigo-300">${s.suggested_limit}/mo</span>
                  <button onClick={() => addSuggestion(s)} className="text-xs text-indigo-400 border border-indigo-700 rounded-lg px-2.5 py-1">
                    Add
                  </button>
                </div>
              </div>
            ))}
            {unusedSuggestions.length > 5 && (
              <p className="text-xs text-gray-500 text-center pt-1">+{unusedSuggestions.length - 5} more — tap Apply all</p>
            )}
          </div>
        </div>
      )}

      {/* Add new budget form */}
      {showAdd && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold">New Budget</p>
          <select
            value={selectedCategoryId}
            onChange={e => setSelectedCategoryId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="">Select subcategory...</option>
            {Object.entries(catGroups).map(([groupName, cats]) => (
              <optgroup key={groupName} label={groupName}>
                {cats.filter(c => !budgetCatIds.has(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.subcategory}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex gap-2 items-center">
            <span className="text-gray-400 text-sm">$</span>
            <input
              type="number"
              value={newLimit}
              onChange={e => setNewLimit(e.target.value)}
              placeholder="Monthly limit"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <span className="text-gray-400 text-sm">/mo</span>
          </div>
          <div className="flex gap-2">
            <button onClick={addBudget} className="flex-1 py-2.5 bg-indigo-600 rounded-lg text-sm font-medium">Add Budget</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 bg-gray-800 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Budget cards */}
      {sortedBudgets.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">💰</p>
          <p className="text-sm">No budgets yet.</p>
          <p className="text-xs mt-1 text-gray-600">Tap <span className="text-indigo-400">Apply all</span> above or <span className="text-indigo-400">+ Add</span> to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedBudgets.map(b => {
            const spent = spendMap.get(b.category_id) || 0
            const percent = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0
            const isOver = spent > b.monthly_limit
            const isWarning = percent >= b.alert_at_percent && !isOver
            const remaining = b.monthly_limit - spent
            const isEditing = editingId === b.id

            return (
              <div key={b.id} className={`bg-gray-900 rounded-xl overflow-hidden border ${isOver ? 'border-red-800/50' : isWarning ? 'border-amber-800/50' : 'border-gray-800'}`}>
                <div
                  className="px-4 pt-4 pb-3 cursor-pointer"
                  onClick={() => {
                    setEditingId(isEditing ? null : b.id)
                    setEditLimit(String(b.monthly_limit))
                  }}
                >
                  {/* Top row: icon + name + spent/limit */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{b.categories?.icon}</span>
                      <div>
                        <p className="text-sm font-semibold">{b.categories?.subcategory}</p>
                        <p className="text-xs text-gray-500">{b.categories?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-base font-bold ${isOver ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-white'}`}>
                        ${spent.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
                        <span className="text-xs font-normal text-gray-500"> / ${b.monthly_limit.toLocaleString()}</span>
                      </p>
                      <p className={`text-xs ${isOver ? 'text-red-400' : 'text-gray-500'}`}>
                        {isOver
                          ? `$${Math.abs(remaining).toLocaleString('en-AU', { maximumFractionDigits: 0 })} over`
                          : `$${remaining.toLocaleString('en-AU', { maximumFractionDigits: 0 })} left`}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-indigo-500'}`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <p className={`text-xs mt-1.5 ${isOver ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-gray-500'}`}>
                    {Math.round(percent)}% used
                  </p>
                </div>

                {/* Inline edit */}
                {isEditing && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        value={editLimit}
                        onChange={e => setEditLimit(e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        onClick={e => e.stopPropagation()}
                      />
                      <span className="text-gray-400 text-sm">/mo</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); saveBudget(b.id) }}
                        className="flex-1 py-2 bg-indigo-600 rounded-lg text-sm font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteBudget(b.id) }}
                        className="py-2 px-4 bg-red-900/40 text-red-400 rounded-lg text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
