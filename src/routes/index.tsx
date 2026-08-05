import { Link, createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({ component: Landing })

function Landing() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8">
      <h1 className="text-4xl font-bold tracking-tight">Gameshow</h1>
      <div className="flex gap-4">
        <Button
          size="lg"
          className="h-16 px-10 text-xl"
          render={<Link to="/create" />}
        >
          Create
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-16 px-10 text-xl"
          render={<Link to="/host" />}
        >
          Host
        </Button>
      </div>
    </main>
  )
}
