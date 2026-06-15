const INDEXED_DB_NAMES = ['ExcelProcessorDB'] as const

/** Wipe browser-side auth and app state (localStorage, sessionStorage, caches, SW, IndexedDB). */
export async function clearAllClientStorage(): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    localStorage.clear()
  } catch {
    // ignore
  }

  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }

  if ('caches' in window) {
    try {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    } catch {
      // ignore
    }
  }

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister()))
    } catch {
      // ignore
    }
  }

  if ('indexedDB' in window) {
    await Promise.all(
      INDEXED_DB_NAMES.map(
        (name) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name)
            req.onsuccess = () => resolve()
            req.onerror = () => resolve()
            req.onblocked = () => resolve()
          })
      )
    )
  }
}
