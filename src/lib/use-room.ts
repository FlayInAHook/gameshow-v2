import { useEffect, useRef, useState } from "react"
import { WS_PORT } from "./game-types"
import { sounds } from "./sounds"
import type { ClientMsg, Question, RoomState, ServerMsg } from "./game-types"

export function useRoom(joinMsg: ClientMsg | null) {
  const [state, setState] = useState<RoomState | null>(null)
  const [questions, setQuestions] = useState<Array<Question>>([])
  const [connected, setConnected] = useState(false)
  const [kicked, setKicked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const joinRef = useRef(joinMsg)
  joinRef.current = joinMsg

  const shouldConnect = joinMsg !== null

  useEffect(() => {
    if (!shouldConnect) return
    let stopped = false
    let retry: ReturnType<typeof setTimeout>

    function connect() {
      const ws = new WebSocket(`ws://${location.hostname}:${WS_PORT}`)
      wsRef.current = ws
      ws.onopen = () => {
        setConnected(true)
        ws.send(JSON.stringify(joinRef.current))
      }
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as ServerMsg
        if (msg.type === "state") setState(msg.state)
        else if (msg.type === "questions") setQuestions(msg.questions)
        else if (msg.type === "ping")
          ws.send(JSON.stringify({ type: "pong", t: msg.t } satisfies ClientMsg))
        else if (msg.type === "sound") sounds[msg.name]()
        else if (msg.type === "kicked") {
          stopped = true
          setKicked(true)
        } else {
          stopped = true
          setError(msg.message)
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (!stopped) retry = setTimeout(connect, 1000)
      }
    }

    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      wsRef.current?.close()
    }
  }, [shouldConnect])

  function send(msg: ClientMsg) {
    wsRef.current?.send(JSON.stringify(msg))
  }

  return { state, questions, connected, kicked, error, send }
}
