"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

import { isActivePath, PRIMARY_NAV } from "./nav-config";
import type { ShellProps } from "./types";
import { UsageMeter } from "./usage-meter";
import { UserMenu } from "./user-menu";
import { WorkspaceCard, WorkspaceSwitcher } from "./workspace-switcher";

// ───────────────────────── Geometry ─────────────────────────
//
// Magnification is computed from the resting layout and applied with transforms
// only, so nothing reflows while the pointer moves: an icon's growth is a
// `scale`, and its neighbours are pushed aside with a `translateY` derived from
// that same growth. That keeps the slot centres below constant and lets them be
// worked out arithmetically instead of measured on every frame.

/** Resting size of one dock slot. */
const SLOT = 44;
/** Vertical gap between slots. */
const GAP = 8;
/** Height a divider occupies, gaps included. */
const DIVIDER = 13;
/** Padding at the top and bottom of the dock. */
const PAD = 10;
/** How big the icon under the pointer gets. */
const MAX_SCALE = 1.55;
/** How far the pointer's influence reaches, in pixels. */
const RADIUS = 105;
/** Below this the label bubble would be unreadable, so it is not drawn. */
const LABEL_SCALE = 1.18;

type Slot =
  | { kind: "divider" }
  | {
      kind: "item";
      key: string;
      label: string;
      render: (scale: number) => React.ReactNode;
      /** Decorative: does not magnify, does not get a label bubble. */
      fixed?: boolean;
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

  const [open, setOpen] = React.useState(false);
  const [pointerY, setPointerY] = React.useState<number | null>(null);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const dockRef = React.useRef<HTMLDivElement>(null);
  const topRef = React.useRef(0);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Shrinks the whole dock on a short window rather than letting it run off the
  // top and bottom of the screen. 1 on anything laptop-sized or larger.
  const [fit, setFit] = React.useState(1);

  // A menu or the workspace overlay has to outlive the pointer leaving the dock.
  const pinned = switcherOpen || menuOpen;

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
    // A short grace period: crossing the gap between the hot zone and the dock,
    // or clipping a corner on the way to an icon, should not dismiss it.
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setPointerY(null);
    }, 160);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  React.useEffect(() => {
    if (pinned) show();
  }, [pinned, show]);

  // Measured once per open and on resize. Nothing in the dock reflows while the
  // pointer moves, so a stale rect is not a risk between those two moments.
  React.useEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = dockRef.current?.getBoundingClientRect();
      if (rect) topRef.current = rect.top;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, fit]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pinned) {
        setOpen(false);
        setPointerY(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pinned]);

  const slots = React.useMemo<Slot[]>(() => {
    const list: Slot[] = [
      {
        // The mark, not a link: the dock is for navigating, and a logo that
        // silently means "dashboard" is a guess the Dashboard row already covers.
        kind: "item",
        key: "brand",
        label: "",
        fixed: true,
        render: () => (
          <span
            aria-hidden
            className="flex h-full w-full items-center justify-center rounded-[16px] bg-foreground text-background"
          >
            <LogoMark size={22} className="text-background" />
          </span>
        ),
      },
      { kind: "divider" },
    ];

    for (const item of PRIMARY_NAV) {
      const active = isActivePath(pathname, item.href);
      const Icon = item.icon;
      list.push({
        kind: "item",
        key: item.href,
        label: item.label,
        render: () => (
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-full w-full items-center justify-center rounded-[14px] border outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active
                ? "border-transparent bg-foreground text-background"
                : "border-transparent bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2 : 1.75} />
          </Link>
        ),
      });
    }

    const settingsActive = isActivePath(pathname, "/settings");
    list.push({ kind: "divider" });
    list.push({
      kind: "item",
      key: "/settings",
      label: "Settings",
      render: () => (
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={settingsActive ? "page" : undefined}
          className={cn(
            "flex h-full w-full items-center justify-center rounded-[14px] outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            settingsActive ? "bg-foreground text-background" : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Settings className="h-[19px] w-[19px]" strokeWidth={settingsActive ? 2 : 1.75} />
        </Link>
      ),
    });

    list.push({ kind: "divider" });
    list.push({
      kind: "item",
      key: "workspace",
      label: workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? "Workspace",
      render: () => (
        <WorkspaceCard
          organizationName={organization.name}
          workspace={workspaces.find((w) => w.id === activeWorkspaceId)}
          collapsed
          onOpen={() => setSwitcherOpen(true)}
        />
      ),
    });
    list.push({
      kind: "item",
      key: "usage",
      label: "DMs this month",
      render: () => <UsageMeter usage={usage} collapsed />,
    });
    list.push({
      kind: "item",
      key: "account",
      label: user.name?.trim() || user.email,
      render: () => (
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

  // Resting offset of every slot from the top of the dock, and the centre of each.
  const geometry = React.useMemo(() => {
    const offsets: number[] = [];
    let y = PAD;
    for (const slot of slots) {
      offsets.push(y);
      y += slot.kind === "divider" ? DIVIDER : SLOT + GAP;
    }
    return { offsets, height: y - GAP + PAD };
  }, [slots]);

  React.useEffect(() => {
    const update = () => {
      const available = window.innerHeight - 24;
      setFit(geometry.height > available ? Math.max(available / geometry.height, 0.62) : 1);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [geometry.height]);

  // One pass over the slots: the scale each one takes, and the shift needed to
  // keep its neighbours from overlapping it.
  const { scales, shifts, focus } = React.useMemo(() => {
    const scales = slots.map(() => 1);
    const shifts = slots.map(() => 0);
    if (pointerY === null || reducedMotion) return { scales, shifts, focus: -1 };

    let growthAbove = 0;
    let focus = -1;
    let best = LABEL_SCALE;
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      if (slot.kind !== "item" || slot.fixed) continue;
      const centre = topRef.current + (geometry.offsets[i] + SLOT / 2) * fit;
      const scale = scaleFor(Math.abs(pointerY - centre));
      scales[i] = scale;
      if (scale > best) {
        best = scale;
        focus = i;
      }
    }

    // Push each slot down by everything that grew above it, then lift the whole
    // stack by half the total so the dock stays visually centred.
    let total = 0;
    for (let i = 0; i < slots.length; i += 1) {
      shifts[i] = growthAbove;
      const growth = (scales[i] - 1) * SLOT;
      growthAbove += growth;
      total += growth;
    }
    for (let i = 0; i < slots.length; i += 1) shifts[i] -= total / 2;

    return { scales, shifts, focus };
  }, [slots, pointerY, reducedMotion, geometry, fit]);

  function handlePointerMove(event: React.MouseEvent<HTMLDivElement>) {
    if (reducedMotion) return;
    setPointerY(event.clientY);
  }

  return (
    <>
      {/* The strip that wakes the dock. Wide enough to hit without aiming, narrow
          enough not to swallow clicks meant for the page. */}
      <div
        aria-hidden
        onMouseEnter={show}
        className="fixed inset-y-0 left-0 z-40 hidden w-4 md:block"
        data-dock-hotzone=""
      />

      <div
        ref={dockRef}
        data-state={open ? "open" : "closed"}
        onMouseEnter={show}
        onMouseLeave={hide}
        onMouseMove={handlePointerMove}
        onFocusCapture={show}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide();
        }}
        style={{ height: `${geometry.height}px`, "--dock-fit": fit } as React.CSSProperties}
        className={cn(
          "fixed left-3 top-1/2 z-50 hidden origin-left flex-col items-center rounded-[22px] border border-border/70 md:flex",
          "[transform:translateY(-50%)_scale(var(--dock-fit))]",
          "bg-background/70 shadow-elevated backdrop-blur-xl supports-[backdrop-filter]:bg-background/55",
          "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          open
            ? "opacity-100"
            : "pointer-events-none opacity-0 [transform:translate(calc(-100%-1.25rem),-50%)_scale(var(--dock-fit))]",
        )}
      >
        <nav aria-label="Main" className="relative w-full" style={{ width: SLOT + PAD * 2 }}>
          {slots.map((slot, i) => {
            const top = geometry.offsets[i];
            if (slot.kind === "divider") {
              return (
                <div
                  key={`divider-${i}`}
                  aria-hidden
                  className="absolute left-1/2 h-px w-6 -translate-x-1/2 bg-border"
                  style={{ top: `${top + DIVIDER / 2}px`, transform: `translate(-50%, ${shifts[i]}px)` }}
                />
              );
            }
            const scale = scales[i];
            return (
              <div
                key={slot.key}
                className="absolute left-1/2 will-change-transform"
                style={{
                  top: `${top}px`,
                  width: SLOT,
                  height: SLOT,
                  transform: `translate(-50%, ${shifts[i]}px) scale(${scale})`,
                  transformOrigin: "center center",
                  zIndex: focus === i ? 2 : 1,
                }}
              >
                {slot.render(scale)}
                {focus === i ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground shadow-elevated"
                    style={{ transform: `translateY(-50%) scale(${1 / scale})`, transformOrigin: "left center" }}
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
