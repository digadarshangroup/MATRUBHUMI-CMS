# Design system — Matrubhoomi HRMS

The brief was a plain, legible internal tool. Not a showcase. Everything below
follows from that: no gradients on text, no glass, no ambient motion, one
accent, and colour that means something wherever it appears.

## Where the palette comes from

The company mark carries four materials — foliage, brick, water, and a hard
hat. Three of them are accents; the fourth, the green, is the brand. They sit on
paper, not on cream. They map onto the interface with a strict hierarchy:

| Material | Token | Role |
|---|---|---|
| Field green | `--g-brand` | THE brand. Every primary action, every focus ring, the first chart series. |
| Brick | `--g-brick` | Accent and chart series only. Never chrome. |
| Water | `--g-water` | Accent and chart series only. Never chrome. |
| Harvest | `--g-harvest` | Sparing highlight. Never a fill behind body text. |
| Paper | `--g-bg` | The page ground. |

The ground is a neutral near-white and the surfaces are pure white. It was a
warm cream once, on the argument that warmth kept the green reading as foliage.
It did — and it also put a faint yellow cast on every screen, which read as an
older interface than this is, and it left white cards floating on top of the
page rather than sitting in it.

The green did not need the cream. Against a neutral ground there is no competing
warmth for it to be measured against, so it reads MORE like the logo's green,
not less. The identity is carried by the accent and by restraint, which is where
it belongs — a brand that only survives while its background is tinted is not a
brand, it is a tint.

## Colour

```
Light                          Dark
--g-brand         #1F6B33      #4FBF6B
--g-brand-strong  #14471F      #85DA9A
--g-brand-ink     #ffffff      #08210E
--g-bg            #F6F7F9      #0D1013
--g-surface       #ffffff      #16191D
--g-surface-2     #F0F2F5      #1C2026
--g-line          #E2E5EA      #272C33
--g-ink           #16191D      #ECEFF3
--g-ink-2         #454B53      #B3BAC3
--g-ink-3         #626A73      #99A1AB
--g-danger        #B0392A      #F3A18C
--g-hint          #8A5A08      #E7BE4E
--g-ink-faint     #6B747E      #828A94
--g-harvest       #946A07      #E7BE4E
```

Every one of those pairs clears WCAG AA for small text against the surface it
is drawn on. Two of them are darker than the logo's own colours for that reason
alone: `--g-harvest` paints 11px status chips as well as a chart series, and the
logo's harvest cleared 3:1 — enough for a chart, not enough to read. When a
token has two jobs, it is tuned for the stricter one.

Ground to surface is a 2–3% step. Any more and the page stops being one sheet
and starts being a stack of tiles.

The ink is neutral and very slightly cool, never `#000`. Pure black on white is
harsher than any printed page, and on a dense attendance table that harshness is
what makes twenty minutes of reading tiring.

**Dark is not an inversion.** The green lifts to `#4FBF6B`, because `#1F6B33` on
a near-black ground is unreadable as a button fill. Everything else stays
neutral, matching the light theme's paper rather than tinting the dark one
green — a green-cast dark against a neutral-white light reads as two products.

Never write a hex value in a component. Both themes are declared once, in
`app/globals.css`, and the shadcn names (`--background`, `--primary`, …) are
aliases onto them — so retuning one token moves every surface that reads it.

The theme is set on `<html data-mb-theme>` by a blocking inline script in the
root layout, before first paint. Anything deferred paints the wrong theme first.

## Type

System sans throughout (`ui-sans-serif` stack). No webfont for UI — the letters
here are read, not admired, and a font swap on a table of attendance figures is
a worse cost than a distinctive typeface is a benefit.

| Step | Size | Use |
|---|---|---|
| Display | `clamp(2.2rem, 6vw, 3.5rem)` | the landing headline, once |
| Page title | 20px / 600 | one per screen |
| Section | 15px / 620 | card and panel headings |
| Body | 13–14px / 400 | everything |
| Meta | 12–12.5px | captions, footers, hints |
| Label | 11px, uppercase, tracked | `.ck-label`, stat and field labels |

Tracking tightens as size grows (`-.034em` on display, `-.012em` at 15px) and
never on body text.

Figures are `tabular-nums`, always. A count that shifts width as it changes is a
count nobody can scan down a column.

## Shape and depth

- Radius: 10px (`--g-radius`) for controls, 16–18px for cards and panels.
- Border: one hairline, `--g-line`. It does the work a shadow would.
- Shadow: `--g-shadow`, a whisper. Depth is border and ground contrast, not
  elevation theatre.
- No blur, no glass, no gradient behind text.

## Motion

Transitions on hover and press only — `.15s` colour, `.1s` a 1px press. Nothing
animates on load, nothing loops, nothing moves while being read. Everything
decorative is behind `@media (prefers-reduced-motion: reduce)`.

## The measurement kit

The attendance and department screens are built on a second, denser layer
(`app/ui-kit.css`, scoped to `.mb-ui`, consumed through
`components/ceo/ui/Primitives.tsx`). It has its own vocabulary — `slab` for the
inverted figure surface, `frost-panel` for decks, `field` for the ground — and
its own four measurement channels `--c1`…`--c4`, which are the same four
materials as above.

Its tokens are tuned much calmer than the kit it descends from, and calmer again
since the ground became paper: the field is a neutral wash in the gutters at a
fraction of its old presence, not a moving surface, and its slab is neutral
graphite rather than the green-black it was. If a screen needs a dense data
table with its own scale, it belongs in `.mb-ui`. Everything else uses `--g-*`.

## Rules that are not negotiable

1. **No hardcoded colour in a component.** Tokens, always.
2. **One accent.** Green means "primary action". If brick or water starts
   carrying actions, the interface has no primary any more.
3. **The field is not a text surface.** If body text is hard to read over the
   ground, the fix is geometry — make the panel opaque — never a darker ink.
4. **Every figure links somewhere.** A number with no route to its detail is a
   number nobody can act on.
5. **Status colour is never the only signal.** Pair it with a word or an icon.
