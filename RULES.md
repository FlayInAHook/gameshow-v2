# House rules

How the app actually behaves, and what to do with it when you build a question
set. Mechanics are facts from the code; **Rule of thumb** lines are judgement
calls you can ignore.

## The round, in five beats

Every type follows the same shape. Break it and the game loses its tension.

1. **Open** — the host picks a question. Everyone can answer or buzz.
2. **Close** — "Close round" locks the answers in. It reveals *nothing* on
   multiple choice and free input; players see "Answers locked". This is the
   pencils-down moment, and it is deliberately separate from the reveal.
3. **Uncover** — the host flips things face-up one at a time.
4. **Solution** — the correct option flipped last, or "Reveal answer" on a free
   round. Buzz and reveal rounds put the answer up automatically on close.
5. **Next** — selecting a question resets the round completely.

**Rule of thumb:** never skip beat 2. Closing first means nobody can change an
answer once the first clue lands, and it is the only thing that makes beat 3
feel like a reveal rather than a scoreboard update.

## The four question types

| Type | Players do | Host does | Scored by |
|---|---|---|---|
| **Multiple choice** | tap an option | flip options face-up | the app, on flip |
| **Buzz** | hit BUZZ / space | judge out loud | host, per buzzer |
| **Free input** | type an answer (200 chars) | read answers out, then the solution | host, per answer |
| **Image reveal** | watch, then BUZZ | run the reveal, judge | host, per buzzer |

- **Multiple choice** is the only self-scoring type: flipping an option pays
  everyone who picked it, once per option per round. Un-flipping does not take
  the points back — fix mistakes with the ± buttons in the players panel.
- **Free input** is never auto-scored. Typos, synonyms and wrong-but-funny
  answers are yours to rule on.
- **Buzz** and **image reveal** are the only types with the wrong-answer bonus
  (below), because they are the only ones where answering is a *decision*.
- **Image reveal** either uncovers itself over its timer (30s by default, in 20
  steps) or steps manually at 5% a press. A buzz freezes an auto-reveal;
  clearing the buzzer resumes it from where it stopped.

## Scoring

Defaults: **+3 correct**, **0 wrong**, **+1 to everyone else on a wrong buzz**.

Every question is worth the same — there is no per-question value. Weight a
round by how many questions of a type you write, not by what they pay.

### Buzz early

With the defaults, buzzing is worth it whenever you are more than **25%** sure:

```
right:  +3 to you, nothing to anyone else   →  +3 against the field
wrong:   0 to you, +1 to everyone else      →  −1 against the field
break-even:  3p = 1 − p  →  p = 0.25
```

That is aggressive on purpose — it keeps hands moving. If your group sits on
the buzzer, raise the wrong-buzz bonus to 2 (threshold 33%) or 3 (40%). Setting
it to 0 removes the risk entirely and buzz rounds become a pure reflex race.

### Guessing on multiple choice

With wrong worth 0, a blind guess on four options is worth +0.75 and costs
nothing, so **everyone should always guess** — which flattens the gap between
the player who knows and the player who doesn't.

**Rule of thumb:** set points for wrong to **−1**. A blind four-option guess is
then exactly break-even (0.25 × 3 − 0.75 × 1 = 0), so knowing still pays and
guessing is a coin flip rather than free money. −2 punishes rather than
balances. Leave it at 0 for kids and mixed-ability groups.

### The tally

The leaderboard counts correct/wrong per player, but only from host judgements
and multiple-choice flips. Manual ± tweaks move points without touching the
tally, so use them for corrections and prizes.

## Settings worth changing

| Setting | Default | Change it when |
|---|---|---|
| Points for correct | 3 | rarely — change the others relative to this |
| Points for wrong | 0 | multiple choice feels like a lottery → −1 |
| Points to everyone else on a wrong buzz | 1 | nobody buzzes → 2–3; pure reflex round → 0 |
| Reveal step size | 5% | big obvious images → 10%; cruel ones → 2–3% |
| Multiple choice time limit | 0 (off) | the room stalls → 20–30s |
| Buzzing hides the question | on | a long question needs re-reading → off |
| Buzz calculations: friends mode | on | see fairness, below |

Set these on the collection itself, under **Room settings** in the create page,
and a game is configured once and hosts the same way every time. The host panel
edits the same values live; changes made mid-game survive a host reconnect.

The timer, when on, closes the round by itself at zero — which still reveals
nothing, so the ceremony is unchanged.

## Writing a collection

- **Mix the types.** A run of eight multiple choice questions is a quiz; the
  same eight broken up with two buzz and one image reveal is a show.
- **20–30 questions** is a comfortable evening. Reveal rounds cost about a
  minute each with the judging; multiple choice runs two to three a minute.
- **Open easy, close hard.** Points are flat, so difficulty is your only pacing
  tool. Put the hardest questions late, when the trailing players need swings.
- **Keep option text short.** Options are buttons on a phone; four long options
  wrap into a wall.
- **Write four options, not two.** Two options is a coin flip that pays full
  points.
- **One line per question.** Long text pushes the answer buttons off a phone
  screen.
- **Shrink images before uploading.** They live in your browser's local storage
  as data-urls, and a collection that overflows it cannot be saved. Roughly
  1000px wide is plenty.
- **Never put the answer in the question text.** It is on the player's screen
  the whole round.

## Running the show

- **Put the spectate link on the projector, never the host screen.** The host
  panel shows the answer key at all times — the correct option is check-marked
  before you flip it. The spectate stage mirrors what the room is allowed to
  see; its sidebar does not, so keep that screen away from players too, and
  never share the spectate link with them.
- **Flip wrong options first.** Knocking out two of four and pausing before the
  last flip is the whole point of the staged reveal.
- **Read out the wrong free answers first**, funniest last before the solution.
- **Judge free answers consistently.** Decide up front whether spelling and
  surnames-only count, and say so before the first free round.
- **Award the buzz before clearing it.** Clearing the buzzer drops the order,
  and on a reveal round it also resumes the image.
- **Use "Reset round"** if a question breaks — it clears answers, buzzes and
  reveals so you can run it again cleanly. "Open round" un-locks without
  losing anything.

## Fairness

- **Friends mode** (on by default) orders buzzes by the reaction time each
  player's own device reports, which cancels latency in both directions but
  takes the device at its word. It is the right setting for a living room.
  Turn it off for anything with stakes: the server then falls back to arrival
  time minus half the player's measured roundtrip.
- **Joining mid-round** makes that player's reaction clock untrustworthy, so
  the server ignores their self-reported timing for that round.
- **Players cannot read ahead.** The answer key never reaches a player's
  browser: they get the questions with the correct option and answer text
  stripped, and only see other people's answers once you reveal them.
- **Except reveal images.** The picture is sent whole and obscured in the
  browser, so a determined player with developer tools can pull the original.
  Reveal rounds run on trust.
