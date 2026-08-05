import type { Collection } from "./game-types"

// localStorage helpers — only call from the client (routes using these set ssr: false)

export function loadCollections(): Array<Collection> {
  try {
    return JSON.parse(localStorage.getItem("gs.collections") ?? "[]")
  } catch {
    return []
  }
}

export function saveCollections(collections: Array<Collection>) {
  try {
    localStorage.setItem("gs.collections", JSON.stringify(collections))
  } catch {
    alert("Local storage is full — remove or shrink some images.")
  }
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
