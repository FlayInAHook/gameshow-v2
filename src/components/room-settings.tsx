import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Settings } from "@/lib/game-types"

// the room's rules, edited in two places: on the collection before the game
// (create page) and live in the host panel. the number inputs are uncontrolled
// so a half-typed "-" survives — mount this with a key when the source changes
export function SettingsFields({
  settings,
  onChange,
}: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}) {
  function num(key: keyof Settings, raw: string) {
    const n = Number(raw)
    if (Number.isFinite(n)) onChange({ [key]: n })
  }

  return (
    <>
      <Label className="mt-2" htmlFor="ptsc">
        Points for correct
      </Label>
      <Input
        id="ptsc"
        type="number"
        defaultValue={settings.pointsCorrect}
        onChange={(e) => num("pointsCorrect", e.target.value)}
      />
      <Label htmlFor="ptsw">Points for wrong (use a negative number)</Label>
      <Input
        id="ptsw"
        type="number"
        defaultValue={settings.pointsWrong}
        onChange={(e) => num("pointsWrong", e.target.value)}
      />
      <Label htmlFor="ptswo">
        Points to everyone else on a wrong buzz (0 = off, buzz and reveal rounds)
      </Label>
      <Input
        id="ptswo"
        type="number"
        defaultValue={settings.pointsWrongOthers}
        onChange={(e) => num("pointsWrongOthers", e.target.value)}
      />
      <Label htmlFor="rstep">Reveal step size (%)</Label>
      <Input
        id="rstep"
        type="number"
        min={1}
        max={100}
        defaultValue={settings.revealStepPercent}
        onChange={(e) => num("revealStepPercent", e.target.value)}
      />
      <Label htmlFor="mcsec">
        Multiple choice time limit in seconds (0 = off)
      </Label>
      <Input
        id="mcsec"
        type="number"
        min={0}
        defaultValue={settings.mcSeconds}
        onChange={(e) => num("mcSeconds", e.target.value)}
      />
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.buzzHidesQuestion}
          onChange={(e) => onChange({ buzzHidesQuestion: e.target.checked })}
        />
        Buzzing hides the question from players
      </label>
      <label
        className="flex items-center gap-2 text-sm"
        title="Orders buzzes by each player's own reaction time, cancelling latency both ways. Trusts the player's device, so only for friendly games"
      >
        <input
          type="checkbox"
          checked={settings.friendsBuzz}
          onChange={(e) => onChange({ friendsBuzz: e.target.checked })}
        />
        Buzzing calculations: friends mode
      </label>
    </>
  )
}
