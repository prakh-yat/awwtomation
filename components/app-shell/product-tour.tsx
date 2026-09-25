"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { ArrowRight, Check, X } from "lucide-react";

import { markTourSeenAction } from "@/app/(app)/tour-actions";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { canManageChannels } from "@/lib/workspace/permissions";

import { holdDockForTour, START_TOUR_EVENT } from "./tour-events";

/**
 * The product tour: coach marks over the shell.
 *
 * No tour library. Steps anchor to elements tagged `data-tour="<id>"`: the
 * dock, its section tiles and its account slot, the menu button that replaces
 * the dock on a phone, and the accounts bar on the dashboard. A step whose
 * anchor is not on the page is skipped, and one whose anchor disappears
 * mid-tour falls back to a centred card, so the tour never points at nothing
 * and never traps anyone.
 *
 * It opens by itself once per person, on whichever page they land, and replays
 * from "Take the tour" in the account menu. "Seen" is `User.tourCompletedAt`,
 * written the moment the tour opens: a browser flag would open it again on
 * every new device.
 */

type Placement = "top" | "bottom" | "left" | "right" | "center";

type TourStep = {
  id: string;
  /** The `data-tour` value to point at; none for the two centred steps. */
  target?: string;
  title: string;
  body: string;
  placement: Placement;
  /**
   * The target is in the dock, which rests off screen. The tour opens the dock
   * and holds it open for as long as the step is up.
   */
  dock?: boolean;
  /** Shown only to people who can connect accounts. */
  forChannelManagers?: boolean;
  /** The spotlight's corner radius, so it runs parallel to the target's own corners. */
  radius?: number | "pill";
};

const STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    title: `Welcome to ${brand.name}`,
    body: "Here is where everything is. It takes a minute, and you can skip it at any time.",
    placement: "center",
  },
  {
    id: "sections",
    target: "dock",
    dock: true,
    radius: 28,
    title: "Your sections",
    body: "Move your pointer to the left edge of the screen and the dock opens. Each section has its own colour.",
    placement: "right",
  },
  // Below md there is no dock, so the menu button takes its place.
  {
    id: "sections-menu",
    target: "menu-button",
    radius: 18,
    title: "Your sections",
    body: "Open the menu to move between sections.",
    placement: "bottom",
  },
  {
    id: "accounts",
    target: "accounts",
    forChannelManagers: true,
    radius: "pill",
    title: "Connect an account",
    body: "Connect an Instagram professional account or a Facebook Page. Comments, DMs and story replies on it can then start automations.",
    placement: "bottom",
  },
  {
    id: "automations",
    target: "nav-automations",
    dock: true,
    radius: 20,
    title: "Automations",
    body: "Pick what starts one (a comment, a DM or a story reply) and what it sends back: messages, buttons, a follow check or an AI reply.",
    placement: "right",
  },
  {
    id: "inbox",
    target: "nav-inbox",
    dock: true,
    radius: 20,
    title: "Inbox",
    body: "Every Instagram and Messenger conversation in one place. Reply yourself whenever a person should take over.",
    placement: "right",
  },
  {
    id: "contacts",
    target: "nav-contacts",
    dock: true,
    radius: 20,
    title: "Contacts",
    body: "Everyone who has commented or messaged you, with tags, notes and pipeline stages.",
    placement: "right",
  },
  {
    id: "ai",
    target: "nav-ai",
    dock: true,
    radius: 20,
    title: "AI replies",
    body: "Write the instructions once and the AI answers DMs in your words. It works without an API key, and you can connect your own model later.",
    placement: "right",
  },
  {
    id: "broadcasts",
    target: "nav-broadcasts",
    dock: true,
    radius: 20,
    title: "Broadcasts",
    body: "Send one message to everyone who wrote to you in the last 24 hours.",
    placement: "right",
  },
  {
    id: "logs",
    target: "nav-logs",
    dock: true,
    radius: 20,
    title: "Logs",
    body: "Every message that went out or was held back, with the reason. Look here first when something did not send.",
    placement: "right",
  },
  {
    id: "account",
    target: "account",
    dock: true,
    radius: 20,
    title: "Your account",
    body: "Settings, billing, your team and this tour are in your account menu.",
    placement: "right",
  },
  {
    id: "done",
    title: "That's the tour",
    body: "Connect an account, then start from a template on the Automations page. You can take this tour again from your account menu.",
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
/** The dock slides in over 300ms; the spotlight waits for it to land. */
const DOCK_SETTLE_MS = 340;
/** The card's exit, which the tour stays mounted to play. */
const EXIT_MS = 180;

/**
 * Below this many steps an automatic opening is not worth spending the
 * person's one first-run tour on: only the two centred steps are left, which
 * means the shell has not painted its anchors yet. It waits for the next page
 * without marking anything. A replay from the menu runs with whatever is
 * there. Three is the phone tour at its shortest: welcome, menu, finish.
 */
const MIN_AUTO_OPEN_STEPS = 3;

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
    return !step.target || findTarget(step.target) !== null;
  });
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
  /** `User.tourCompletedAt` is set. Per person, not per browser. */
  hasSeenTour: boolean;
  /** The Connect step is only for people who can connect accounts. */
  role: WorkspaceRole;
}

export function ProductTour({ userId, hasSeenTour, role }: ProductTourProps) {
  const pathname = usePathname() ?? "";
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

  // The exit plays, then the tour unmounts.
  React.useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finish, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing, finish]);

  // "Take the tour" in the account menu. A replay runs with whatever is on the page.
  React.useEffect(() => {
    const onStart = () => start(usableSteps(role));
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [role, start]);

  // Opens by itself once per person, on whichever page they land: an invited
  // member rarely starts on the dashboard, and the shell's steps are on every
  // page. A busy page (arrived from a connect, or a dialog is up) is passed
  // over without marking anything, and the next page tries again.
  React.useEffect(() => {
    if (hasSeenTour || markedThisSession.has(userId)) return;
    if (busyOnLoad !== null && busyOnLoad !== pathname) busyOnLoad = null;
    if (busyOnLoad !== null || hasBusyParams(window.location.search)) return;
    // A short wait, so the shell has painted and its anchors can be measured.
    const timer = window.setTimeout(() => {
      if (markedThisSession.has(userId) || document.querySelector(OPEN_LAYER)) return;
      const list = usableSteps(role);
      if (list.length < MIN_AUTO_OPEN_STEPS) return;
      start(list);
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
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
  const radius = !rect ? 0 : shownStep?.radius === "pill" ? spot.height / 2 : (shownStep?.radius ?? 16);

  const isLast = index === steps.length - 1;
  const isWelcome = current.id === "welcome";
  // The welcome and the finish point at nothing: centred, led by the brand mark.
  const branded = !current.target;

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
          "absolute left-0 top-0 max-w-[calc(100vw-24px)] outline-none will-change-transform",
          branded ? "w-[380px]" : "w-[360px]",
          glide && "transition-transform duration-300 ease-soft motion-reduce:transition-none",
          !position && "pointer-events-none opacity-0",
        )}
        style={{ transform: `translate3d(${position?.x ?? 0}px, ${position?.y ?? 0}px, 0)` }}
      >
        <div
          className={cn(
            "relative rounded-3xl border bg-card text-card-foreground shadow-pop ease-soft [animation-duration:180ms] motion-reduce:animate-none",
            branded ? "p-6" : "p-5",
            closing ? "animate-out zoom-out-[0.96] fill-mode-forwards" : "animate-in zoom-in-[0.96]",
          )}
        >
          <p aria-live="polite" className="sr-only">
            Step {index + 1} of {steps.length}: {current.title}. {current.body}
          </p>

          <button
            type="button"
            onClick={close}
            aria-label="Close tour"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-fog hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>

          {branded ? (
            <div className="flex flex-col items-center pt-2 text-center">
              <LogoMark size={44} />
              <h2 id={titleId} className="font-display mt-4 text-balance text-[24px] leading-[1.05]">
                {current.title}
              </h2>
              <p id={bodyId} className="mt-2.5 text-pretty text-[14px] leading-relaxed text-muted-foreground">
                {current.body}
              </p>
            </div>
          ) : (
            <>
              <h2 id={titleId} className="font-display pr-9 text-[20px] leading-[1.1]">
                {current.title}
              </h2>
              <p id={bodyId} className="mt-2 text-pretty text-[14px] leading-relaxed text-muted-foreground">
                {current.body}
              </p>
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-4">
            {/* Dots for the shape of it, the count for precision. */}
            <div className="flex items-center gap-2">
              <div aria-hidden className="flex items-center gap-[3px]">
                {steps.map((step, i) => (
                  <span
                    key={step.id}
                    className={cn(
                      "h-1.5 rounded-full transition-[width,background-color] duration-200 ease-soft motion-reduce:transition-none",
                      i === index ? "w-3 bg-ink" : i < index ? "w-1.5 bg-ink/40" : "w-1.5 bg-ink/15",
                    )}
                  />
                ))}
              </div>
              <span className="brand-label tabular-nums text-muted-foreground">
                {index + 1}/{steps.length}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
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
                    {isWelcome ? "Start tour" : "Next"}
                    <ArrowRight />
                  </>
                )}
              </Button>
            </div>
          </div>

          {isLast ? null : (
            <button
              type="button"
              onClick={close}
              className="mx-auto mt-3 block rounded-full px-2 py-0.5 text-[12px] font-medium text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
