# Awwtomation: Design System

The product looks like the marketing site: ink on paper, a fog grey for
surfaces, and flat brand accents used as whole blocks. Colour is there to say
something (which section you are in, which platform, what state a thing is in),
never as decoration and never as a gradient.

Tokens live in `app/globals.css` and `tailwind.config.ts`. Named tones live in
`components/ui/tone.ts`.

## Palette

| Name | Hex | Solid text | Classes |
|---|---|---|---|
| ink | `#0f0f0f` | white | `bg-ink`, `text-ink` |
| paper | `#ffffff` | ink | `bg-paper` / `bg-background` |
| fog | `#f5f5f5` | ink | `bg-fog` |
| yellow | `#fff200` | ink | `bg-yellow`, `bg-yellow-soft`, `text-yellow-ink` |
| magenta | `#fb0df7` | white | `bg-magenta`, `bg-magenta-soft`, `text-magenta-ink` |
| purple | `#7b34ce` | white | `bg-purple`, `bg-purple-soft`, `text-purple-ink` |
| indigo | `#3c42c4` | white | `bg-indigo`, `bg-indigo-soft`, `text-indigo-ink` |
| blue | `#2b60f8` | white | `bg-blue`, `bg-blue-soft`, `text-blue-ink` |
| green | `#007257` | white | `bg-green`, `bg-green-soft`, `text-green-ink` |
| orange | `#ff4c00` | ink | `bg-orange`, `bg-orange-soft`, `text-orange-ink` |
| lavender | `#d8bee3` | ink | `bg-lavender`, `bg-lavender-soft`, `text-lavender-ink` |
| sky | `#96dae3` | ink | `bg-sky`, `bg-sky-soft`, `text-sky-ink` |
| sage | `#edf2ee` | ink | `bg-sage` |

Every accent has three strengths: the solid block, a `-soft` tint for chips and
highlighted rows, and an `-ink` step that is dark enough for small text on
white. Never set small text in a solid accent colour on white (yellow, sky,
lavender, orange and magenta fail contrast); use the `-ink` step.

Tailwind's numbered shades (`bg-orange-500`) still exist underneath and are used
only by pipeline stage colours (`lib/pipelines/colors.ts`). Do not use them
anywhere else, and do not write raw hex values in components; charts and SVG
take `TONE_HEX` from `components/ui/tone.ts`.

## Where colour goes

**Sections.** Each section has a tone (`components/app-shell/nav-config.ts`).
It colours the section's dock tile and the tile beside its page title, and it
is the default tone for that section's empty states.

| Section | Tone | | Section | Tone |
|---|---|---|---|---|
| Dashboard | yellow | | Contacts | green |
| Analytics | blue | | Broadcasts | orange |
| Automations | purple | | Links | sky |
| AI | ink | | Logs | lavender |
| Inbox | magenta | | Settings, Usage | fog |

**Platforms.** Instagram is magenta, Facebook and Messenger are blue. Use
`PlatformMark` (a colour tile with the glyph) next to a handle, and
`PlatformBadge` for a soft labelled pill. Both are in
`components/ui/platform-badge.tsx`.

**States.** Use `Badge` variants:

| State | Variant |
|---|---|
| Active, live, sent, completed, connected | `success` (add `dot="pulse"` for something running now) |
| Draft, cancelled, archived | `secondary` |
| Paused, needs attention | `yellow` |
| Scheduled | `sky` |
| Sending, in progress | `blue` with `dot="pulse"` |
| Warning, expiring | `warning` |
| Failed, error, disconnected | `destructive` |

**Flow steps** (automation builder): trigger yellow, send message purple, ask a
question sky, AI reply ink, follow gate orange, delay lavender, tags green,
pipeline steps blue.

**Highlights.** At most one filled colour block per page: the number or action
the page wants you to see first (`Stat` with a tone, or a coloured panel with
the faint `bg-grid`). Everything else sits on white cards with hairline borders
or on fog panels.

## Type

- Page titles and big numbers: Archivo 900 via `font-display`.
- Body: Figtree, 13 to 15px. Meta 12px.
- Eyebrows, table headers, stat labels: `brand-label` (Geist Mono, uppercase).

## Components

- Buttons are pills. `default` is ink. `highlight` (yellow) is for the single
  most important growth action on a page (connect an account, upgrade).
  `secondary` is fog, then `outline`, `ghost`, `destructive`, `link`.
- Cards: `rounded-2xl border bg-card`, no shadow. Clickable cards get `lift`.
- Inputs: 40px tall, `rounded-xl`, ink border and a soft magenta ring on focus.
- Tabs and segmented controls: fog track, ink active pill (`components/ui/segmented.tsx`).
- `PageHeader` renders the section tile, the `<h1>`, the section tabs and the
  page actions. Every app page starts with it, and none has a description line.
- Filters that pick one of several views (inbox views, log, broadcast and
  automation statuses, contact segments and pipeline stages) are a `FilterMenu`
  (`components/ui/filter-menu.tsx`): an icon button that names the active
  filter, with the choices and their counts underneath. In a toolbar where
  every other control has words (Contacts), it shows its name too and takes
  the toolbar's pill style.
- A panel that scrolls inside a fixed-height page needs no extra care: every
  `overflow-*-auto` element is a containing block (`app/globals.css`), so text
  kept for screen readers inside it cannot stretch the page.
- Cards carry data, not decoration: no icon in a card's corner, no line under
  a number explaining what it is compared with.
- AI providers appear with their own logos (`ProviderLogo`, files in
  `public/providers/`) on a white tile, never as coloured monograms.
- `EmptyState` takes a `tone`; use the section's.
- `Stat` for KPI numbers.
- Lists rise in on load: add `rise` and `style={{ "--i": index }}` to each row
  (cap the index around 12).

## Motion

Short and soft: 150 to 350ms, `ease-soft`. Entrances rise 10px and fade;
cards lift 2px on hover; dragged flow steps tilt slightly and cast a shadow;
the selected edge animates. Everything respects `prefers-reduced-motion`.

## Words

- Plain words, sentence case, no filler. Say what the thing does.
- No em dashes. `npm run lint` fails on one.
- No paragraph under a title that restates the title. A hint appears only when
  it prevents a mistake (a format, a limit), and is one short line.
- No "how it works" boxes, no explaining the product to the person using it.
- Never describe internal mechanics or business terms: queues, webhooks,
  retries, rate limits, token refreshes, "we never charge", "your key, your
  bill", "Meta rule" lectures. Say what happened and what to do next.
- No marketing voice in product copy: no "seamlessly", "powerful", "unlock",
  "supercharge", no exclamation marks.
- Buttons are verbs: "Save", "Connect account", "New broadcast".
