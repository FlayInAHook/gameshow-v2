import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { initAudio } from "@/lib/sounds"
import { loadCollections, setHostRoom } from "@/lib/store"

export const Route = createFileRoute("/host")({
  ssr: false,
  component: HostPage,
})

function HostPage() {
  const navigate = useNavigate()
  const collections = loadCollections()

  function host(collectionId: string) {
    initAudio() // user gesture — unlock audio before entering the room
    const code = Array.from({ length: 4 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join("")
    setHostRoom(code, collectionId)
    void navigate({ to: "/room/$code", params: { code } })
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link to="/" />}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold">Host a game</h1>
      </div>
      {collections.length === 0 && (
        <p className="text-muted-foreground">
          No collections yet.{" "}
          <Link to="/create" className="underline">
            Create one first.
          </Link>
        </p>
      )}
      {collections.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex items-center justify-between pt-4">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-sm text-muted-foreground">
                {c.questions.length} questions
              </div>
            </div>
            <Button onClick={() => host(c.id)}>Host this</Button>
          </CardContent>
        </Card>
      ))}
    </main>
  )
}
