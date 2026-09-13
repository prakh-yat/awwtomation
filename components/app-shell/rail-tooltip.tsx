"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Label bubble for a collapsed sidebar icon.
 *
 * Portalled into <body> rather than rendered inside the rail: the rail's nav is
 * `overflow-y-auto`, which would clip an absolutely positioned child, and the
 * bubble must sit above menus, the workspace overlay and dialogs.
 *
 * Positioned from the trigger's rect at hover time, so it stays centred on the
 * icon whatever the page's zoom or root font size.
 */

type RailTooltipState = { label: string; top: number; left: number };

const GUTTER_PX = 12;

export function useRailTooltip(enabled: boolean) {
  const [tooltip, setTooltip] = React.useState<RailTooltipState | null>(null);

  // Derived rather than cleared in an effect: expanding the rail simply stops
  // showing the bubble, so there's no state to keep in sync.
  const visible = enabled ? tooltip : null;

  // A rect measured once goes stale on scroll or resize. It's a hover hint, so
  // dismiss rather than chase the icon.
  React.useEffect(() => {
    if (!visible) return;
    const dismiss = () => setTooltip(null);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [visible]);

  const show = React.useCallback(
    (event: React.SyntheticEvent<HTMLElement>, label: string) => {
      if (!enabled) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + GUTTER_PX });
    },
    [enabled],
  );

  const hide = React.useCallback(() => setTooltip(null), []);

  const bind = React.useCallback(
    (label: string) => ({
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e, label),
      onMouseLeave: hide,
      onFocus: (e: React.FocusEvent<HTMLElement>) => show(e, label),
      onBlur: hide,
    }),
    [show, hide],
  );

  // `visible` is null on the first render (a bubble only exists after a hover),
  // so server and client agree and the portal is only reached in the browser.
  const element =
    visible && typeof document !== "undefined"
      ? createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[1400] -translate-y-1/2 whitespace-nowrap rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-elevated"
            style={{ top: `${visible.top}px`, left: `${visible.left}px` }}
          >
            {visible.label}
          </div>,
          document.body,
        )
      : null;

  return { bind, element, hide };
}
