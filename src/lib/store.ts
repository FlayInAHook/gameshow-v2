import type { Collection } from "./game-types"

// browser storage — only call from the client (routes using these set ssr: false)
//
// the small keys stay in localStorage: they are a few bytes each and are read
// synchronously while rendering. Collections hold image data-urls and blew past
// localStorage's ~5MB quota, so they live in IndexedDB, whose quota is a share
// of free disk — gigabytes rather than megabytes.

const DB_NAME = "gameshow"
const STORE = "kv"
const KEY = "collections"

// ponytail: one object store and two operations, so no idb wrapper dependency
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result as T)
      // the transaction carries quota errors, the request carries the rest
      req.onerror = () => reject(req.error)
      req.transaction!.onabort = () => reject(req.transaction!.error)
    })
  } finally {
    db.close()
  }
}

export async function loadCollections(): Promise<Array<Collection>> {
  const stored = await tx<Array<Collection> | undefined>("readonly", (s) =>
    s.get(KEY),
  )
  // an empty array is a real answer — everything was deleted — so only an
  // absent key falls through to the one-time migration
  if (stored) return stored

  const legacy = localStorage.getItem("gs.collections")
  if (!legacy) return []
  const parsed = JSON.parse(legacy) as Array<Collection>
  await saveCollections(parsed)
  localStorage.removeItem("gs.collections")
  return parsed
}

/** Rejects on a full disk; the caller is expected to say so rather than lose the edit silently. */
export async function saveCollections(collections: Array<Collection>) {
  // structured clone, not JSON — the data-urls go in as-is
  await tx("readwrite", (s) => s.put(collections, KEY))
}

/** Origin-wide bytes used and available, or null where the browser won't say. */
export async function storageEstimate() {
  // the cast is the honest type: navigator.storage is absent on a plain-http
  // LAN address, which this app is routinely opened on, but the DOM lib
  // declares it non-nullable
  const manager = navigator.storage as StorageManager | undefined
  const est = await manager?.estimate().catch(() => null)
  return est?.quota ? { usage: est.usage ?? 0, quota: est.quota } : null
}

export function getPlayerId(): string {
  let id = localStorage.getItem("gs.playerId")
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem("gs.playerId", id)
  }
  return id
}

export function getPlayerName(): string {
  return localStorage.getItem("gs.name") ?? ""
}

export function setPlayerName(name: string) {
  localStorage.setItem("gs.name", name)
}

// rooms this browser is hosting: code -> collection id (lets the host rejoin after a tab close)
export function getHostRooms(): Record<string, string | undefined> {
  try {
    return JSON.parse(localStorage.getItem("gs.hostRooms") ?? "{}")
  } catch {
    return {}
  }
}

export function setHostRoom(code: string, collectionId: string) {
  const rooms = getHostRooms()
  rooms[code] = collectionId
  localStorage.setItem("gs.hostRooms", JSON.stringify(rooms))
}
