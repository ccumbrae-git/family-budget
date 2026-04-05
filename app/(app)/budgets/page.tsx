'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'

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

export default function BudgetsPage() {
  const { token } = useAuth()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [limit, setLimit] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLimit, setEditLimit] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    if (!token) return
    Promise.all([
      fetch('/api/budgets', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/categories', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/budgets/suggest', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([b, c, s]) => {
      setBudgets(b)
      setCategories(c)
      setSuggestions(s)
      setLoading(false)
    })
  }, [token])

  // Group categories for display
  const catGroups = categories.reduce((acc, c) => {
    if (!acc[c.name]) acc[c.name] = []
    acc[c.name].push(c)
    return acc
  }, {} as Record<string, Category[]>)

  const budgetCatIds = new Set(budgets.map(b => b.category_id))

  async function addBudget() {
    if (!selectedCategoryId || !limit || !token) return
    const res = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ category_id: selectedCategoryId, monthly_limit: parseFloat(limit) })
    })
    const budget = await res.json()
    setBudgets(prev => [...prev.filter(b => b.category_id !== selectedCategoryId), budget])
    setShowAdd(false)
    setSelectedCategoryId('')
    setLimit('')
  }

  async function addSuggestedBudget(s: Suggestion) {
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

  async function updateBudget(id: string) {
    if (!editLimit || !token) return
    const res = await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        category_id: budgets.find(b => b.id === id)?.category_id,
        monthly_limit: parseFloat(editLimit)
      })
    })
    const budget = await res.json()
    setBudgets(prev => prev.map(b => b.id === id ? budget : b))
    setEditingId(null)
  }

  async function deleteBudget(id: string) {
    if (!token) return
    await fetch(`/api/budgets?id=${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` }
    })
    setBudgets(prev => prev.filter(b => b.id !== id))
  }

  const unusedSuggestions = suggestions.filter(s => !budgetCatIds.has(s.category_id))

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Budgets</h1>
          <p className="text-gray-400 text-sm mt-0.5">{budgets.length} active budgets</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-2 bg-indigo-600 rounded-xl text-sm font-medium"
        >
          + Add
        </button>
      </div>

      {/* AI suggestions */}
      {unusedSuggestions.length > 0 && (
        <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-indigo-300">✨ AI Suggestions</p>
            <button onClick={() => setShowSuggestions(!showSuggestions)} className="text-xs text-indigo-400">
              {showSuggestions ? 'Hide' : `Show ${unusedSuggestions.length}`}
            </button>
          </div>
          <p className="text-xs text-indigo-300/70">Based on your last 3 months of spending</p>

          {showSuggestions && (
            <div className="space-y-2">
              {unusedSuggestions.slice(0, 8).map(s => (
                <div key={s.category_id} className="flex items-center justify-between bg-indigo-950/40 rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{s.subcategory}</p>
                    <p className="text-xs text-gray-400">avg ${s.avg_monthly}/mo → suggest ${s.suggested_limit}/mo</p>
                  </div>
                  <button
                    onClick={() => addSuggestedBudget(s)}
                    className="text-xs text-indigo-400 border border-indigo-700 rounded-lg px-2.5 py-1 ml-3 shrink-0"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add budget form */}
      {showAdd && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold">New Budget</p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Category</label>
            <select
              value={selectedCategoryId}
              onChange={e => setSelectedCategoryId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select category...</option>
              {Object.entries(catGroups).map(([groupName, cats]) => (
                <optgroup key={groupName} label={groupName}>
                  {cats.filter(c => !budgetCatIds.has(c.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.subcategory}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Monthly limit ($)</label>
            <input
              type="number"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              placeholder="e.g. 500"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={addBudget} className="flex-1 py-2 bg-indigo-600 rounded-lg text-sm font-medium">
              Add Budget
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-gray-800 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Budget list */}
      {budgets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-3xl mb-3">💰</p>
          <p className="text-sm">No budgets yet.</p>
          <p className="text-xs mt-1">Add budgets to track your spending limits.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {budgets.map(b => (
            <div key={b.id} className="bg-gray-900 rounded-xl">
              <div
                className="flex items-center justify-between px-4 py-3.5 cursor-pointer"
                onClick={() => {
                  setEditingId(editingId === b.id ? null : b.id)
                  setEditLimit(String(b.monthly_limit))
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{b.categories?.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{b.categories?.subcategory}</p>
                    <p className="text-xs text-gray-500">{b.categories?.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">${b.monthly_limit.toLocaleString()}/mo</p>
                  <p className="text-xs text-gray-500">alert at {b.alert_at_percent}%</p>
                </div>
              </div>

              {editingId === b.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
                  <div className="pt-3">
                    <label className="text-xs text-gray-400 block mb-1">Monthly limit ($)</label>
                    <input
                      type="number"
                      value={editLimit}
                      onChange={e => setEditLimit(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateBudget(b.id)} className="flex-1 py-2 bg-indigo-600 rounded-lg text-sm font-medium">
                      Save
                    </button>
                    <button onClick={() => deleteBudget(b.id)} className="py-2 px-4 bg-red-900/40 text-red-400 rounded-lg text-sm">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
