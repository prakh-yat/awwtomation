"use client";

import * as React from "react";
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
  /** Open on mount, for /automations?templates=1. */
  autoOpen?: boolean;
  /** From /automations?template=<id>, so an old deep link still starts that template. */
  autoTemplateId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(autoOpen);
  const openDialog = React.useCallback(() => setOpen(true), []);

  return (
    <OpenTemplatesContext.Provider value={openDialog}>
      {children}
      <TemplateDialog
        templates={templates}
        channels={channels}
        open={open}
        onOpenChange={setOpen}
        autoTemplateId={autoTemplateId}
      />
    </OpenTemplatesContext.Provider>
  );
}

export function TemplatesButton({ label = "Templates", ...props }: Omit<ButtonProps, "onClick" | "children"> & { label?: string }) {
  const open = useOpenTemplates();
  if (!open) return null;
  return (
    <Button variant="outline" {...props} onClick={open}>
      <LayoutTemplate /> {label}
    </Button>
  );
}
