"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutTemplate } from "lucide-react";

import { TemplateDialog } from "@/components/automations/template-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ChannelOption } from "@/lib/services/automations";
import type { TemplateSummary } from "@/lib/services/templates";

const OpenTemplatesContext = React.createContext<(() => void) | null>(null);

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
  children,
}: {
  templates: TemplateSummary[];
  /** Connected accounts in ACTIVE state. */
  channels: ChannelOption[];
  /** True on /automations?templates=1: opens the dialog on arrival and whenever it turns true. */
  autoOpen?: boolean;
  /** From /automations?template=<id>, so an old deep link still starts that template. */
  autoTemplateId?: string;
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
      if (next || (!searchParams.has("templates") && !searchParams.has("template"))) return;
      // Closing drops the param, so the tab can open the dialog again and a reload shows the list.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("templates");
      params.delete("template");
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
