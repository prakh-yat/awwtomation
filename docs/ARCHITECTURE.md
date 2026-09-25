# Awwtomation: Architecture & Build Contract

This document is the single source of truth for everyone (human or agent) building Awwtomation.
Read it fully before writing code. When this doc and your instinct disagree, follow this doc.

## 1. Product

Awwtomation is a **multi-tenant SaaS** (a ManyChat alternative) for Instagram and Facebook:

- **Comment → DM automation**: someone comments a keyword on a post/reel → we send them a private reply (DM) with links/buttons, optionally reply publicly under the comment, optionally gate the link behind a follow.
- **DM & Story-reply triggers**: keywords in inbound DMs / story replies start flows.
- **Flow builder**: visual canvas (React Flow), Trigger → Message (with buttons) → Ask a question → AI reply → Follow gate → Delay → Tag → Add to pipeline / Move stage / Remove from pipeline. Steps are added from the palette (click, or drag onto the canvas; dropped on a connection a step goes in between), from the + under a step or on a connection, or by letting go of a dragged connection on empty canvas. Edits can be undone (⌘Z / ⇧⌘Z). The canvas takes the whole window; settings float over it only for what is selected: the trigger's on the left, any other step's on the right, nothing when nothing is (Escape or a click on empty canvas closes them), and a new automation opens with its trigger selected. Steps a platform cannot run are not offered: no follow gate on Messenger, no story reply trigger on a Facebook Page (activation refuses it too). "New automation" opens an empty canvas (just the trigger); templates are a dialog over the list, opened from the header button, the Templates tab (`/automations?templates=1`) or the empty state.
- **Inbox**: unified live chat for IG + FB with the 24h window indicator.
- **Contacts (CRM)**: everyone who interacted plus manual and imported records, in a paginated list. Each workspace has any number of **pipelines**, each with ordered, coloured stages; a contact can be in several pipelines at one stage each, or in none. Owners, notes, tags, custom fields and segments.
- **Broadcasts**: send a message to a tagged audience (only contacts inside the 24h window are eligible, Meta rule). `/broadcasts/new` is four steps (Audience, Message, When, Review) with the live reach beside them; a saved draft or scheduled broadcast reopens on Review.
- **Analytics**: DMs sent, triggers, CTR via tracked links, per automation and per workspace, plus where contacts sit in each pipeline.
- **Tracked links**: `/l/{slug}` redirects with click counting.
- **Organizations, workspaces & team**: an **organization** is the billable account. It holds the plan, billing, the team (owner/admin/member roles apply to every workspace in it) and invitations. A **workspace** is a brand or client inside it and holds all product data. A workspace connects at most one Instagram account and one Facebook Page (`assertPlatformFree` in `lib/services/channels.ts`); reconnecting that same account is always allowed, and a disconnected one frees the place. Users can belong to several organizations and switch between them from the account menu; workspaces are switched from the sidebar.
- **MCP server**: one URL, `/mcp`, lets AI apps (Claude, ChatGPT, Claude Code, Cursor) do what a person can do in the app: build automations and flows, set up AI providers and agents, work the inbox, contacts, pipelines, segments, broadcasts and links, read analytics, logs and usage, and manage workspaces and the team. People paste the URL; the app registers itself over OAuth, the person approves it on a consent screen and picks the workspaces it may use. It acts as that person with their current role. Settings, MCP shows the URL and every tool; read-only tools are open to every member and write tools to owners until the owner opens them to more people.
- **Plans & usage**: FREE/STARTER/PRO/AGENCY per organization, with DM, channel, automation and seat caps counted across all of its workspaces, enforced server-side.
- **No platform admin UI**: the product only ever shows a customer their own organizations. Operator tasks (comping a plan) run from `scripts/set-plan.ts`.
- **Marketing site**: a separate project. This app keeps only `/pricing`; the legal pages Meta App Review needs are on the marketing site.

Branding: the marketing site's palette, ink on paper with flat colour blocks (see `docs/DESIGN.md`). Product name lives in `lib/brand.ts` (`brand.name`). Never hardcode "Awwtomation" in UI: import `brand`.

## 2. Stack (already installed: do not add dependencies without a strong reason)

- Next.js 15 App Router, React 19, TypeScript strict. **Node runtime for all route handlers** (`export const runtime = "nodejs"` where Prisma/crypto is used).
- Tailwind 3.4 + shadcn-style components in `components/ui/*` (Radix primitives, `cva`, `cn` from `@/lib/utils`).
- Prisma 6 + Postgres. Schema is FINAL at `prisma/schema.prisma`: read it. If you truly need a schema change, make it additive and note it in your final report.
- AI replies are bring-your-own-key: `lib/ai/*` (providers, prompt assembly, marker parsing, `presets.ts` for the provider picker, logos in `public/providers/`), `lib/services/ai.ts` (CRUD, `runAgent`, live model lists), the `ai_reply` flow node, and `/ai` for agents and providers. No shared key and no model cost to us. A connection has a default model; an agent may name its own (`AiAgent.model`). `lib/ai/providers.ts` adapts parameters per model family (no `temperature` for reasoning models, `max_completion_tokens` for OpenAI, headroom for thinking) and retries once when a provider names a parameter it refuses.
- Google OAuth 2.0 + PKCE, implemented in-app (`lib/auth/*`). Our own `User` row mirrors the Google identity (`authId` = `google:<sub>`; the column is still physically named `supabaseId`, see the `@map` in the schema).
- Postgres-backed job queue (`Job` model) + `worker/index.ts` (run with `npm run worker`). No Redis.
- `@modelcontextprotocol/sdk` for the MCP server (`lib/mcp`), using its web-standard streamable HTTP transport inside a route handler.
- `@xyflow/react` for the flow builder. `recharts` for charts. `sonner` for toasts. `lucide-react` icons. `zod` validation. `date-fns`.
- Fonts: Archivo (display) and Figtree (body) via `@fontsource-variable`, Geist Mono via the `geist` package.

## 3. Conventions

- Path alias `@/` = repo root. Folders: `app/`, `components/`, `lib/`, `worker/`, `prisma/`, `docs/`.
- **Tenant isolation is non-negotiable**: every Prisma query on tenant data must include `workspaceId` (or go through a relation that was itself loaded by workspaceId). Organization data (billing, members, invitations, payments) is scoped by `organizationId` after checking membership. Never trust ids from the client without scoping.
- Server components fetch data directly through `lib/services/*`. Client components call `app/api/*` route handlers (JSON) or server actions colocated in the feature (`actions.ts`).
- API responses: success `NextResponse.json(data)`; errors `NextResponse.json({ error: string, code?: string }, { status })`. Validate bodies with zod. Return 401 for no user, 403 for wrong role/workspace, 404 for missing, 422 for validation.
- Use `requireWorkspaceContext()` (see §5) at the top of every app page/route. Use `requireRole(ctx, "ADMIN")` for mutating settings/channels/billing.
- Toast on success/failure in client components (`toast` from `sonner`).
- Loading + empty states for every list. Skeletons for initial loads. Every page has exactly one `<h1>`, rendered by `<PageHeader>` along with the section tabs and the page's actions. No page has a description line.
- Comments explain *why*, not *what*. Match the density of the existing code.
- No `any`. No `console.log` in production paths (use `logger` from `lib/logger.ts`).
- Money/usage is integer counts. Dates in UTC in DB; render with workspace timezone where relevant.

## 4. Routes

Marketing (public, `app/(marketing)/`): `/pricing` only. `/` has no page: middleware sends it to `/login`, or `/dashboard` when signed in. Privacy, terms and data deletion live on the marketing site (`brand.legal` in `lib/brand.ts`); Meta's data deletion callback points there.
Auth: `/login` (Google button, a plain link), `app/auth/google/route.ts` (mint state + PKCE, redirect to Google), `app/auth/callback/route.ts` (verify state → exchange code → upsert User → start session → ensure an organization with a workspace → redirect), `app/auth/signout/route.ts`.
App (protected, `app/(app)/`, uses sidebar shell):
- `/dashboard`: overview KPIs, charts and recent activity, fitted to one screen; also where accounts are connected and managed (`?accounts=1` opens the accounts dialog; the Meta OAuth callbacks land here with `?connected=` or `?error=`)
- `/automations` (the template dialog opens over it on `?templates=1`), `/automations/[id]` (builder; draws edge to edge), `/automations/[id]/analytics`. `/automations/templates` and `/automations/new` redirect to the list with the dialog open.
- `/inbox` (+ `?c=<conversationId>`)
- `/contacts` (`?pipelineId=&stageId=&view=board&page=&pageSize=` plus filters), `/contacts/[id]`, `/contacts/pipelines` (create, rename, recolour, reorder and delete pipelines and stages)
- `/broadcasts`, `/broadcasts/new`, `/broadcasts/[id]`
- `/channels` redirects to `/dashboard?accounts=1`; `/channels/select-pages` is the Facebook Page picker the OAuth callback hands over to (one Page, as a radio choice)
- `/ai` (agents, with providers in the editor's dropdown; `?agent=<id>` opens that agent; `/ai/providers` redirects here)
- `/links`
- `/logs`
- `/analytics`, `/automations/[id]/analytics`
- `/usage` (the organization's usage history, linked from the sidebar meter)
- `/settings` (workspace and organization, ownership and deletion), `/settings/workspaces`, `/settings/mcp` (the MCP URL, then every tool in collapsible groups, three to a row, with who may use it: the owner edits that, everyone else reads it; every role), `/settings/team`, `/settings/billing`. `/settings/usage` and `/settings/pipeline` redirect to `/usage` and `/contacts/pipelines`.
- `/onboarding` (no organization yet → create one with its first workspace), then `/welcome` (the questionnaire: three profile questions, the channel connection, then six usage questions; full window, no dock, skippable, stored on `Workspace.onboardingAnswers`)
Other: `/organizations` (pick an organization), `/organizations/new` (create another billable organization), `/invite/[token]` (accept an organization invitation), `/l/[slug]` (tracked-link redirect, `route.ts`), `/checkout`, `/checkout/success`.
API: `app/api/**` (see file ownership §9). Webhooks: `app/api/webhooks/meta/route.ts` (GET verify, POST receive). Cron: `app/api/cron/{tick,refresh-tokens,reconcile}/route.ts` guarded by `Authorization: Bearer ${CRON_SECRET}`.
MCP (see §5 lib/mcp): `app/mcp/route.ts` (POST, stateless streamable HTTP, bearer token), `app/oauth/register` (RFC 7591 dynamic client registration), `app/oauth/authorize` (consent page + `actions.ts`), `app/oauth/token` (authorization_code with PKCE S256, refresh_token with rotation), `app/oauth/revoke` (RFC 7009), `app/.well-known/oauth-authorization-server` and `app/.well-known/oauth-protected-resource` (each also under `[...path]`), `app/api/mcp/tools/[name]` (PUT `{ everyone, userIds }`, OWNER: who may use one tool).
Meta OAuth: `app/api/meta/instagram/start`, `app/api/meta/instagram/callback`, `app/api/meta/facebook/start`, `app/api/meta/facebook/callback`, `app/api/meta/deauthorize`, `app/api/meta/data-deletion`.

The active organization and workspace are stored in cookies `or_org` and `or_workspace`. Both are preferences, re-checked against membership on every request. The sidebar's workspace switcher sets them via `POST /api/workspaces/switch`; the account menu switches organization via `POST /api/organizations/active`.

## 5. Shared module contracts (exact exports: implement OR consume exactly these)

Already written (do not rewrite): `lib/env.ts` (`getEnv`, `optionalEnv`, `appUrl`, `isMetaConfigured`), `lib/db.ts` (`prisma`, re-exports `@prisma/client`), `lib/crypto.ts` (`encrypt`, `decrypt`, `sha256`, `hmacSha256`, `constantTimeEqual`, `randomToken`, `signState`, `verifyState`), `lib/utils.ts` (`cn`, `slugify`, `formatNumber`, `formatPercent`, `truncate`, `initials`, `sanitizeNextPath`), `lib/brand.ts`.

### lib/logger.ts
`export const logger = { info(event: string, meta?: object), warn(...), error(...) }`, JSON lines to stdout/stderr.

### lib/auth/google.ts, token.ts, cookies.ts, middleware.ts
- `lib/auth/google.ts`: authorize URL, PKCE pair, code→`id_token` exchange, `readIdentity()` (validates `iss`/`aud`/`exp`/`email_verified`).
- `lib/auth/token.ts`: `signSession()` / `verifySession()`: an HMAC-SHA256 cookie payload (`{uid, iat, exp}`) keyed by `APP_ENCRYPTION_KEY`. Web Crypto only, so the Edge middleware can verify it.
- `lib/auth/cookies.ts`: cookie names/attributes plus the short-lived OAuth transaction blob (`state`, PKCE verifier, `next`).
- `updateSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }>`, used by `middleware.ts` to verify (and slide) the session cookie and gate `/dashboard|/automations|...` → redirect to `/login?next=`. No DB, no network.

### lib/auth/session.ts
- `getCurrentUser(): Promise<User | null>`, verifies the session cookie and loads the `User` row. Cached per request with `React.cache`. `syncGoogleUser()` upserts by `authId`, falling back to email so an existing account re-links instead of colliding.
- `requireUser(): Promise<User>`, redirects to `/login` if null.
- `signOut()` helper used by `/auth/signout`.

### lib/workspace/context.ts
```ts
export type WorkspaceContext = {
  user: User;
  organization: Organization;   // the billable account the active workspace belongs to
  workspace: Workspace;
  role: WorkspaceRole;          // the user's organization role; applies to every workspace in it
  workspaces: Array<Pick<Workspace, "id" | "name" | "slug">>;  // in the active organization
  organizations: Array<{ organization: Pick<Organization, "id" | "name" | "slug" | "plan">; role: WorkspaceRole }>;
};
export async function getWorkspaceContext(): Promise<WorkspaceContext | null>; // null when user has no workspace
export async function requireWorkspaceContext(): Promise<WorkspaceContext>; // redirect("/login") or redirect("/onboarding")
export function requireRole(ctx: WorkspaceContext, min: WorkspaceRole): void; // throws ForbiddenError (OWNER > ADMIN > MEMBER)
export const ACTIVE_WORKSPACE_COOKIE = "or_workspace";
export const ACTIVE_ORGANIZATION_COOKIE = "or_org";
```
For route handlers (no redirect): `lib/workspace/api.ts` → `withWorkspace(handler: (req, ctx) => Promise<Response>, opts?: { minRole?: WorkspaceRole })` returning proper 401/403 JSON. Also `export class ApiError extends Error { constructor(public status: number, message: string, public code?: string) }` and `handleApiError(err): NextResponse`.

### lib/workspace/permissions.ts
`roleRank(role)`, `canManageSettings(role)`, `canManageChannels(role)`, `canEditAutomations(role)` (MEMBER can edit automations & use inbox; ADMIN+ manages channels/team/billing; OWNER can delete workspace).

### lib/billing/plans.ts
```ts
export type PlanLimits = { channels: number; automations: number; dmsPerMonth: number; members: number; broadcasts: boolean; priceUsd: number; label: string; description: string; features: string[] };
export const PLANS: Record<PlanTier, PlanLimits>; // FREE: 1 ch, 3 autom, 100 DMs, 1 member, no broadcasts, $0
                                                    // STARTER: 3 ch, 20 autom, 2_000 DMs, 3 members, broadcasts, $15
                                                    // PRO: 10 ch, 100 autom, 15_000 DMs, 10 members, $49
                                                    // AGENCY: 50 ch, 1000 autom, 100_000 DMs, 50 members, $149
export function limitsFor(plan: PlanTier): PlanLimits;
```
### lib/billing/usage.ts
`reserveDmQuota(workspaceId, n = 1): Promise<{ ok: boolean; used: number; limit: number }>`, atomic on the workspace's **organization** row; resets `dmsSentThisPeriod` when `usagePeriodStart` is before the current month. `getOrganizationUsage(organizationId)` / `getUsage(workspaceId)`, `checkOrganizationLimit(organizationId, kind)` / `checkLimit(workspaceId, kind)`, `canAddChannel(workspaceId)`, `canAddAutomation(workspaceId)`, `canAddMember(workspaceId)`. Counts span every workspace in the organization.

### lib/meta/types.ts
```ts
export type OutboundButton = { type: "web_url"; title: string; url: string } | { type: "postback"; title: string; payload: string };
export type OutboundMessage = { text?: string; buttons?: OutboundButton[]; imageUrl?: string; quickReplies?: { title: string; payload: string }[] };
export type MetaProfile = { id: string; username?: string; name?: string; profilePic?: string; isFollower?: boolean; followerCount?: number };
export type NormalizedEvent =
  | { kind: "comment"; platform: ChannelPlatform; channelExternalId: string; commentId: string; mediaId: string; parentCommentId?: string; text: string; from: { id: string; username?: string }; timestamp: Date; raw: unknown }
  | { kind: "message"; platform: ChannelPlatform; channelExternalId: string; messageId: string; senderId: string; recipientId: string; text?: string; attachments?: unknown[]; storyReply?: { storyId?: string; url?: string }; isEcho: boolean; timestamp: Date; raw: unknown }
  | { kind: "postback"; platform: ChannelPlatform; channelExternalId: string; senderId: string; recipientId: string; payload: string; title?: string; timestamp: Date; raw: unknown }
  | { kind: "read" | "delivery" | "unknown"; platform: ChannelPlatform; channelExternalId: string; raw: unknown };
export class MetaApiError extends Error { constructor(message: string, public code?: number, public subcode?: number, public status?: number, public traceId?: string) }
export class MetaRateLimitError extends MetaApiError {}
export class MetaTokenError extends MetaApiError {}
```
### lib/meta/instagram.ts (Instagram API with Instagram Login, host `graph.instagram.com`)
`buildInstagramAuthUrl(state: string, redirectUri: string): string` (scopes: `instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish`), `exchangeInstagramCode(code, redirectUri): Promise<{ accessToken; userId }>`, `getInstagramLongLivedToken(shortToken): Promise<{ accessToken; expiresIn }>`, `refreshInstagramToken(longToken)`, `getInstagramMe(token): Promise<{ id; username; name?; profilePictureUrl?; followersCount? }>`, `subscribeInstagramWebhooks(token, igUserId)`, `listInstagramMedia(token, igUserId, { limit?, after? })`, `getInstagramMediaComments(token, mediaId, { since? })`, `sendInstagramPrivateReply(token, igUserId, commentId, message: OutboundMessage)`, `sendInstagramMessage(token, igUserId, recipientId, message: OutboundMessage, tag?: "HUMAN_AGENT")`, `replyToInstagramComment(token, commentId, text)`, `getInstagramUserProfile(token, igUserId, igsid): Promise<MetaProfile>` (fields `name,username,profile_pic,is_user_follow_business,follower_count`), `listInstagramConversations(token, igUserId)`, `getInstagramConversationMessages(token, conversationId)`.

### lib/meta/facebook.ts (Facebook Login + Pages + Messenger, host `graph.facebook.com`)
`buildFacebookAuthUrl(state, redirectUri)` (scopes `pages_show_list,pages_manage_metadata,pages_messaging,pages_read_engagement,pages_manage_engagement,pages_read_user_content,instagram_basic,instagram_manage_messages,instagram_manage_comments`), `exchangeFacebookCode(code, redirectUri)`, `getFacebookLongLivedToken(shortToken)`, `listFacebookPages(userToken): Promise<Array<{ id; name; accessToken; picture?; instagramBusinessId? }>>`, `subscribePageWebhooks(pageToken, pageId)` (fields `feed,messages,messaging_postbacks`), `sendMessengerMessage(pageToken, pageId, psid, message, tag?)`, `sendFacebookPrivateReply(pageToken, commentId, message)`, `replyToFacebookComment(pageToken, commentId, text)`, `getFacebookUserProfile(pageToken, psid)`, `listFacebookPosts(pageToken, pageId)`, `getFacebookPostComments(pageToken, postId)`, `listFacebookConversations`, `getFacebookConversationMessages`.

### lib/meta/client.ts
`metaFetch<T>(url: string, init?: RequestInit & { token?: string }): Promise<T>`, adds access_token, parses Graph errors into `MetaApiError` subclasses (code 4/17/32/613 → `MetaRateLimitError`; 190 → `MetaTokenError`), logs `X-Business-Use-Case-Usage` / `x-app-usage` headers when > 80%.

### lib/meta/webhook.ts
`verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean` (`sha256=` HMAC), `normalizeWebhookPayload(body: unknown): NormalizedEvent[]` (handles `object: "instagram"` and `object: "page"`; entries with `changes[].field ∈ {comments, live_comments, feed}` and `messaging[]`), `webhookDedupeKey(event: NormalizedEvent): string`.

### lib/meta/tokens.ts
`getChannelToken(channel: Channel): string` (decrypt), `storeChannelToken(channelId, token, expiresAt?)`, `refreshChannelTokenIfNeeded(channel)`.

### lib/rate-limit.ts
`reserveSlot(channelId, bucket: "private_reply" | "send", limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number; remaining: number; resetAt: Date }>`, atomic upsert+increment on `RateLimitWindow`; `PRIVATE_REPLY_LIMIT_PER_HOUR = 750`, `SEND_LIMIT_PER_MINUTE = 600` (conservative).

### lib/queue/index.ts
```ts
export async function enqueue(input: { type: JobType; payload: Record<string, unknown>; workspaceId?: string; runAt?: Date; dedupeKey?: string; maxAttempts?: number }): Promise<Job | null>; // null if dedupeKey already exists
export async function claimJobs(workerId: string, limit: number): Promise<Job[]>; // SELECT ... FOR UPDATE SKIP LOCKED via $queryRaw / interactive tx; sets PROCESSING/lockedAt/lockedBy
export async function completeJob(id: string): Promise<void>;
export async function failJob(id: string, error: string): Promise<void>; // exponential backoff (30s * 2^attempts, max 1h); FAILED when attempts >= maxAttempts
export async function releaseStaleJobs(olderThanMs?: number): Promise<number>; // PROCESSING locked > 10min → PENDING
export async function processBatch(workerId: string, limit: number): Promise<{ processed: number; failed: number }>; // claim → dispatch → complete/fail
```
### lib/queue/handlers/index.ts
`export const handlers: Record<JobType, (job: Job) => Promise<void>>`, `EXECUTE_FLOW` → `lib/automation/engine.executeFlowStep`, `PUBLIC_REPLY` → `lib/automation/public-reply.sendPublicReply`, `BROADCAST_SEND` → `lib/services/broadcasts.sendBroadcastMessage`, `REFRESH_TOKEN` → `lib/meta/tokens.refreshChannelTokenIfNeeded`, `RECONCILE_COMMENTS` → `lib/automation/reconcile.reconcileChannel`, `SYNC_MEDIA` → `lib/services/channels.syncChannelMedia`.

### worker/index.ts
Loop: `releaseStaleJobs()` every minute; `processBatch(workerId, WORKER_BATCH_SIZE)` every `WORKER_POLL_INTERVAL_MS`; enqueue `RECONCILE_COMMENTS` per ACTIVE channel every `COMMENT_POLL_INTERVAL_MS`; enqueue `REFRESH_TOKEN` daily for channels expiring within 10 days. Graceful SIGTERM. Loads `.env` via `dotenv/config`.

### lib/automation/flow-types.ts
```ts
export type FlowNodeType = "trigger" | "send_message" | "ask_question" | "condition_follow" | "delay" | "add_tag" | "remove_tag" | "add_to_pipeline" | "move_stage" | "remove_from_pipeline";
export type AnswerValidation = "none" | "email" | "phone" | "number";
export type FlowNodeData =
  | { type: "trigger" }
  | { type: "send_message"; message: OutboundMessage }       // buttons[i] of type postback get payload `btn:${nodeId}:${i}` automatically
  | { type: "ask_question"; prompt: OutboundMessage; saveTo: string; validation?: AnswerValidation; retryPrompt?: string; maxRetries?: number }
    // prompt.quickReplies are suggested answers (payload `qr:${nodeId}:${i}`), NOT branches, only a "next" handle. saveTo: "name" → contact.name,
    // anything else ([a-z0-9_]{1,32}, presets "email"/"phone") → contact.customFields[saveTo]. maxRetries defaults to 2; retryPrompt defaults to DEFAULT_ASK_RETRY_PROMPT.
  | { type: "condition_follow"; retryPrompt?: string }        // yes/no handles
  | { type: "delay"; seconds: number }
  | { type: "add_tag"; tag: string } | { type: "remove_tag"; tag: string }
  | { type: "add_to_pipeline"; pipelineId: string; stageId: string }  // contacts already in the pipeline keep their stage
  | { type: "move_stage"; pipelineId: string; stageId: string }       // adds the contact to the pipeline first if needed
  | { type: "remove_from_pipeline"; pipelineId: string };
export type FlowNode = { id: string; type: FlowNodeType; position: { x: number; y: number }; data: FlowNodeData };
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string }; // handles: "next" (default), "yes"/"no" (condition), `btn:${i}` (message buttons)
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };
export const flowGraphSchema: z.ZodType<FlowGraph>;
export function emptyFlow(): FlowGraph;   // just the trigger: what "New automation" opens on
export function defaultFlow(): FlowGraph; // trigger → send_message("Thanks for commenting! Here's your link 👇" + 1 web_url button)
export function validateFlow(flow: FlowGraph): { ok: true } | { ok: false; errors: string[] }; // exactly one trigger, reachable nodes, no dangling button edges, message text ≤ 1000 bytes, ≤ 3 buttons
export function nextNodeId(flow: FlowGraph, fromNodeId: string, handle?: string): string | null;
export function renderTemplate(text: string, vars: Record<string, string | undefined>): string; // {{username}}, {{name}}, {{first_name}}, plus saved answers as {{<saveTo>}}
export const ASK_QUESTION_FIELDS: readonly { key: "name" | "email" | "phone"; label: string; validation: AnswerValidation; hint: string }[];
export function validateAnswer(text: string, validation?: AnswerValidation): string | number | null; // null = re-ask; email lower-cased, phone stripped to +digits (7–15), number → number
```
### lib/automation/engine.ts
```ts
export async function handleIncomingEvent(channel: Channel, event: NormalizedEvent): Promise<void>;
// comment  → find ACTIVE automations on channel with triggerType COMMENT matching mediaIds/keywords (lib/automation/matcher.ts) → for each: dedupe (DeliveryLog by automationId+commentExternalId; oncePerContact) → upsert Contact → create FlowSession(context {commentId, mediaId, text}) → enqueue EXECUTE_FLOW {sessionId, nodeId: firstAfterTrigger, viaPrivateReplyCommentId: commentId} dedupeKey `flow:${automationId}:${commentId}` → if publicReplyEnabled enqueue PUBLIC_REPLY (dedupeKey `pr:${automationId}:${commentId}`)
// message  → upsert Contact + Conversation (lastInboundAt=now) + Message (idempotent by externalId, skip echoes as OUTBOUND) → if an ACTIVE session has `context.awaiting = { nodeId, attempts }` with `currentNodeId === nodeId` (an ask_question waiting for its answer) → enqueue EXECUTE_FLOW {sessionId, nodeId, fromNodeId: nodeId, answer: {text, messageId}} (dedupeKey `flow:${sessionId}:${nodeId}:answer:${messageId}`) and STOP, the answer never reaches quick-reply routing or keyword triggers; else if a session sits on an ai_reply node (parked for a reply or writing one) → the same, with `answer.at` and `runAt` 4s later so a burst of messages gets one reply; else if a session is waiting on a message → resume via "next" handle; else match DM/STORY_REPLY automations by keyword → start session. A postback that resumes nothing goes to a session's ai_reply node the same way, as its button title.
// postback → payload `btn:${nodeId}:${i}` → find ACTIVE FlowSession for contact whose currentNodeId===nodeId → resume with handle `btn:${i}`; payload `follow_check:${nodeId}` → re-run condition node
export async function executeFlowStep(job: Job): Promise<void>;
// loads session+automation+channel+contact; walks nodes: send_message → checks plan quota (reserveDmQuota), rate limit (reserveSlot private_reply if viaPrivateReplyCommentId else send), 24h window (skip unless private reply), sends, writes Message(OUTBOUND) + DeliveryLog, increments automation.sentCount, then PAUSES (session.currentNodeId = this node), flows resume only on user interaction.
// ask_question → sends `prompt` (quick replies stamped `qr:${nodeId}:${i}`), then PAUSES with currentNodeId = node id and context.awaiting = { nodeId, attempts: 0 }. When the job carries `answer` for that node: validateAnswer → ok ⇒ save (name → contact.name, else customFields[saveTo]), add `{{saveTo}}` to context.vars, clear awaiting, continue via "next" synchronously; fail ⇒ attempts+1 ≤ maxRetries ? send retryPrompt (+ same quick replies) and stay parked : clear awaiting and continue via "next" without saving.
// condition_follow → getInstagramUserProfile → isFollower ? follow "yes" : follow "no" (typical "no" branch is a message with a postback button payload `follow_check:${nodeId}`; if no "no" edge, send retryPrompt with that button).
// ai_reply → the agent (resolveAgent) answers the whole conversation so far: stored messages oldest first (photos and story replies as short notes, the comment that started a comment session put back where it happened), cut to agent.historyLimit, messages in a row from one side merged into one turn, plus the step's `instruction` and what the contact already told us (custom fields). Sends the reply, then parks with awaiting { nodeId, attempts: replies used }. A turn for a message skips when a newer message has its own turn coming or an earlier reply already covered it (`context.aiAnsweredAt`), and waits while another reply is being written (`context.aiBusy`). Leaves via "next" on [[DONE]] or after maxTurns replies, via "handoff" on [[HANDOFF]] or a failed model call (the contact gets the fallback reply); an unwired "handoff" falls through to "next".
// delay → enqueue EXECUTE_FLOW runAt=now+seconds for next node. add_tag/remove_tag → update contact.tags, continue synchronously.
// add_to_pipeline/move_stage/remove_from_pipeline → lib/services/pipelines (setContactsStage / removeContactsFromPipeline) with source { automationId }, continue synchronously. A step whose pipeline or stage was deleted blocks activation.
// End of graph → session COMPLETED.
```
`lib/automation/matcher.ts`: `matchesKeywords(text, keywords, mode, exclude)`, `findMatchingAutomations(channelId, trigger: TriggerType, text, mediaId?)`.
`lib/automation/public-reply.ts`: `sendPublicReply(job)`, picks a random reply, calls platform replyToComment, logs DeliveryLog kind PUBLIC_REPLY.
`lib/automation/reconcile.ts`: `reconcileChannel(job)`, polling safety net: for each ACTIVE COMMENT automation on the channel, fetch recent comments on its media (or last 10 media if all), and feed unseen ones through `handleIncomingEvent` (dedupe makes this safe).

### lib/mcp/* and the OAuth services (the MCP server)
- `lib/services/oauth.ts`: the authorization server. `registerClient`, `getClient`, `authenticateClient`, `issueAuthorizationCode`, `exchangeAuthorizationCode`, `refreshAccessToken`, `revokeToken`, `revokeTokensFor`, `authenticateAccessToken`, `purgeExpiredOAuthRows` (cron tick), metadata builders, `mcpServerUrl()`. Client secrets, codes and tokens are stored as sha256 hashes. Access tokens are opaque (`aww_at_`, 1 hour), refresh tokens rotate (`aww_rt_`, 60 days); a replayed code or refresh token revokes every token of that person and app.
- `lib/services/mcp-access.ts`: grants (`OAuthGrant`: one person, one app, one organization, all workspaces or a list). `consentOptions`, `saveConsent`, `reachableWorkspaces` (resolved against current memberships on every request), `hasLiveGrant`. Tool access (`McpToolAccess`, one row per organization and tool): with no row a read-only tool (`readOnlyHint`) is open to every member and any other tool to owners only; a row opens the tool to everyone (`allMembers`, including people who join later) or to exactly `userIds`. Roles apply on top. `toolAccessFor`, `listToolAccess`, `setToolAccess`.
- `lib/mcp/server.ts`: `handleMcpRequest` authenticates the bearer token, rate-limits per person, resolves the reachable workspaces and builds an `McpServer` per request (`@modelcontextprotocol/sdk`, web-standard transport, JSON responses, no sessions). A 401 carries `WWW-Authenticate: Bearer resource_metadata=...`.
- `lib/mcp/tool.ts`: `workspaceTool` / `accountTool`. A workspace tool gets an optional `workspaceId` argument, a `minRole` matching its API route, and a `WorkspaceContext` built from the grant, then calls the same `lib/services/*` function the route calls and validates with the same schema. Errors go through `handleApiError`, so they read like the app's toasts.
- Tool access is enforced twice: `isToolVisible` keeps a tool out of `tools/list` unless some reachable workspace gives the caller its role and the owner has not turned it off for them, and every call checks `canUseTool` for the workspace it acts in (403 `TOOL_OFF`).
- `lib/mcp/tools/*`: the tools, one file per area (workspaces and team, accounts and automations, ai, inbox, contacts, crm for pipelines and segments, broadcasts and links, reports). `tools/index.ts` groups them (`MCP_TOOL_GROUPS`, with each section's tone) for Settings. `lib/mcp/flow.ts` is the flow format a model writes (optional positions and trigger, auto-layout) plus `AUTOMATION_GUIDE`, served by `get_automation_guide`.
- A new API route that people use from the UI gets a matching tool. Left out on purpose: connecting a Meta account (needs Meta's sign-in in a browser; `list_accounts` returns the link), checkout and plan changes, deleting or transferring an organization.

### lib/services/* (server-side data access; every function takes workspaceId first)
`channels.ts`, `automations.ts`, `contacts.ts`, `pipelines.ts` (pipelines, stages and contact moves; every move writes an AuditLog `contact.stage_changed` or `contact.pipeline_removed`), `segments.ts`, `inbox.ts`, `broadcasts.ts`, `analytics.ts`, `links.ts`, `logs.ts`, `workspaces.ts`, `onboarding.ts`, `ai.ts` (providers and agents; keys encrypted at rest and never serialised to the client), `templates/` (39 static flow templates: 26 Instagram, 13 Messenger, every one native to the platform it names, each tagged with a goal and a trigger for the gallery filters). Organization-level services take `organizationId` first: `organizations.ts` (create, switch, rename, delete, members, ownership, invitations), `billing.ts`, `usage-history.ts`. `audit.ts` exports `recordAudit`.

## 6. Meta rules the code must respect

- Private reply: one per comment, within 7 days, only to comments on the connected account's own media. Never to the account's own comments (`from.id === channel.externalId` → SKIPPED_SELF).
- 750 private replies / hour / account. Overflow: requeue with backoff up to 6 hours, then SKIPPED_RATE_LIMIT.
- After a private reply, further messages need the user to interact (button tap / reply) which opens a **24h window** (`Conversation.lastInboundAt`). Non-private-reply sends outside the window → SKIPPED_WINDOW (Inbox may use `HUMAN_AGENT` tag for human replies up to 7 days).
- Text ≤ 1000 bytes UTF-8. ≤ 3 buttons per message. Buttons: `web_url` or `postback`.
- Tokens: IG long-lived = 60 days, refresh when < 10 days left. FB page tokens from long-lived user tokens don't expire but can be invalidated → status TOKEN_EXPIRED on error 190.
- Webhook: verify `X-Hub-Signature-256` with `META_APP_SECRET` (Instagram Login webhooks are signed with `INSTAGRAM_APP_SECRET`, try both). Respond 200 fast; process inline but never throw; persist `WebhookEvent` first (dedupe).
- Disclose automation: the default first message template starts with a friendly line; the Inbox shows "Automated" badge on automation-sent messages.

## 7. Design system

The full reference is `docs/DESIGN.md`. In short:

- Tokens are in `app/globals.css` and `tailwind.config.ts`; named tones in `components/ui/tone.ts`. Ink on paper, fog surfaces, and the site's flat accents (yellow, magenta, purple, indigo, blue, green, orange, lavender, sky, sage), each with a solid, a `-soft` tint and an `-ink` text step. Never gradients.
- Colour carries meaning: each section has a tone (`components/app-shell/nav-config.ts`), Instagram is magenta and Facebook/Messenger blue (`components/ui/platform-badge.tsx`), statuses map to badge variants, and flow steps each have a colour.
- Type: Archivo 900 (`font-display`) for page titles and big numbers, Figtree for body, Geist Mono uppercase (`brand-label`) for eyebrows and table headers.
- Surfaces: white cards with hairline borders (`rounded-2xl`, no shadow), fog panels, and at most one filled colour block per page.
- Navigation: on desktop the dock (`components/app-shell/dock.tsx`), a floating column of section tiles in their colours. It rests as a thin column of colour dots at the left edge and opens when the pointer reaches the edge or something inside it takes focus, magnifying under the cursor. Holds the logo, `PRIMARY_NAV`, the workspace switcher, the usage ring and the account menu (which has Settings). Slots are laid out at their magnified size, so the dock grows around the icon under the pointer. Below `md` the same navigation is `components/app-shell/sidebar.tsx`, inside the drawer behind `topbar.tsx`. There is no persistent sidebar; pages get the full window.
- Buttons are pills: `default` ink, `highlight` yellow (the one growth action on a page), `secondary` fog, `outline`, `ghost`, `destructive`, `link`.
- Components in `components/ui`: button, input, textarea, label, card, badge, avatar, dialog, dropdown-menu, popover, select, switch, checkbox, tabs, tooltip, info-tip, separator, skeleton, table, scroll-area, sonner (Toaster), empty-state, page-header, stat, stepper, segmented, filter-menu, platform-badge, tone, kbd, spinner, copy-button, confirm-dialog.
- A set of mutually exclusive list filters with counts (inbox views, log, broadcast and automation statuses, contact segments, pipeline stages) is a `FilterMenu`: one icon button that names the active filter, not a row of chips.
- Every list page: header (section tile, title, tabs, primary action), filters, list, and an `EmptyState` in the section's tone.
- Words: plain, short, no em dashes, no filler, no explaining internal mechanics (see DESIGN.md, "Words").
- The DM preview (`components/automations/dm-preview.tsx`) is a phone drawn as Instagram or Messenger, rendering an `OutboundMessage`.

## 8. Environment variables (documented in `.env.example`)
`NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_API_VERSION`, optional `RESEND_API_KEY`, `EMAIL_FROM`.
The Google OAuth client lives in Google Cloud Console (APIs & Services → Credentials → Web application); its authorized redirect URI must be `<NEXT_PUBLIC_APP_URL>/auth/callback`.

## 9. File ownership (parallel build: stay inside your lane)

| Lane | Owns |
|---|---|
| foundation-auth | `lib/logger.ts`, `lib/auth/*`, `lib/workspace/*`, `lib/billing/*`, `lib/services/workspaces.ts`, `lib/services/organizations.ts`, `middleware.ts`, `app/auth/*`, `app/login/*`, `app/api/workspaces/*`, `app/api/organizations/*`, `app/organizations/*`, `app/(app)/onboarding/*`, `app/(app)/welcome/*`, `lib/onboarding/*`, `lib/services/onboarding.ts`, `app/invite/[token]/*`, `app/api/invitations/*` |
| foundation-meta | `lib/meta/*`, `lib/rate-limit.ts`, `lib/queue/*`, `lib/automation/*`, `worker/*`, `lib/webhooks/processor.ts`, `app/api/webhooks/meta/*`, `app/api/cron/*` |
| foundation-ui | `components/ui/*`, `components/app-shell/*`, `app/layout.tsx`, `app/(app)/layout.tsx`, `app/(marketing)/*`, `app/not-found.tsx`, `app/error.tsx`, `public/*` (logo svg, favicon), `components/marketing/*` |
| dashboard | `app/(app)/dashboard/*`, `components/dashboard/*`, `lib/services/analytics.ts`, `app/api/analytics/*` |
| channels | `app/(app)/channels/*`, `components/channels/*`, `lib/services/channels.ts`, `app/api/channels/*`, `app/api/meta/*`, `app/api/media/*` |
| automations | `app/(app)/automations/*`, `components/automations/*`, `lib/services/automations.ts`, `lib/services/templates/*`, `app/api/automations/*` |
| inbox | `app/(app)/inbox/*`, `components/inbox/*`, `lib/services/inbox.ts`, `app/api/inbox/*` |
| contacts | `app/(app)/contacts/*`, `components/contacts/*`, `components/pipelines/*`, `lib/services/contacts.ts`, `lib/services/pipelines.ts`, `lib/pipelines/*`, `app/api/contacts/*`, `app/api/pipelines/*` |
| broadcasts | `app/(app)/broadcasts/*`, `components/broadcasts/*`, `lib/services/broadcasts.ts`, `app/api/broadcasts/*` |
| settings | `app/(app)/settings/*`, `components/settings/*` |
| mcp | `lib/mcp/*`, `lib/oauth/*`, `lib/services/oauth.ts`, `lib/services/mcp-access.ts`, `app/mcp/*`, `app/oauth/*`, `app/.well-known/*`, `app/api/mcp/*`, `components/oauth/*` |
| links-logs | `app/l/[slug]/route.ts`, `app/(app)/links/*`, `app/(app)/logs/*`, `lib/services/links.ts`, `lib/services/logs.ts`, `app/api/links/*`, `app/api/logs/*` |
| docs | `README.md`, `docs/SETUP.md`, `docs/META_APP_REVIEW.md`, `.env.example` |

If you need something outside your lane that doesn't exist yet, write a minimal, clearly-named helper INSIDE your lane and note it in your report: do not edit another lane's files.
