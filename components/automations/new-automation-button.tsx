"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import type { AutomationDetail } from "@/lib/services/automations";

/**
 * Creates a blank draft (just the trigger) and opens it on the canvas. The
 * account can be changed in the builder; it starts on the first connected one.
 */
export function NewAutomationButton({
  channelId,
  label = "New automation",
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & {
  /** First active account, or null when none is connected. */
  channelId: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function create() {
    if (!channelId) {
      toast.error("Connect an account first", {
        action: { label: "Connect", onClick: () => router.push("/dashboard?accounts=1") },
      });
      return;
    }
    setPending(true);
    try {
      const { automation } = await apiFetch<{ automation: AutomationDetail }>("/api/automations", { method: "POST", json: { channelId } });
      router.push(`/automations/${automation.id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't create the automation"));
      setPending(false);
    }
  }

  return (
    <Button {...props} onClick={() => void create()} loading={pending}>
      <Plus /> {label}
    </Button>
  );
}
