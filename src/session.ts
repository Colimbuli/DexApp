import { db } from './db'
import type { Profile } from './types'

const KEY = 'session'

interface Session { profileId: number }

/** Merkt sich das angemeldete Profil auf diesem Gerät (nur die ID, nie die PIN). */
export function saveSession(profileId: number) {
  try { localStorage.setItem(KEY, JSON.stringify({ profileId } satisfies Session)) } catch { /* privater Modus o. Ä. */ }
}

export function clearSession() {
  try { localStorage.removeItem(KEY) } catch { /* egal */ }
}

/** Gemerktes Profil laden; existiert es nicht mehr, wird die Sitzung verworfen. */
export async function restoreSession(): Promise<Profile | undefined> {
  let s: Session | null = null
  try { s = JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { s = null }
  if (!s || typeof s.profileId !== 'number') return undefined
  const p = await db.profiles.get(s.profileId).catch(() => undefined)
  if (!p) clearSession()
  return p
}
