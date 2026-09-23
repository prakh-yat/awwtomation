# Awwtomation

Comment-to-DM automation for Instagram and Facebook. Next.js 15 (App Router),
React 19, Prisma 6 + Postgres, a Postgres-backed job queue and a worker process.

Read `docs/ARCHITECTURE.md` before changing anything structural. It is the
contract: routes, service boundaries, and which file owns what.

## Writing rules

**No em dashes.** Not in UI copy, not in commit messages, not in comments, not
in docs. Use a colon, a comma, or two sentences. `npm run lint` fails the build
on one in any string, template literal or piece of JSX text, so this is not a
matter of taste to re-litigate. An en dash in a numeric or date range
(`Mar 4 - Mar 11`) is fine; a dash standing in for an empty table cell uses `–`.

Write the way the existing code writes: plain words, no filler, no marketing
voice in product copy. Say what the thing does.

## Look

The palette and type come from the marketing site (`app/globals.css`): ink on
paper, a fog grey for surfaces, and flat accents (yellow, magenta, purple,
indigo, blue, green, orange, lavender, sky, sage) that appear as whole blocks,
never gradients. Archivo 900 is the display cut (`font-display`, page titles and
big numbers), Figtree the body, Geist Mono the small uppercase label
(`brand-label`). Buttons are pills. Focus rings are magenta; selection is yellow.

Colour means something. Every section has its own tone, Instagram is magenta
and Messenger blue, statuses and flow steps each have a colour. The rules and
the tables are in `docs/DESIGN.md`; build with the tones in
`components/ui/tone.ts`, never raw hex or Tailwind's numbered shades.

## Page structure

Every app page opens with `<PageHeader title="..." />`. In a section with tabs
the title names the SECTION, not the page: every settings page is titled
"Settings" and the tab says which one you are on. No page carries a
description line under its title: the title stands alone.
Section tabs next to the title come from `SECTION_TABS` in
`components/app-shell/nav-config.ts`, not from the page. Only sections with
real sub-pages have them (Contacts, Settings).

The dashboard and the AI page fit one screen on a desktop: they fill
`100dvh` minus the page padding and scroll inside their own cards, never the
page.

## Navigation

Desktop navigation is the dock (`components/app-shell/dock.tsx`): section tiles
in their colours, resting as a thin column of colour dots at the left edge and
opening when the pointer reaches it. It magnifies under the cursor and the dock
itself grows with the icons, so nothing spills over its edge. Settings lives in
the account menu, not the dock.
Below `md` the same navigation is the drawer behind the header. There is no
persistent sidebar; pages get the full width.

Connected Instagram and Facebook accounts are managed from the dashboard: the
faces beside its title open the accounts dialog, and `Connect` starts Meta's
sign-in. There is no Channels page; `/channels` and `?accounts=1` both open
that dialog, and the OAuth callbacks land on `/dashboard`.

## AI

Replies are generated with the workspace's own provider key, not ours. There is
no shared key, no proxy and no per-message charge: `lib/ai/providers.ts` speaks
three request shapes (OpenAI-compatible, Anthropic, Google) and the workspace
supplies the endpoint, the model and the key. Keys are encrypted with
`APP_ENCRYPTION_KEY`, decrypted only in `lib/services/ai.ts`, and never leave
the server: `toProviderView` returns a four character hint instead.

A connection is a key for one of the presets in `lib/ai/presets.ts` (OpenAI,
Anthropic, Google, OpenRouter, xAI, Mistral, DeepSeek, Groq and sixteen more,
or a custom endpoint), with a default model; the model list comes live from the
provider. Every preset shows its own logo from `public/providers/`. Providers
are picked, connected and managed from the dropdown in the agent editor on
`/ai`; there is no separate providers page. An agent
(`AiAgent`) is a model (its own, or the connection's default), a prompt, a
knowledge block, guardrails, a fallback reply and a list of link buttons. The workspace's words go in first, verbatim;
what we append is only what the model cannot know (that it is writing a DM, the
length limit, the two markers). A reply may name one of the agent's own buttons
with `[[BUTTON:Label]]`, which we resolve to the configured URL, so an
interactive reply can never carry a link nobody approved. `[[HANDOFF]]` takes
the flow's handover branch and `[[DONE]]` ends the conversation.

A custom endpoint is user input that the server then fetches, so `checkBaseUrl`
refuses link-local, private and metadata addresses in every environment, and
allows loopback only in development.

## Checks

```bash
npm run typecheck && npm run lint && npm run build
```

All three must pass before anything is committed.
