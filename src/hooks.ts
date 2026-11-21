import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'

export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [v, setV] = useState<T>(initial)
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setV, error: () => {} })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

export function download(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
