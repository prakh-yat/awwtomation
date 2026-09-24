"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/sonner";
import type { ConnectedApp } from "@/lib/services/mcp-access";

import { apiFetch, errorMessage } from "./client-api";

function ago(iso: string): string {
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

/**
 * The AI apps that can reach this organization. Anyone can disconnect their
 * own; admins and owners see and can disconnect everyone's.
 */
export function ConnectedApps({ apps, currentUserId, canManageAll }: { apps: ConnectedApp[]; currentUserId: string; canManageAll: boolean }) {
  const router = useRouter();

  async function disconnect(app: ConnectedApp) {
    try {
      await apiFetch(`/api/mcp/apps/${encodeURIComponent(app.grantId)}`, { method: "DELETE" });
      toast.success(`${app.clientName} disconnected`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, `Couldn't disconnect ${app.clientName}`));
      throw err;
    }
  }

  if (apps.length === 0) {
    return (
      <Card>
        <EmptyState icon={Unplug} tone="fog" title="No apps connected" compact />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y">
        {apps.map((app, i) => {
          const mine = app.user.id === currentUserId;
          const who = mine ? "you" : (app.user.name ?? app.user.email);
          return (
            <li key={app.grantId} className="rise flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">
                  {app.clientName}
                  {app.clientHost ? <span className="ml-2 font-normal text-muted-foreground">{app.clientHost}</span> : null}
                </p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                  Connected by {who} {ago(app.createdAt)} · {app.workspaces === null ? "All workspaces" : app.workspaces.map((w) => w.name).join(", ") || "No workspaces"} ·{" "}
                  {app.lastUsedAt ? `Used ${ago(app.lastUsedAt)}` : "Not used yet"}
                </p>
              </div>
              {mine || canManageAll ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      Disconnect
                    </Button>
                  }
                  title={`Disconnect ${app.clientName}?`}
                  description={
                    mine
                      ? "It loses access to this organization straight away. You can connect it again from the app."
                      : `It loses access to this organization straight away. ${who} can connect it again from the app.`
                  }
                  confirmLabel="Disconnect"
                  destructive
                  onConfirm={() => disconnect(app)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
