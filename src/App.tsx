import { useEffect, useState } from 'react'
import type { CardInfo, Profile } from './types'
import { Profiles } from './Profiles'
import { Scanner } from './Scanner'
import { Search } from './Search'
import { Collection } from './Collection'
import { AddDialog } from './AddDialog'
import { ImageViewer } from './ImageViewer'
import { Checklist } from './Checklist'
import { CardGuide } from './CardGuide'

type Tab = 'scan' | 'search' | 'collection' | 'sets' | 'guide'

const TABS: [Tab, string, string][] = [
  ['scan', '📷', 'Scan'],
  ['search', '🔎', 'Suche'],
  ['collection', '🗂', 'Sammlung'],
  ['sets', '✅', 'Sets'],
  ['guide', 'ℹ️', 'Kartenkunde'],
]

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
      {tab === 'sets' && <Checklist profileId={profile.id} onPick={setPick} />}
      {tab === 'guide' && <CardGuide />}
      <AddDialog card={pick} profileId={profile.id} onClose={() => setPick(undefined)} onAdded={setToast} />
      <ImageViewer />
      {toast && <div className="toast" role="status">✓ {toast}</div>}
      <nav>
        {TABS.map(([t, icon, label]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span className="nav-i">{icon}</span>{label}
          </button>
        ))}
      </nav>
    </>
  )
}
