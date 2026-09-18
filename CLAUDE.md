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

## Page structure

Every app page opens with `<PageHeader title="..." />`. The dashboard is the
only page that carries a `description`; everywhere else the title stands alone.
Section tabs next to the title come from `SECTION_TABS` in
`components/app-shell/nav-config.ts`, not from the page.

## Navigation

Desktop navigation is the dock (`components/app-shell/dock.tsx`): hidden until
the pointer reaches the left edge of the window, magnifying under the cursor.
Below `md` the same navigation is the drawer behind the header. There is no
persistent sidebar; pages get the full width.

## Checks

```bash
npm run typecheck && npm run lint && npm run build
```

All three must pass before anything is committed.
