"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutTemplate } from "lucide-react";

import { TemplateDialog } from "@/components/automations/template-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ChannelOption } from "@/lib/services/automations";
import type { TemplateGoal, TemplatePlatform, TemplateSummary } from "@/lib/services/templates";

const OpenTemplatesContext = React.createContext<(() => void) | null>(null);

/** The query flags that open the dialog or pick what it opens on; closing it drops them all. */
const OPEN_PARAMS = ["templates", "template", "goal", "platform"];

/**
 * Opens the template picker from anywhere on the automations page.
 *
 * The dialog is mounted once by the provider, so the header button and the
 * empty state drive the same instance instead of each keeping their own copy
 * of the whole template list.
 */
export function useOpenTemplates(): (() => void) | null {
  return React.useContext(OpenTemplatesContext);
}

export function TemplatesProvider({
  templates,
  channels,
  autoOpen = false,
  autoTemplateId,
  autoGoal,
  autoPlatform,
  children,
}: {
  templates: TemplateSummary[];
  /** Connected accounts in ACTIVE state. */
  channels: ChannelOption[];
  /** True on /automations?templates=1: opens the dialog on arrival and whenever it turns true. */
  autoOpen?: boolean;
  /** From /automations?template=<id>, so an old deep link still starts that template. */
  autoTemplateId?: string;
  /** From `?goal=` and `?platform=` (an account's first goal, after connecting it): what the dialog opens on. */
  autoGoal?: TemplateGoal;
  autoPlatform?: TemplatePlatform;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(autoOpen);
  const openDialog = React.useCallback(() => setOpen(true), []);

  // Search params do not remount the page, so the Templates tab (a link to
  // ?templates=1 from this same list) arrives as a changed prop. Only the
  // change to true opens anything: the change back is our own close landing.
  const [lastAutoOpen, setLastAutoOpen] = React.useState(autoOpen);
  if (autoOpen !== lastAutoOpen) {
    setLastAutoOpen(autoOpen);
    if (autoOpen) setOpen(true);
  }

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next || !OPEN_PARAMS.some((param) => searchParams.has(param))) return;
      // Closing drops the params, so the tab can open the dialog again and a reload shows the list.
      const params = new URLSearchParams(searchParams.toString());
      for (const param of OPEN_PARAMS) params.delete(param);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <OpenTemplatesContext.Provider value={openDialog}>
      {children}
      <TemplateDialog
        templates={templates}
        channels={channels}
        open={open}
        onOpenChange={onOpenChange}
        autoTemplateId={autoTemplateId}
        autoGoal={autoGoal}
        autoPlatform={autoPlatform}
      />
    </OpenTemplatesContext.Provider>
  );
}

export function TemplatesButton({ label = "Browse templates", ...props }: Omit<ButtonProps, "onClick" | "children"> & { label?: string }) {
  const open = useOpenTemplates();
  if (!open) return null;
  return (
    <Button variant="outline" {...props} onClick={open}>
      <LayoutTemplate /> {label}
    </Button>
  );
}
