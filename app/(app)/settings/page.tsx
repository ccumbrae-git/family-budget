'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSearchParams } from 'next/navigation'

interface FamilyMember {
  id: string
  full_name: string | null
}

interface Family {
  id: string
  name: string
  owner_id: string
  members: FamilyMember[]
}

export default function SettingsPage() {
  const { token, user } = useAuth()
  const searchParams = useSearchParams()
  const joinToken = searchParams.get('join')

  const [family, setFamily] = useState<Family | null | undefined>(undefined)
  const [familyName, setFamilyName] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  const fetchFamily = useCallback(async () => {
    if (!token) return
    setLoading(true)
    const res = await fetch('/api/family', { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json()
    setFamily(data)
    setLoading(false)
  }, [token])

  useEffect(() => { fetchFamily() }, [fetchFamily])

  async function createFamily() {
    if (!familyName.trim() || !token) return
    setCreating(true)
    const res = await fetch('/api/family', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: familyName.trim() })
    })
    if (res.ok) await fetchFamily()
    setCreating(false)
  }

  async function generateInvite() {
    if (!token) return
    const res = await fetch('/api/family/invite', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.token) {
      const link = `${window.location.origin}/settings?join=${data.token}`
      setInviteLink(link)
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function joinFamily() {
    if (!joinToken || !token) return
    setJoining(true)
    setJoinError('')
    const res = await fetch('/api/family/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: joinToken })
    })
    const data = await res.json()
    if (res.ok) {
      await fetchFamily()
      window.history.replaceState({}, '', '/settings')
    } else {
      setJoinError(data.error || 'Failed to join family')
    }
    setJoining(false)
  }

  async function leaveFamily() {
    if (!token) return
    if (!confirm('Leave this family? Your budgets will remain.')) return
    await fetch('/api/family', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
    setFamily(null)
    setInviteLink('')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 space-y-6 pb-4">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Join invite prompt */}
      {joinToken && !family && (
        <div className="bg-indigo-950/50 border border-indigo-700/50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-indigo-300">You've been invited to a family</p>
          <p className="text-xs text-gray-400">Join to share budgets and see combined spending.</p>
          {joinError && <p className="text-xs text-red-400">{joinError}</p>}
          <button
            onClick={joinFamily}
            disabled={joining}
            className="w-full py-2.5 bg-indigo-600 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {joining ? 'Joining...' : 'Join Family'}
          </button>
        </div>
      )}

      {/* Family section */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Family</h2>

        {family ? (
          <div className="space-y-3">
            {/* Family info */}
            <div className="bg-gray-900 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold">{family.name}</p>
                  <p className="text-xs text-gray-500">{family.members.length} member{family.members.length !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-2xl">👨‍👩‍👧</span>
              </div>
              <div className="divide-y divide-gray-800">
                {family.members.map(m => (
                  <div key={m.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold">
                        {(m.full_name || 'U')[0].toUpperCase()}
                      </div>
                      <p className="text-sm">{m.full_name || 'Unknown'}</p>
                    </div>
                    {m.id === family.owner_id && (
                      <span className="text-xs text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-full">Owner</span>
                    )}
                    {m.id === user?.id && m.id !== family.owner_id && (
                      <span className="text-xs text-gray-500">You</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite */}
            <div className="bg-gray-900 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium">Invite someone</p>
              <p className="text-xs text-gray-400">Generate a link and share it with your partner. The link can only be used once.</p>
              {!inviteLink ? (
                <button
                  onClick={generateInvite}
                  className="w-full py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm font-medium"
                >
                  Generate invite link
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400 break-all font-mono">
                    {inviteLink}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={copyInvite}
                      className="flex-1 py-2.5 bg-gray-700 rounded-xl text-sm font-medium"
                    >
                      {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                    {typeof navigator !== 'undefined' && 'share' in navigator && (
                      <button
                        onClick={() => navigator.share({ title: 'Join our family budget', url: inviteLink })}
                        className="flex-1 py-2.5 bg-indigo-600 rounded-xl text-sm font-medium"
                      >
                        Share
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Leave */}
            <button
              onClick={leaveFamily}
              className="w-full py-2.5 bg-red-900/30 text-red-400 border border-red-900/50 rounded-xl text-sm"
            >
              Leave family
            </button>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl p-4 space-y-3">
            <p className="text-sm text-gray-400">Create a family to share budgets and see combined spending with your partner.</p>
            <input
              type="text"
              value={familyName}
              onChange={e => setFamilyName(e.target.value)}
              placeholder="e.g. The Smiths"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={createFamily}
              disabled={creating || !familyName.trim()}
              className="w-full py-2.5 bg-indigo-600 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create family'}
            </button>
          </div>
        )}
      </div>

      {/* Account */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Account</h2>
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-300">{user?.email}</p>
        </div>
      </div>
    </div>
  )
}
