'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Bank } from '@/lib/types'

const BANKS: { value: Bank; label: string; description: string }[] = [
  { value: 'macquarie', label: 'Macquarie Bank', description: 'Transaction or savings account' },
  { value: 'ing', label: 'ING', description: 'Orange Everyday or savings' },
  { value: 'nab', label: 'NAB', description: 'Any NAB account' },
  { value: 'qantas_cc', label: 'Qantas Credit Card', description: 'Qantas Premier card' },
]

interface Account {
  id: string
  bank: Bank
  account_name: string
}

export default function UploadPage() {
  const { token } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedBank, setSelectedBank] = useState<Bank>('macquarie')
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [newAccountName, setNewAccountName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ success?: string; error?: string } | null>(null)
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/accounts', { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setAccounts(data)
        if (data.length > 0) setSelectedAccount(data[0].id)
      })
  }, [token])

  const filteredAccounts = accounts.filter(a => a.bank === selectedBank)

  async function deleteAccount(id: string) {
    if (!token) return
    await fetch(`/api/accounts?id=${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` }
    })
    setAccounts(prev => prev.filter(a => a.id !== id))
    if (selectedAccount === id) setSelectedAccount('')
    setConfirmDeleteId(null)
  }

  async function createAccount() {
    if (!newAccountName.trim() || !token) return
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ bank: selectedBank, account_name: newAccountName })
    })
    const acc = await res.json()
    setAccounts(prev => [...prev, acc])
    setSelectedAccount(acc.id)
    setNewAccountName('')
    setShowNewAccount(false)
  }

  async function handleUpload() {
    if (!file || !selectedAccount || !token) return
    setUploading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('bank', selectedBank)
    formData.append('accountId', selectedAccount)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: formData
      })
      const json = await res.json()
      if (res.ok) {
        setResult({ success: json.message })
        setFile(null)
        if (fileRef.current) fileRef.current.value = ''
      } else {
        setResult({ error: json.error })
      }
    } catch (err) {
      setResult({ error: `Upload failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Upload Statements</h1>
        <p className="text-gray-400 text-sm mt-1">Import CSV files from your bank</p>
      </div>

      {/* Bank selection */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Bank / Card</label>
        <div className="grid grid-cols-2 gap-2">
          {BANKS.map(b => (
            <button
              key={b.value}
              onClick={() => { setSelectedBank(b.value); setSelectedAccount('') }}
              className={`p-3 rounded-xl border text-left transition-all ${selectedBank === b.value ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-800 bg-gray-900'}`}
            >
              <p className="text-sm font-medium">{b.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{b.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Account selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400">Account</label>
          <button onClick={() => setShowNewAccount(!showNewAccount)} className="text-xs text-indigo-400">
            + Add account
          </button>
        </div>

        {showNewAccount && (
          <div className="flex gap-2">
            <input
              value={newAccountName}
              onChange={e => setNewAccountName(e.target.value)}
              placeholder="e.g. Transaction Account"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              onKeyDown={e => e.key === 'Enter' && createAccount()}
            />
            <button onClick={createAccount} className="px-3 py-2 bg-indigo-600 rounded-lg text-sm font-medium">
              Add
            </button>
          </div>
        )}

        {filteredAccounts.length > 0 ? (
          <div className="space-y-1.5">
            {filteredAccounts.map(acc => (
              <div key={acc.id} className={`rounded-xl border transition-all ${selectedAccount === acc.id ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-800 bg-gray-900'}`}>
                {confirmDeleteId === acc.id ? (
                  <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <p className="text-xs text-red-400">Delete all transactions from this account?</p>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => deleteAccount(acc.id)} className="px-2.5 py-1 bg-red-600 rounded-lg text-xs font-medium">Delete</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-2.5 py-1 bg-gray-700 rounded-lg text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <button
                      onClick={() => setSelectedAccount(acc.id)}
                      className="flex-1 p-3 text-left text-sm"
                    >
                      {acc.account_name}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(acc.id)}
                      className="px-3 py-3 text-gray-600 hover:text-red-400 transition-colors"
                      title="Delete account and all its transactions"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-2">No {BANKS.find(b => b.value === selectedBank)?.label} accounts yet. Add one above.</p>
        )}
      </div>

      {/* File picker */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">CSV File</label>
        <label className={`block w-full border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${file ? 'border-indigo-500 bg-indigo-900/10' : 'border-gray-700 bg-gray-900/50'}`}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          {file ? (
            <div>
              <p className="text-sm font-medium text-indigo-300">📄 {file.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-400">Tap to select CSV file</p>
              <p className="text-xs text-gray-600 mt-1">Download from your bank&apos;s website</p>
            </div>
          )}
        </label>
      </div>

      {/* How to download */}
      <div className="bg-gray-900 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400">How to download your CSV</p>
        <div className="space-y-1 text-xs text-gray-500">
          <p><span className="text-gray-300">Macquarie:</span> App → Transactions → Export</p>
          <p><span className="text-gray-300">ING:</span> Internet banking → Statements → Download CSV</p>
          <p><span className="text-gray-300">NAB:</span> App → Accounts → Download transactions</p>
          <p><span className="text-gray-300">Qantas CC:</span> Qantas Money app → Statements → Export</p>
        </div>
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || !selectedAccount || uploading}
        className="w-full py-3.5 bg-indigo-600 rounded-xl font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
      >
        {uploading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Processing & categorising...</span>
          </>
        ) : 'Upload & Categorise'}
      </button>

      {result?.success && (
        <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-4 text-sm text-green-300">
          ✓ {result.success}
        </div>
      )}
      {result?.error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 text-sm text-red-300">
          ✗ {result.error}
        </div>
      )}
    </div>
  )
}
