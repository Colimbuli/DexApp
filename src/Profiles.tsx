import { useState } from 'react'
import { createProfile, deleteProfile, verifyPin } from './db'
import { useLive } from './hooks'
import { db } from './db'
import type { Profile } from './types'

export function Profiles({ onLogin }: { onLogin: (p: Profile, remember: boolean) => void }) {
  const profiles = useLive(() => db.profiles.toArray(), [], [] as Profile[])
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [unlock, setUnlock] = useState<Profile>()
  const [remember, setRemember] = useState(false)
  const [pinTry, setPinTry] = useState('')
  const [err, setErr] = useState('')

  async function create() {
    if (!name.trim()) return setErr('Name fehlt')
    if (pin && !/^\d{4,8}$/.test(pin)) return setErr('PIN: 4–8 Ziffern oder leer lassen')
    const id = await createProfile(name, pin || undefined)
    const p = await db.profiles.get(id)
    setName(''); setPin(''); setErr('')
    // ohne PIN immer angemeldet bleiben; mit PIN erst nach bewusstem Häkchen beim Entsperren
    if (p) onLogin(p, !p.pinHash)
  }

  async function tryLogin(p: Profile) {
    if (!p.pinHash) return onLogin(p, true)
    setUnlock(p); setPinTry(''); setErr(''); setRemember(false)
  }

  async function confirmPin() {
    if (unlock && (await verifyPin(unlock, pinTry))) onLogin(unlock, remember)
    else setErr('Falsche PIN')
  }

  async function remove(p: Profile) {
    if (confirm(`Profil „${p.name}“ und die gesamte Sammlung endgültig löschen?`)) await deleteProfile(p.id!)
  }

  return (
    <main>
      <h1>Kartenscanner</h1>
      {profiles.length > 0 && <h2>Profil wählen</h2>}
      {profiles.map((p) => (
        <div className="card row" key={p.id}>
          <button onClick={() => tryLogin(p)} style={{ flex: 3 }}>{p.name}{p.pinHash ? ' 🔒' : ''}</button>
          <button className="danger" onClick={() => remove(p)} style={{ flex: 1 }}>Löschen</button>
        </div>
      ))}
      {unlock && (
        <div className="card">
          <label>PIN für {unlock.name}</label>
          <input type="password" inputMode="numeric" value={pinTry} onChange={(e) => setPinTry(e.target.value)} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 'auto' }} />
            Auf diesem Gerät angemeldet bleiben
          </label>
          <button className="primary" onClick={confirmPin} style={{ marginTop: 8 }}>Entsperren</button>
        </div>
      )}
      <h2 style={{ marginTop: 24 }}>Neues Profil</h2>
      <div className="card">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>PIN (optional, 4–8 Ziffern)</label>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
        <button className="primary" onClick={create} style={{ marginTop: 8 }}>Anlegen</button>
        <p className="muted">Die PIN verhindert nur neugieriges Mitlesen. Die Daten liegen unverschlüsselt in diesem Browser.</p>
      </div>
      {err && <p className="err">{err}</p>}
    </main>
  )
}
