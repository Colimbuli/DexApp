import { useEffect, useState } from 'react'
import type { CardInfo, Profile } from './types'
import { Profiles } from './Profiles'
import { Scanner } from './Scanner'
import { Search } from './Search'
import { Collection } from './Collection'
import { AddDialog } from './AddDialog'

type Tab = 'scan' | 'search' | 'collection'

export function App() {
  const [profile, setProfile] = useState<Profile>()
  const [tab, setTab] = useState<Tab>('collection')
  const [pick, setPick] = useState<CardInfo>()
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  if (!profile?.id) return <Profiles onLogin={setProfile} />

  return (
    <>
      <div style={{ textAlign: 'right', padding: '8px 16px 0' }} className="muted">
        {profile.name} · <a href="#" style={{ color: 'var(--accent)' }} onClick={(e) => { e.preventDefault(); setProfile(undefined) }}>Wechseln</a>
      </div>
      {tab === 'scan' && <Scanner onPick={setPick} />}
      {tab === 'search' && <Search onPick={setPick} />}
      {tab === 'collection' && <Collection profileId={profile.id} />}
      <AddDialog card={pick} profileId={profile.id} onClose={() => setPick(undefined)} onAdded={setToast} />
      {toast && <div className="toast" role="status">✓ {toast}</div>}
      <nav>
        <button className={tab === 'scan' ? 'on' : ''} onClick={() => setTab('scan')}>📷 Scan</button>
        <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>🔎 Suche</button>
        <button className={tab === 'collection' ? 'on' : ''} onClick={() => setTab('collection')}>🗂 Sammlung</button>
      </nav>
    </>
  )
}
