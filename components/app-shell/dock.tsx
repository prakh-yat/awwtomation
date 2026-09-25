"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/ui/logo";
import { TONES } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

import { isActivePath, navTourId, PRIMARY_NAV } from "./nav-config";
import { TOUR_DOCK_EVENT, type TourDockDetail } from "./tour-events";
import type { ShellProps } from "./types";
import { UsageMeter } from "./usage-meter";
import { UserMenu } from "./user-menu";
import { WorkspaceCard, WorkspaceSwitcher } from "./workspace-switcher";

// ───────────────────────── Geometry ─────────────────────────
//
// Every slot is laid out at its magnified size, so the dock itself grows
// around the icons instead of letting them spill over its edges. Scales come
// from the pointer's distance to each slot's resting centre, which never
// moves, so the magnification can't feed back into itself. The layout is then
// shifted so the point under the pointer stays under the pointer.
//
// Everything below is in dock units; on a short window the whole dock is
// scaled down by `fit`, and viewport pixels are units times `fit`.

/** Resting size of one dock slot. */
const SLOT = 50;
/** The brand mark at the top: smaller than a slot, and it never magnifies. */
const BRAND = 34;
/** Space between slots. */
const GAP = 5;
/** Height a divider occupies, its own spacing included. */
const DIVIDER = 13;
/** Padding inside the dock, on every side. */
const PAD = 10;
/** Size of the slot under the pointer, relative to its resting size. */
const MAX_SCALE = 2;
/** How far the pointer's influence reaches: the icon under it and about two either side. */
const RADIUS = 130;
/** Below this the label bubble would crowd the icon, so it is not drawn. */
const LABEL_SCALE = 1.3;
/** Space kept between the dock and the top and bottom of the window. */
const EDGE = 12;

type Slot =
  | { kind: "divider"; key: string }
  | {
      kind: "item";
      key: string;
      label: string;
      node: React.ReactNode;
      /** Decorative: does not magnify and gets no label bubble. */
      fixed?: boolean;
      /** The product tour's anchor on this slot. */
      tour?: string;
    };

/** Smooth falloff: MAX_SCALE under the pointer, easing back to 1 at RADIUS. */
function scaleFor(distance: number): number {
  if (distance >= RADIUS) return 1;
  return 1 + (MAX_SCALE - 1) * Math.cos((distance / RADIUS) * (Math.PI / 2));
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useWindowHeight(): number {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return height;
}

/** A slot's size at rest: dividers are drawn in their own spacing, the brand mark is smaller. */
function restSize(slot: Slot): number {
  if (slot.kind === "divider") return 0;
  return slot.fixed ? BRAND : SLOT;
}

/** Slot offsets for a given set of sizes: where each slot starts, and the total length. */
function layout(slots: readonly Slot[], sizes: readonly number[]) {
  const starts: number[] = [];
  let y = PAD;
  slots.forEach((slot, i) => {
    starts.push(y);
    y += slot.kind === "divider" ? DIVIDER : sizes[i] + GAP;
  });
  return { starts, length: y - GAP + PAD };
}

/**
 * The shift that keeps the point `p` (resting units) where it is after the
 * slots grow: `p` sits a fraction of the way through some slot or gap, and
 * that same fraction of the magnified slot is lined up with it.
 */
function anchorShift(slots: readonly Slot[], rest: number[], grown: number[], sizes: readonly number[], p: number): number {
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const restLength = slot.kind === "divider" ? DIVIDER : restSize(slot);
    const grownSize = slot.kind === "divider" ? DIVIDER : sizes[i];
    const restEnd = rest[i] + restLength;
    if (p < rest[i]) return rest[i] - grown[i];
    if (p <= restEnd) {
      const f = restLength > 0 ? (p - rest[i]) / restLength : 0;
      return rest[i] + f * restLength - (grown[i] + f * grownSize);
    }
    // In the gap after this slot: gaps keep their size, so line up its start.
    if (slot.kind === "item" && p < restEnd + GAP) return restEnd - (grown[i] + grownSize);
  }
  const last = slots.length - 1;
  return last >= 0 ? rest[last] - grown[last] : 0;
}

/**
 * The dock.
 *
 * It stays off screen until the pointer reaches the left edge of the window,
 * then slides in. Keyboard users get the same thing from focus, and the whole
 * strip is skippable, so nothing here is hover-only in the accessibility sense.
 */
export function Dock(props: ShellProps) {
  const { user, organization, organizationCount, workspaces, activeWorkspaceId, role, usage } = props;
  const pathname = usePathname() ?? "";
  const reducedMotion = usePrefersReducedMotion();
  const windowHeight = useWindowHeight();

  const [open, setOpen] = React.useState(false);
  const [pointerY, setPointerY] = React.useState<number | null>(null);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  // The product tour is pointing at something in here.
  const [tourOpen, setTourOpen] = React.useState(false);

  const dockRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = React.useRef(false);

  // A menu, the workspace panel or a tour step has to outlive the pointer
  // leaving the dock. The tour's click-blocker covers the dock, so to the dock
  // the pointer has always left.
  const pinned = switcherOpen || menuOpen || tourOpen;
  const pinnedRef = React.useRef(pinned);
  React.useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const show = React.useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const hide = React.useCallback(() => {
    cancelClose();
    // A short grace period: crossing the gap between the edge and the dock, or
    // clipping a corner on the way to an icon, should not dismiss it.
    closeTimer.current = setTimeout(() => {
      if (pinnedRef.current || hovering.current) return;
      setOpen(false);
      setPointerY(null);
    }, 180);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  // The left edge wakes the dock. Watched on the window rather than with a strip
  // of its own, so nothing sits over the page and swallows clicks there.
  React.useEffect(() => {
    if (open) return;
    let frame = 0;
    const onMove = (event: MouseEvent) => {
      if (event.clientX > 10 || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (window.matchMedia("(min-width: 768px)").matches) show();
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [open, show]);

  // Opening a menu keeps the dock out; closing it lets the dock go if the
  // pointer has moved on and focus is not inside it (a tour that ends hands
  // focus back to the account button it was started from).
  React.useEffect(() => {
    if (pinned) show();
    else if (!hovering.current && !dockRef.current?.contains(document.activeElement)) hide();
  }, [pinned, show, hide]);

  // The product tour opens the dock for the steps that point into it and lets
  // go after them. It holds the dock at rest, without magnification, so every
  // tile stays where the tour measured it.
  React.useEffect(() => {
    const onTourDock = (event: CustomEvent<TourDockDetail>) => {
      const hold = event.detail.open;
      setTourOpen(hold);
      if (hold) {
        setPointerY(null);
        show();
      }
    };
    window.addEventListener(TOUR_DOCK_EVENT, onTourDock);
    return () => window.removeEventListener(TOUR_DOCK_EVENT, onTourDock);
  }, [show]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pinnedRef.current) {
        setOpen(false);
        setPointerY(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Built once per navigation, not per frame: the pointer only changes sizes,
  // so every slot's content keeps its identity and React skips it.
  const slots = React.useMemo<Slot[]>(() => {
    const list: Slot[] = [
      {
        // The mark, not a link: the dock is for navigating, and a logo that
        // silently means "dashboard" is a guess the Dashboard tile already covers.
        kind: "item",
        key: "brand",
        label: "",
        fixed: true,
        node: (
          <span aria-hidden className="flex h-full w-full items-center justify-center rounded-[30%] bg-ink text-white">
            <LogoMark size={18} className="text-white" />
          </span>
        ),
      },
      { kind: "divider", key: "divider-nav" },
    ];

    // Every section keeps its colour, like the icons in a real dock; the one
    // you are on gets the dot on the screen side, where a dock puts it.
    for (const item of PRIMARY_NAV) {
      const active = isActivePath(pathname, item.href);
      const Icon = item.icon;
      list.push({
        kind: "item",
        key: item.href,
        label: item.label,
        tour: navTourId(item),
        node: (
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-full w-full items-center justify-center rounded-[28%] outline-none transition-[filter] duration-200",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "shadow-[inset_0_-2px_0_rgb(15_15_15/0.08)] hover:brightness-[1.04]",
              TONES[item.tone].solid,
            )}
          >
            <Icon className="h-[40cqw] w-[40cqw]" strokeWidth={2} />
            {active ? <span aria-hidden className="absolute -left-[8px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink" /> : null}
          </Link>
        ),
      });
    }

    const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
    list.push({ kind: "divider", key: "divider-account" });
    list.push({
      kind: "item",
      key: "workspace",
      label: workspace?.name ?? "Workspace",
      node: <WorkspaceCard organizationName={organization.name} workspace={workspace} collapsed onOpen={() => setSwitcherOpen(true)} />,
    });
    list.push({
      kind: "item",
      key: "usage",
      label: "DMs this month",
      node: <UsageMeter usage={usage} collapsed />,
    });
    list.push({
      kind: "item",
      key: "account",
      label: user.name?.trim() || user.email,
      tour: "account",
      node: (
        <UserMenu
          user={user}
          organization={organization}
          canSwitchOrganization={organizationCount > 1}
          collapsed
          side="right"
          onOpenChange={setMenuOpen}
        />
      ),
    });

    return list;
  }, [pathname, workspaces, activeWorkspaceId, organization, organizationCount, usage, user]);

  // The resting layout, and the most it can grow: the dock is fitted to the
  // window at its largest, so it never runs off the top or bottom.
  const rest = React.useMemo(() => {
    const sizes = slots.map(restSize);
    const { starts, length } = layout(slots, sizes);
    let peak = 0;
    slots.forEach((slot, i) => {
      if (slot.kind !== "item" || slot.fixed) return;
      const centre = starts[i] + SLOT / 2;
      let growth = 0;
      slots.forEach((other, j) => {
        if (other.kind === "item" && !other.fixed) growth += SLOT * (scaleFor(Math.abs(starts[j] + SLOT / 2 - centre)) - 1);
      });
      peak = Math.max(peak, growth);
    });
    return { starts, length, peak };
  }, [slots]);

  const fit = windowHeight > 0 ? Math.min(1, Math.max(0.55, (windowHeight - EDGE * 2) / (rest.length + (reducedMotion ? 0 : rest.peak)))) : 1;
  const restTop = windowHeight > 0 ? (windowHeight - rest.length * fit) / 2 : 0;

  const frame = React.useMemo(() => {
    const scales = slots.map(() => 1);
    let focus = -1;
    if (pointerY !== null && !reducedMotion) {
      const p = (pointerY - restTop) / fit;
      let best = LABEL_SCALE;
      slots.forEach((slot, i) => {
        if (slot.kind !== "item" || slot.fixed) return;
        const scale = scaleFor(Math.abs(p - (rest.starts[i] + SLOT / 2)));
        scales[i] = scale;
        if (scale > best) {
          best = scale;
          focus = i;
        }
      });
    }
    const sizes = slots.map((slot, i) => restSize(slot) * scales[i]);
    const { starts, length } = layout(slots, sizes);
    const shift = pointerY === null || reducedMotion ? 0 : anchorShift(slots, rest.starts, starts, sizes, (pointerY - restTop) / fit);
    const width = Math.max(...sizes) + PAD * 2;

    // Keep the grown dock inside the window; near the ends that wins over
    // holding the icon exactly under the pointer.
    const maxTop = Math.max(EDGE, windowHeight - EDGE - length * fit);
    const top = Math.min(Math.max(restTop + shift * fit, EDGE), maxTop);

    return { sizes, starts, length, width, top, focus };
  }, [slots, pointerY, reducedMotion, rest, restTop, fit, windowHeight]);

  const tracking = pointerY !== null;

  return (
    <>
      {/* At rest the dock shows as a column of its section colours at the left
          edge, so there is always a visible way in. It wakes the dock the same
          way the edge does. */}
      <div
        aria-hidden
        onMouseEnter={show}
        onClick={show}
        className={cn(
          "fixed left-1 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-border/80 bg-background/90 px-[3px] py-2 shadow-elevated backdrop-blur md:flex",
          "transition-[opacity,transform] duration-300 ease-soft",
          open ? "pointer-events-none -translate-x-3 opacity-0" : "opacity-100",
        )}
        data-dock-peek=""
      >
        {PRIMARY_NAV.map((item) => (
          <span
            key={item.href}
            className={cn(
              "w-1 rounded-full transition-[height] duration-300 ease-soft",
              isActivePath(pathname, item.href) ? "h-3.5" : "h-1",
              TONES[item.tone].dot,
              item.tone === "yellow" && "ring-1 ring-inset ring-ink/15",
            )}
          />
        ))}
      </div>

      <div
        ref={dockRef}
        data-state={open ? "open" : "closed"}
        data-tracking={tracking ? "" : undefined}
        onMouseEnter={() => {
          hovering.current = true;
          show();
        }}
        onMouseLeave={() => {
          hovering.current = false;
          setPointerY(null);
          hide();
        }}
        onMouseMove={(event) => {
          if (!reducedMotion) setPointerY(event.clientY);
        }}
        onFocusCapture={show}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide();
        }}
        style={
          {
            top: frame.top,
            width: frame.width,
            height: frame.length,
            "--dock-fit": fit,
          } as React.CSSProperties
        }
        className={cn(
          "group/dock fixed left-3 z-50 hidden origin-top-left rounded-[24px] border border-border/70 md:block",
          "bg-background/70 shadow-elevated backdrop-blur-xl supports-[backdrop-filter]:bg-background/55",
          // Quick while following the pointer so it feels attached to it,
          // slower on the way back to rest.
          "transition-[top,width,height,transform,opacity] duration-300 ease-soft data-[tracking]:duration-150 motion-reduce:transition-none",
          open ? "opacity-100 [transform:scale(var(--dock-fit))]" : "pointer-events-none opacity-0 [transform:translateX(calc(-100%-1.5rem))_scale(var(--dock-fit))]",
        )}
      >
        <nav aria-label="Main" data-tour="dock" className="relative h-full w-full">
          {slots.map((slot, i) => {
            const top = frame.starts[i];
            if (slot.kind === "divider") {
              return (
                <div
                  key={slot.key}
                  aria-hidden
                  className="absolute h-px bg-border transition-[top] duration-300 ease-soft group-data-[tracking]/dock:duration-150"
                  style={{ top: top + DIVIDER / 2, left: PAD + SLOT * 0.2, width: SLOT * 0.6 }}
                />
              );
            }
            const size = frame.sizes[i];
            const labelled = frame.focus === i;
            return (
              <div
                key={slot.key}
                data-tour={slot.tour}
                className="absolute [container-type:size] transition-[top,width,height] duration-300 ease-soft group-data-[tracking]/dock:duration-150 motion-reduce:transition-none"
                // Slots hang from the dock's inner edge and grow away from the screen's;
                // the smaller brand mark is centred over them.
                style={{ top, left: slot.fixed ? PAD + (SLOT - BRAND) / 2 : PAD, width: size, height: size, zIndex: labelled ? 2 : 1 }}
              >
                {slot.node}
                {labelled ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full top-1/2 ml-3.5 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[13px] font-semibold text-white shadow-elevated"
                  >
                    {slot.label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>

      <WorkspaceSwitcher
        organization={organization}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        canCreate={role === "OWNER" || role === "ADMIN"}
        collapsed
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        variant="rail"
      />
    </>
  );
}
