"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { ArrowRight, ArrowUpRight, Check, Gauge, Layers, UserRound, X, type LucideIcon } from "lucide-react";

import { markTourSeenAction } from "@/app/(app)/(shell)/tour-actions";
import { GridLines, isDarkTone } from "@/components/layout/grid-block";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import { PlatformMark } from "@/components/ui/platform-badge";
import { TONES, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import { canManageChannels } from "@/lib/workspace/permissions";

import { navTourId, PRIMARY_NAV } from "./nav-config";
import { holdDockForTour, openConnectMenu, START_TOUR_EVENT } from "./tour-events";
import { workspaceTone } from "./workspace-switcher";

/**
 * The product tour: coach marks over the shell.
 *
 * No tour library. Steps anchor to elements tagged `data-tour="<id>"`: the
 * Connect button and the accounts bar on the dashboard, the dock, each of its
 * section tiles in order, its workspace, usage and account slots, and the
 * menu button that replaces the dock on a phone. A step whose anchor is not
 * on the page is skipped, and one whose anchor disappears mid-tour falls back
 * to a centred card, so the tour never points at nothing and never traps
 * anyone.
 *
 * It is built from the product's own pieces rather than a generic coach
 * mark. Each card leads with a band in the colour of what it points at (the
 * section's tile, Instagram and Messenger for Connect), the progress is the
 * dock's colours one by one, and on each tile's step the dock magnifies that
 * tile as the pointer would. Every step that has somewhere to go offers it
 * ("Connect now", "Open Inbox"), which ends the tour there.
 *
 * It runs on the dashboard, where the Connect button is: it opens by itself
 * the first time a person reaches the dashboard, and "Take the tour" in the
 * account menu brings them there and replays it. "Seen" is `User.tourVersion`
 * against `TOUR_VERSION` (lib/services/tour.ts), written the moment the tour
 * opens: a browser flag would open it again on every new device, and a new
 * version of the tour reaches everyone who saw the old one.
 */

type Placement = "top" | "bottom" | "left" | "right" | "center";

/** What leads a step's colour band: the section's own icon, or a mark that says more than one could. */
type StepArt = { kind: "icon"; icon: LucideIcon } | { kind: "platforms" } | { kind: "dock" } | { kind: "brand" };

/** Something to do about a step right away. It ends the tour. */
type StepAction = { label: string; href: string } | { label: string; connect: true };

type TourStep = {
  id: string;
  /** The `data-tour` value to point at; none for the closing card. */
  target?: string;
  /** Left out when this `data-tour` anchor is on the page, because a step pointing at it covers the same ground. */
  unless?: string;
  /** Where in the tour this is, in the band: "Start here", "Section 3 of 9". */
  chapter: string;
  title: string;
  body: string;
  /** The band's colour: the section's own, so the card matches the tile it points at. */
  tone: Tone;
  art: StepArt;
  action?: StepAction;
  placement: Placement;
  /**
   * The target is in the dock, which rests off screen. The tour opens the dock
   * and holds it open for as long as the step is up.
   */
  dock?: boolean;
  /** The dock magnifies the target, as the pointer would, while the step is up. */
  magnify?: boolean;
  /** Shown only to people who can connect accounts. */
  forChannelManagers?: boolean;
  /**
   * The spotlight's corner radius, so it runs parallel to the target's own
   * corners: a number, a pill, or a dock tile's (28% of its width), which
   * grows with the tile.
   */
  radius?: number | "pill" | "tile";
};

/** Where the tour runs: the Connect button and the accounts are only here. */
const TOUR_PATH = "/dashboard";

/**
 * What the tour says about each section, keyed by its path. Every tile in the
 * dock gets a step, in the dock's order, in its own colour; a section left out
 * of this map is left out of the tour.
 */
const SECTION_STEPS: Record<string, { title: string; body: string }> = {
  "/dashboard": {
    title: "Dashboard",
    body: "How your automations are doing, what needs your attention and your latest conversations. Your accounts are managed here too.",
  },
  "/analytics": {
    title: "Analytics",
    body: "DMs sent, automation runs, link clicks and new contacts over time, for each account and each automation.",
  },
  "/automations": {
    title: "Automations",
    body: "Pick what starts one (a comment, a DM or a story reply) and what it sends back: messages, buttons, a follow check or an AI reply.",
  },
  "/ai": {
    title: "AI replies",
    body: "Write the instructions once and the AI answers DMs in your words, with the built-in model or one you connect.",
  },
  "/inbox": {
    title: "Inbox",
    body: "Every Instagram and Messenger conversation in one place. Reply yourself whenever a person should take over.",
  },
  "/contacts": {
    title: "Contacts",
    body: "Everyone who has commented or messaged you, with tags, notes and pipeline stages.",
  },
  "/broadcasts": {
    title: "Broadcasts",
    body: "Send one message to everyone who wrote to you in the last 24 hours.",
  },
  "/links": {
    title: "Links",
    body: "Short links for your DMs that count every click, so you can see which messages send people on.",
  },
  "/logs": {
    title: "Logs",
    body: "Every message that went out or was held back, with the reason. Look here first when something did not send.",
  },
};

const SECTIONS = PRIMARY_NAV.filter((item) => SECTION_STEPS[item.href]);

const STEPS: readonly TourStep[] = [
  // First, what everything else depends on: an account to automate.
  {
    id: "connect",
    target: "connect",
    forChannelManagers: true,
    radius: "pill",
    chapter: "Start here",
    title: "Connect an account",
    body: "Connect an Instagram professional account or a Facebook Page. Comments, DMs and story replies on it can then start automations.",
    tone: "yellow",
    art: { kind: "platforms" },
    action: { label: "Connect now", connect: true },
    placement: "bottom",
  },
  // With both accounts connected there is no Connect button: the faces take its place.
  {
    id: "accounts",
    target: "accounts",
    unless: "connect",
    radius: "pill",
    chapter: "Start here",
    title: "Your accounts",
    body: "The Instagram account and Facebook Page this workspace automates. Click one to see its posts or reconnect it.",
    tone: "yellow",
    art: { kind: "platforms" },
    placement: "bottom",
  },
  {
    id: "sections",
    target: "dock",
    dock: true,
    radius: 28,
    chapter: "The dock",
    title: "Everything is one move away",
    body: "Move your pointer to the left edge of the screen and this dock opens. Each section keeps its colour. Here they are, one by one.",
    tone: "ink",
    art: { kind: "dock" },
    placement: "right",
  },
  // Below md there is no dock, so the menu button takes its place.
  {
    id: "sections-menu",
    target: "menu-button",
    radius: 18,
    chapter: "Your sections",
    title: "Everything is in the menu",
    body: "Open the menu to move between sections. Each one keeps its colour.",
    tone: "ink",
    art: { kind: "dock" },
    placement: "bottom",
  },
  ...SECTIONS.map((item, i): TourStep => {
    const copy = SECTION_STEPS[item.href];
    const id = navTourId(item);
    return {
      id,
      target: id,
      dock: true,
      magnify: true,
      radius: "tile",
      chapter: `Section ${i + 1} of ${SECTIONS.length}`,
      title: copy.title,
      body: copy.body,
      tone: item.tone,
      art: { kind: "icon", icon: item.icon },
      // The tour runs on the dashboard, so it has nowhere to open.
      action: item.href === TOUR_PATH ? undefined : { label: `Open ${item.label}`, href: item.href },
      placement: "right",
    };
  }),
  {
    id: "workspace",
    target: "workspace",
    dock: true,
    magnify: true,
    radius: "tile",
    chapter: "Your workspace",
    title: "Workspaces",
    body: "The workspace you are in. Each one has its own accounts, automations and contacts. Click it to switch to another.",
    tone: "indigo",
    art: { kind: "icon", icon: Layers },
    placement: "right",
  },
  {
    id: "usage",
    target: "usage",
    dock: true,
    magnify: true,
    radius: "tile",
    chapter: "Your plan",
    title: "DMs this month",
    body: "How much of this month's DMs your plan has used. Click it for the full breakdown and your plan's limits.",
    tone: "purple",
    art: { kind: "icon", icon: Gauge },
    action: { label: "See usage", href: "/usage" },
    placement: "right",
  },
  {
    id: "account",
    target: "account",
    dock: true,
    magnify: true,
    radius: "tile",
    chapter: "You",
    title: "Your account",
    body: "Settings, billing, your team and this tour are in your account menu.",
    tone: "fog",
    art: { kind: "icon", icon: UserRound },
    placement: "right",
  },
  {
    id: "done",
    chapter: "All set",
    title: "Now build your first automation",
    body: "Start from a template: pick a goal, and it is ready to switch on. You can take this tour again from your account menu.",
    tone: "yellow",
    art: { kind: "brand" },
    action: { label: "Browse templates", href: "/automations?templates=1" },
    placement: "center",
  },
];

/** First-render estimates only; the card is measured before it is shown. */
const PANEL_W = 360;
const PANEL_H = 200;
/** Card to target, and card to the edge of the window. */
const GAP = 14;
const MARGIN = 12;
/** How far the spotlight reaches past its target, and its ring past that. */
const SPOT_PAD = 6;
const RING = SPOT_PAD + 2;
/** The dimmer: ink at the strength of a dialog's overlay (`bg-ink/45`). */
const SCRIM = "0 0 0 9999px hsl(var(--brand-ink) / 0.45)";
/** The ring round the target, in the focus colour. */
const SPOT_RING = "0 0 0 2px hsl(var(--ring))";

const AUTO_OPEN_DELAY_MS = 700;
/**
 * The accounts bar renders on the client after the dashboard arrives. The tour
 * waits this long for it, so it does not start without its first step.
 */
const ANCHOR_WAIT_MS = 4000;
const ANCHOR_POLL_MS = 100;
/** The dock slides in over 300ms; the spotlight waits for it to land. */
const DOCK_SETTLE_MS = 340;
/** The card's exit, which the tour stays mounted to play. */
const EXIT_MS = 180;


/**
 * Query flags the accounts dialog and the connect follow-ups use. A page that
 * arrives with one is busy telling the person something, so the tour waits
 * for the next page.
 */
const BUSY_PARAMS = ["connected", "accounts", "error"] as const;

function hasBusyParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return BUSY_PARAMS.some((param) => params.has(param));
}

/**
 * Read as the page loads, because the accounts bar takes those flags out of
 * the URL as soon as it has acted on them, before the tour looks. Holds the
 * path they arrived on and is dropped once the person moves to another page.
 */
let busyOnLoad: string | null =
  typeof window !== "undefined" && hasBusyParams(window.location.search) ? window.location.pathname : null;

/** Another dialog, popover or menu is up (the accounts dialog after a connect, say). */
const OPEN_LAYER = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]';

/**
 * People marked seen in this page session. Guards against a second opening or
 * write when an effect runs again (strict mode, a navigation) before the
 * server's flag has reached a fresh render.
 */
const markedThisSession = new Set<string>();

/**
 * Records "seen" on the server. Fire and forget: the tour is already on
 * screen, and a failed write only means it opens once more.
 */
function markSeen(userId: string): void {
  if (markedThisSession.has(userId)) return;
  markedThisSession.add(userId);
  markTourSeenAction().catch(() => {
    // Nothing to do: the worst case is one more showing.
  });
}

type Box = { top: number; left: number; width: number; height: number };
type Size = { w: number; h: number };
type Point = { x: number; y: number };
/** What the spotlight and the card are showing: the step they were measured for, and its target. */
type Shown = { step: TourStep; rect: Box | null };

/** The element a step points at, if it is laid out with a size. */
function findTarget(id: string): HTMLElement | null {
  let el: HTMLElement | null = null;
  try {
    el = document.querySelector<HTMLElement>(`[data-tour="${id}"]`);
  } catch {
    return null;
  }
  // No client rects means display: none (the dock on a phone, the menu button on a desktop).
  if (!el || el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

/**
 * Laid out is not enough: the dock at rest has a box, just past the left edge
 * of the window. A target is usable only when its middle is inside the window.
 */
function isOnScreen(r: DOMRect): boolean {
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  return x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight;
}

/**
 * The steps that apply right now, for this person on this page. A dock step
 * only needs the dock to be laid out (md and up): the tour opens it itself,
 * and checks that the tile is on screen once it has.
 */
function usableSteps(role: WorkspaceRole): TourStep[] {
  const canConnect = canManageChannels(role);
  return STEPS.filter((step) => {
    if (step.forChannelManagers && !canConnect) return false;
    if (step.unless && findTarget(step.unless) !== null) return false;
    return !step.target || findTarget(step.target) !== null;
  });
}

/**
 * Calls `onReady` once the dashboard's accounts bar is in the document, or
 * after `ANCHOR_WAIT_MS` whatever is there. Returns a cancel.
 */
function whenAnchorsReady(onReady: () => void): () => void {
  const startedAt = Date.now();
  let timer = 0;
  const check = () => {
    if (document.querySelector('[data-tour="accounts"]') || Date.now() - startedAt >= ANCHOR_WAIT_MS) onReady();
    else timer = window.setTimeout(check, ANCHOR_POLL_MS);
  };
  check();
  return () => window.clearTimeout(timer);
}

function toBox(r: DOMRect): Box {
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Keeps Tab inside the card while the tour is modal. */
function trapTab(event: KeyboardEvent, card: HTMLElement | null): void {
  if (!card) return;
  const focusables = Array.from(card.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')).filter(
    (el) => !el.hasAttribute("disabled"),
  );
  if (focusables.length === 0) {
    event.preventDefault();
    card.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const focused = document.activeElement;
  if (event.shiftKey) {
    if (focused === first || focused === card || !card.contains(focused)) {
      event.preventDefault();
      last.focus();
    }
  } else if (focused === last || !card.contains(focused)) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * The window's size, read straight from it rather than mirrored into state,
 * so the first client render already places the card. The width leaves out a
 * classic scrollbar, which the fixed overlay does not cover either.
 */
function subscribeToResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useViewport(): Size {
  const w = React.useSyncExternalStore(
    subscribeToResize,
    () => document.documentElement.clientWidth,
    () => 0,
  );
  const h = React.useSyncExternalStore(
    subscribeToResize,
    () => window.innerHeight,
    () => 0,
  );
  return React.useMemo(() => ({ w, h }), [w, h]);
}

// ───────────────────────── Placement ─────────────────────────
//
// The card is placed with a numeric translate, so a step change is one
// animatable transform. It must never sit on the thing it points at and never
// leave the window, so each side is scored against the card's measured box:
// the first side that clears the target wins, and when none does (a target
// too big for any side) the one that covers it least.

const OPPOSITE: Record<Placement, Placement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
  center: "center",
};

/** The preferred side first, then its opposite, then the other two. */
function candidates(preferred: Placement): Placement[] {
  const primary: Placement[] = preferred === "center" ? [] : [preferred, OPPOSITE[preferred]];
  const rest = (["bottom", "top", "right", "left"] as const).filter((side) => !primary.includes(side));
  return [...primary, ...rest];
}

function rawPosition(rect: Box, placement: Placement, panel: Size): Point {
  switch (placement) {
    case "right":
      return { x: rect.left + rect.width + GAP, y: rect.top + rect.height / 2 - panel.h / 2 };
    case "left":
      return { x: rect.left - GAP - panel.w, y: rect.top + rect.height / 2 - panel.h / 2 };
    case "top":
      return { x: rect.left + rect.width / 2 - panel.w / 2, y: rect.top - GAP - panel.h };
    case "bottom":
    default:
      return { x: rect.left + rect.width / 2 - panel.w / 2, y: rect.top + rect.height + GAP };
  }
}

function clampToViewport(pos: Point, panel: Size, vw: number, vh: number): Point {
  return {
    x: Math.min(Math.max(MARGIN, pos.x), Math.max(MARGIN, vw - panel.w - MARGIN)),
    y: Math.min(Math.max(MARGIN, pos.y), Math.max(MARGIN, vh - panel.h - MARGIN)),
  };
}

/** How much two boxes overlap; 0 when they do not touch. */
function overlapArea(a: Box, b: Box): number {
  const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return x > 0 && y > 0 ? x * y : 0;
}

function centerPosition(panel: Size, vw: number, vh: number): Point {
  return { x: Math.max(MARGIN, (vw - panel.w) / 2), y: Math.max(MARGIN, (vh - panel.h) / 2) };
}

function computePosition(rect: Box, placement: Placement, panel: Size, vw: number, vh: number): Point {
  // The spotlight and its ring reach past the target: the card clears those too.
  const target: Box = {
    top: rect.top - RING,
    left: rect.left - RING,
    width: rect.width + RING * 2,
    height: rect.height + RING * 2,
  };

  let best: { pos: Point; overlap: number } | null = null;
  for (const side of candidates(placement)) {
    const pos = clampToViewport(rawPosition(rect, side, panel), panel, vw, vh);
    const overlap = overlapArea({ top: pos.y, left: pos.x, width: panel.w, height: panel.h }, target);
    if (overlap === 0) return pos;
    if (!best || overlap < best.overlap) best = { pos, overlap };
  }
  return best?.pos ?? centerPosition(panel, vw, vh);
}

// ───────────────────────── The tour ─────────────────────────

export interface ProductTourProps {
  userId: string;
  /** The current tour has been shown (`User.tourVersion`). Per person, not per browser. */
  hasSeenTour: boolean;
  /** The Connect step is only for people who can connect accounts. */
  role: WorkspaceRole;
  /** The active workspace, so the workspace step wears its tile's colour. */
  workspaceId: string;
}

export function ProductTour({ userId, hasSeenTour, role, workspaceId }: ProductTourProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const viewport = useViewport();
  const titleId = React.useId();
  const bodyId = React.useId();

  const [steps, setSteps] = React.useState<TourStep[] | null>(null);
  const [index, setIndex] = React.useState(0);
  // Counts openings, so the effects that set up an opening run again for a replay.
  const [run, setRun] = React.useState(0);
  const [closing, setClosing] = React.useState(false);
  // Positions snap while the tour opens and glide from then on (see below).
  const [glide, setGlide] = React.useState(false);
  const [shown, setShown] = React.useState<Shown | null>(null);
  // The card's own box, measured rather than assumed (see computePosition).
  const [panel, setPanel] = React.useState<Size>({ w: PANEL_W, h: PANEL_H });

  const cardRef = React.useRef<HTMLDivElement>(null);
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const returnFocus = React.useRef<HTMLElement | null>(null);

  const active = steps !== null;
  const current = steps ? (steps[index] ?? null) : null;

  const start = React.useCallback(
    (list: TourStep[]) => {
      setSteps(list);
      setIndex(0);
      setShown(null);
      setClosing(false);
      setGlide(false);
      setRun((n) => n + 1);
      // Seen as soon as it opens, so a reload halfway through does not start it again.
      if (!hasSeenTour) markSeen(userId);
    },
    [hasSeenTour, userId],
  );

  const finish = React.useCallback(() => {
    setSteps(null);
    setIndex(0);
    setShown(null);
    setClosing(false);
    setGlide(false);
  }, []);

  const close = React.useCallback(() => {
    if (!steps || closing) return;
    // Focus goes back to where it was before the tour, as the card starts to
    // leave. When that is inside the dock, the dock stays open around it.
    const previous = returnFocus.current;
    returnFocus.current = null;
    if (previous?.isConnected) previous.focus({ preventScroll: true });
    if (prefersReducedMotion()) finish();
    else setClosing(true);
  }, [steps, closing, finish]);

  const next = React.useCallback(() => {
    if (!steps || closing) return;
    if (index >= steps.length - 1) close();
    else setIndex(index + 1);
  }, [steps, index, closing, close]);

  const back = React.useCallback(() => {
    if (closing) return;
    setIndex((i) => Math.max(0, i - 1));
  }, [closing]);

  // A step's own action ends the tour and does the thing: opens the section, or the Connect menu.
  const act = React.useCallback(
    (action: StepAction) => {
      close();
      if ("href" in action) router.push(action.href);
      else window.setTimeout(openConnectMenu, prefersReducedMotion() ? 0 : EXIT_MS);
    },
    [close, router],
  );

  const toneOf = React.useCallback((step: TourStep): Tone => (step.id === "workspace" ? workspaceTone(workspaceId) : step.tone), [workspaceId]);

  // The exit plays, then the tour unmounts.
  React.useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finish, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, finish]);

  // "Take the tour" in the account menu. The tour lives on the dashboard, so
  // from any other page it goes there first and starts once it has arrived.
  const [replayRequested, setReplayRequested] = React.useState(false);
  React.useEffect(() => {
    const onStart = () => {
      setReplayRequested(true);
      if (window.location.pathname !== TOUR_PATH) router.push(TOUR_PATH);
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [router]);

  React.useEffect(() => {
    if (!replayRequested || pathname !== TOUR_PATH) return;
    return whenAnchorsReady(() => {
      setReplayRequested(false);
      start(usableSteps(role));
    });
  }, [replayRequested, pathname, role, start]);

  // Opens by itself once per person, the first time they reach the dashboard.
  // A busy visit (arrived from a connect, or a dialog is up) is passed over
  // without marking anything, and the next visit tries again.
  React.useEffect(() => {
    if (hasSeenTour || markedThisSession.has(userId) || pathname !== TOUR_PATH) return;
    if (busyOnLoad !== null && busyOnLoad !== pathname) busyOnLoad = null;
    if (busyOnLoad !== null || hasBusyParams(window.location.search)) return;
    let cancelWait: (() => void) | null = null;
    // A short wait, so the shell has painted and its anchors can be measured.
    const timer = window.setTimeout(() => {
      cancelWait = whenAnchorsReady(() => {
        if (markedThisSession.has(userId) || document.querySelector(OPEN_LAYER)) return;
        const list = usableSteps(role);
        // Only the closing card left means the page has not painted: wait for the next visit.
        if (!list.some((step) => step.target)) return;
        start(list);
      });
    }, AUTO_OPEN_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      cancelWait?.();
    };
  }, [pathname, hasSeenTour, userId, role, start]);

  // Focus moves into the card as the tour opens, onto its main button so Enter
  // moves the tour on. Whatever had focus gets it back when the tour closes.
  React.useEffect(() => {
    if (run === 0) return;
    const previous = document.activeElement;
    returnFocus.current = previous instanceof HTMLElement && previous !== document.body ? previous : null;
    const frame = window.requestAnimationFrame(() => (primaryRef.current ?? cardRef.current)?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [run]);

  // The card's first placement uses an estimated size and is corrected in the
  // same commit once the card is measured. That correction must not animate,
  // so the glide is switched on only after the first frame.
  React.useEffect(() => {
    if (run === 0) return;
    const frame = window.requestAnimationFrame(() => setGlide(true));
    return () => window.cancelAnimationFrame(frame);
  }, [run]);

  // Measure the card itself. offsetWidth and offsetHeight are layout values,
  // untouched by the transforms that place and animate it.
  React.useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w === 0 && h === 0) return;
      setPanel((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, current?.id]);

  // Hold the dock open while a step points into it, and let go on any other
  // step or on close. A layout effect declared before the measurement, so the
  // dock is asked to open before the tour first looks for the tile.
  const holdsDock = !closing && Boolean(current?.dock);
  React.useLayoutEffect(() => {
    if (!holdsDock) return;
    holdDockForTour(true);
    return () => holdDockForTour(false);
  }, [holdsDock]);

  // On a step about one tile, the dock magnifies it as the pointer would; the
  // measurement below follows the tile as it grows.
  const magnified = holdsDock && current?.magnify ? (current.target ?? null) : null;
  React.useLayoutEffect(() => {
    if (!holdsDock) return;
    holdDockForTour(true, magnified);
  }, [holdsDock, magnified]);

  // Measure the current target and keep the spotlight on it through scrolling,
  // resizing and anything else that moves it. A layout effect, so a step change
  // and its new position land in the same commit and the card is never painted
  // at a stale spot.
  React.useLayoutEffect(() => {
    if (!current || closing) return;
    const step = current;
    const target = step.target;
    if (!target) {
      setShown((prev) => (prev?.step === step && prev.rect === null ? prev : { step, rect: null }));
      return;
    }

    const record = (rect: Box | null) => setShown((prev) => (prev?.step === step && sameBox(prev.rect, rect) ? prev : { step, rect }));

    // A dock step whose tile is still off screen waits for the dock to slide
    // in. Nothing is recorded until then, so the spotlight and the card stay
    // where the last step put them and move once, onto the settled tile.
    const first = findTarget(target);
    let settling = Boolean(step.dock) && !(first && isOnScreen(first.getBoundingClientRect()));
    if (first && !step.dock) {
      const r = first.getBoundingClientRect();
      // Centred rather than nearest, so it does not come to rest under the phone's sticky header.
      if (r.top < 0 || r.bottom > window.innerHeight) first.scrollIntoView({ block: "center", inline: "nearest" });
    }

    const measure = () => {
      if (settling) return;
      const el = findTarget(target);
      const r = el?.getBoundingClientRect();
      // Gone or off screen: the card centres itself and stays dismissible.
      record(el && r && isOnScreen(r) ? toBox(r) : null);
    };
    const settle = () => {
      settling = false;
      measure();
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const settleTimer = settling ? window.setTimeout(settle, prefersReducedMotion() ? 0 : DOCK_SETTLE_MS) : undefined;
    // The dock's own transition ending is the moment it has landed; the timer
    // is there for when no transition runs. Any other transition may have
    // moved the target, so it measures again.
    const onTransitionEnd = (event: TransitionEvent) => {
      const el = settling ? findTarget(target) : null;
      if (el && event.target instanceof Node && event.target.contains(el)) settle();
      else measure();
    };
    const observer = new ResizeObserver(measure);
    if (first) observer.observe(first);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("transitionend", onTransitionEnd, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("transitionend", onTransitionEnd, true);
    };
  }, [current, closing]);

  // Esc skips, the arrows step, and Tab stays inside the card. Captured and
  // stopped at the window, so the page underneath (the builder's Escape, say)
  // does not act on the same key.
  React.useEffect(() => {
    if (!active || closing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (event.key === "ArrowRight") next();
        else back();
      } else if (event.key === "Tab") {
        event.stopPropagation();
        trapTab(event, cardRef.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, closing, next, back, close]);

  // What the spotlight and the card show. Deliberately not matched against the
  // current step's id: the render after a step change runs before the layout
  // effect has measured the new target, and holding the previous geometry for
  // that one unpainted commit is what makes each step change a single glide.
  // It is also what holds everything still while the dock slides in.
  const rect = current?.target ? (shown?.rect ?? null) : null;
  const shownStep = current?.target ? (shown?.step ?? current) : current;
  const ready = viewport.w > 0 && viewport.h > 0;
  const position =
    !current || !ready
      ? null
      : rect
        ? computePosition(rect, shownStep?.placement ?? "bottom", panel, viewport.w, viewport.h)
        : centerPosition(panel, viewport.w, viewport.h);

  if (!steps || !current) return null;

  // With nothing to point at, the spotlight collapses to a point in the middle
  // of the window, so the same element keeps painting the dimmer.
  const spot = rect
    ? { top: rect.top - SPOT_PAD, left: rect.left - SPOT_PAD, width: rect.width + SPOT_PAD * 2, height: rect.height + SPOT_PAD * 2 }
    : { top: viewport.h / 2, left: viewport.w / 2, width: 0, height: 0 };
  const shape = shownStep?.radius;
  // A dock tile's corners are 28% of its width, so the spotlight's grow with it.
  const radius = !rect ? 0 : shape === "pill" ? spot.height / 2 : shape === "tile" ? rect.width * 0.28 + SPOT_PAD : (shape ?? 16);

  const isLast = index === steps.length - 1;
  const tone = toneOf(current);
  const dark = isDarkTone(tone);
  const action = current.action;

  return (
    <div
      aria-hidden={closing || undefined}
      className={cn(
        // The animation length is written as a property: a bracketed duration utility is ambiguous between transitions and animations.
        "fixed inset-0 z-[100] ease-soft [animation-duration:180ms] motion-reduce:animate-none",
        closing ? "pointer-events-none animate-out fade-out-0 fill-mode-forwards" : "animate-in fade-in-0",
      )}
    >
      {/* Swallows clicks on the app while the tour is up. */}
      <div aria-hidden className="absolute inset-0" />

      {/* The dimmer and the spotlight are one element that is never swapped
          for another. Its geometry is always a real box and the dimmer is
          always the same 9999px spread, so nothing has to be re-established
          between steps; a step with no target shrinks the box to a point.
          The ring is part of the same shadow list, since a ring utility would
          be box-shadow too and this inline style would overwrite it. Only the
          geometry transitions: animating the shadow would repaint the whole
          window every frame. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute",
          glide && "transition-[top,left,width,height,border-radius] duration-300 ease-soft motion-reduce:transition-none",
        )}
        style={{
          top: spot.top,
          left: spot.left,
          width: spot.width,
          height: spot.height,
          borderRadius: radius,
          boxShadow: rect ? `${SPOT_RING}, ${SCRIM}` : SCRIM,
        }}
      />
      {/* A slow pulse round the target, so the eye finds it; a separate
          element, since only its own small shadow animates. Restarts on each step. */}
      {rect ? (
        <div
          key={shownStep?.id}
          aria-hidden
          className={cn(
            "pointer-events-none absolute animate-ring-pulse motion-reduce:hidden",
            glide && "transition-[top,left,width,height,border-radius] duration-300 ease-soft motion-reduce:transition-none",
          )}
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, borderRadius: radius }}
        />
      ) : null}

      {/* The card. Placed with a transform rather than top and left, so moving
          between steps is one composited transition. */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-state={closing ? "closed" : "open"}
        tabIndex={-1}
        className={cn(
          "absolute left-0 top-0 w-[360px] max-w-[calc(100vw-24px)] outline-none will-change-transform",
          glide && "transition-transform duration-300 ease-soft motion-reduce:transition-none",
          !position && "pointer-events-none opacity-0",
        )}
        style={{ transform: `translate3d(${position?.x ?? 0}px, ${position?.y ?? 0}px, 0)` }}
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-pop ease-soft [animation-duration:180ms] motion-reduce:animate-none",
            closing ? "animate-out zoom-out-[0.96] fill-mode-forwards" : "animate-in zoom-in-[0.96]",
          )}
        >
          <p aria-live="polite" className="sr-only">
            Step {index + 1} of {steps.length}: {current.title}. {current.body}
          </p>

          {/* The band: the colour of the tile or section it points at, as a
              flat block with the site's grid, like every other coloured block. */}
          <div
            className={cn(
              "relative isolate flex items-center gap-3 px-4 py-3 transition-colors duration-300 ease-soft motion-reduce:transition-none",
              TONES[tone].solid,
            )}
          >
            <GridLines tone={tone} size="18px" />
            <StepMark key={current.id} art={current.art} />
            <span className="brand-label min-w-0 flex-1 truncate">{current.chapter}</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close tour"
              className={cn(
                "-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                dark ? "hover:bg-white/15" : "hover:bg-ink/10",
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 pb-4 pt-4">
            <h2 id={titleId} className="font-display text-balance text-[21px] leading-[1.08]">
              {current.title}
            </h2>
            <p id={bodyId} className="mt-2 text-pretty text-[14px] leading-relaxed text-muted-foreground">
              {current.body}
            </p>

            {/* Progress in the colours of the steps themselves: the dock's colours, one by one. */}
            <div className="mt-4 flex items-center gap-2">
              <div aria-hidden className="flex min-w-0 flex-1 items-center gap-[3px]">
                {steps.map((step, i) => {
                  const stepTone = toneOf(step);
                  return (
                    <span
                      key={step.id}
                      className={cn(
                        "h-1.5 shrink-0 rounded-full transition-[width,opacity] duration-300 ease-soft motion-reduce:transition-none",
                        i === index ? "w-5" : "w-1.5",
                        i > index ? "bg-ink/15" : TONES[stepTone].dot,
                        i <= index && (stepTone === "yellow" || stepTone === "fog") && "ring-1 ring-inset ring-ink/15",
                      )}
                    />
                  );
                })}
              </div>
              <span className="brand-label shrink-0 tabular-nums text-muted-foreground">
                {index + 1}/{steps.length}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-1.5 border-t pt-3.5">
              {action ? (
                <button
                  type="button"
                  onClick={() => act(action)}
                  className="-ml-1 inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-1 text-[13px] font-semibold text-ink underline-offset-4 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate">{action.label}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              ) : null}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {index > 0 ? (
                  <Button size="sm" variant="ghost" onClick={back}>
                    Back
                  </Button>
                ) : null}
                <Button ref={primaryRef} size="sm" onClick={next}>
                  {isLast ? (
                    <>
                      <Check />
                      Done
                    </>
                  ) : (
                    <>
                      {index === 0 ? "Show me around" : "Next"}
                      <ArrowRight />
                    </>
                  )}
                </Button>
              </div>
            </div>

            {index === 0 ? (
              <button
                type="button"
                onClick={close}
                className="mx-auto mt-2 block rounded-full px-2 py-0.5 text-[12px] font-medium text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Skip tour
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The mark at the start of a step's band. */
function StepMark({ art }: { art: StepArt }) {
  const tile = "flex h-9 shrink-0 items-center justify-center rounded-xl bg-background text-ink shadow-[0_1px_2px_rgb(15_15_15/0.12)] animate-pop motion-reduce:animate-none";
  if (art.kind === "platforms") {
    return (
      <span aria-hidden className="flex shrink-0 animate-pop items-center motion-reduce:animate-none">
        <PlatformMark platform="INSTAGRAM" size={30} className="rounded-[10px] ring-2 ring-background" />
        <PlatformMark platform="FACEBOOK" size={30} className="-ml-2 rounded-[10px] ring-2 ring-background" />
      </span>
    );
  }
  if (art.kind === "dock") {
    return (
      <span aria-hidden className={cn(tile, "gap-[3px] px-2.5")}>
        {PRIMARY_NAV.map((item) => (
          <span key={item.href} className={cn("h-4 w-1.5 rounded-full", TONES[item.tone].dot, item.tone === "yellow" && "ring-1 ring-inset ring-ink/15")} />
        ))}
      </span>
    );
  }
  if (art.kind === "brand") {
    return (
      <span aria-hidden className={cn(tile, "w-9 bg-ink text-white")}>
        <LogoMark size={18} className="text-white" />
      </span>
    );
  }
  const Icon = art.icon;
  return (
    <span aria-hidden className={cn(tile, "w-9")}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
    </span>
  );
}
