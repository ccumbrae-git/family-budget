'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { format, subMonths } from 'date-fns'

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  merchant?: string
  notes?: string
  excluded?: boolean
  categories?: { id: string; name: string; subcategory: string; icon: string; color: string }
  accounts?: { bank: string; account_name: string }
}

interface Category {
  id: string
  name: string
  subcategory: string
  icon: string
}

export default function TransactionsPage() {
  const { token } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [recategorising, setRecategorising] = useState(false)
  const [recatResult, setRecatResult] = useState('')

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i)
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') }
  })

  const fetchTransactions = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/transactions?month=${selectedMonth}&limit=100`, {
        headers: { authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setTransactions(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [token, selectedMonth])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  useEffect(() => {
    if (!token) return
    fetch('/api/categories', { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setCategories)
  }, [token])

  const filtered = transactions.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.description.toLowerCase().includes(q) ||
      (t.merchant?.toLowerCase().includes(q)) ||
      (t.categories?.subcategory.toLowerCase().includes(q))
    )
  })

  async function recategoriseAll() {
    if (!token) return
    setRecategorising(true)
    setRecatResult('')
    const res = await fetch('/api/transactions/recategorise', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    setRecatResult(data.updated > 0 ? `✓ Categorised ${data.updated} transactions` : '✓ All transactions already categorised')
    setRecategorising(false)
    fetchTransactions()
  }

  async function deleteTransaction(txId: string) {
    if (!token) return
    await fetch(`/api/transactions?id=${txId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` }
    })
    setTransactions(prev => prev.filter(t => t.id !== txId))
    setConfirmDeleteId(null)
    setEditingId(null)
  }

  async function toggleExclude(txId: string, currentExcluded: boolean) {
    if (!token) return
    const res = await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: txId, excluded: !currentExcluded })
    })
    const updated = await res.json()
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, ...updated } : t))
  }

  async function updateCategory(txId: string, categoryId: string) {
    if (!token) return
    const res = await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: txId, category_id: categoryId })
    })
    const updated = await res.json()
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, ...updated } : t))
    setEditingId(null)
  }

  const grouped = filtered.reduce((acc, t) => {
    const key = t.date
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {} as Record<string, Transaction[]>)

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="px-4 pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Transactions</h1>
        <button
          onClick={recategoriseAll}
          disabled={recategorising}
          className="text-xs px-3 py-1.5 bg-indigo-600 rounded-lg disabled:opacity-50"
        >
          {recategorising ? 'Categorising...' : '✨ Re-categorise'}
        </button>
      </div>
      {recatResult && <p className="text-xs text-green-400">{recatResult}</p>}

      <div className="flex gap-2">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
        >
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div className="relative">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search transactions..."
          className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm pl-9 focus:outline-none focus:border-indigo-500"
        />
        <svg className="absolute left-3 top-3 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          {sortedDates.map(date => (
            <div key={date}>
              <p className="text-xs font-semibold text-gray-500 mb-2">
                {format(new Date(date + 'T00:00:00'), 'EEEE, d MMMM')}
              </p>
              <div className="bg-gray-900 rounded-xl divide-y divide-gray-800">
                {grouped[date].map(t => (
                  <div key={t.id} className={t.excluded ? 'opacity-40' : ''}>
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer"
                      onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.merchant || t.description}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t.excluded ? '⛔ Excluded' : t.categories ? `${t.categories.icon} ${t.categories.subcategory}` : '⚪ Uncategorised'}
                        </p>
                      </div>
                      <p className={`text-sm font-semibold ml-3 shrink-0 ${t.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {t.amount >= 0 ? '+' : '-'}${Math.abs(t.amount).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>

                    {editingId === t.id && (
                      <div className="px-4 pb-3 space-y-3">
                        <button
                          onClick={() => toggleExclude(t.id, !!t.excluded)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${t.excluded ? 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-300' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                        >
                          <span>{t.excluded ? 'Excluded from budgets' : 'Exclude from budgets'}</span>
                          <span>{t.excluded ? '↩ Include' : '⛔ Exclude'}</span>
                        </button>
                        {confirmDeleteId === t.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => deleteTransaction(t.id)}
                              className="flex-1 py-2.5 bg-red-600 rounded-lg text-sm font-semibold"
                            >
                              Confirm delete
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="flex-1 py-2.5 bg-gray-800 rounded-lg text-sm text-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(t.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm bg-gray-800 text-red-400 hover:bg-red-900/20 transition-colors"
                          >
                            <span>Delete transaction</span>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                        {!t.excluded && (
                          <>
                            <p className="text-xs text-gray-400">Recategorise:</p>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {categories.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => updateCategory(t.id, c.id)}
                                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${t.categories?.id === c.id ? 'bg-indigo-900/40 text-indigo-300' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                                >
                                  <span>{c.icon}</span>
                                  <span>{c.subcategory}</span>
                                  <span className="text-gray-500">· {c.name}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
