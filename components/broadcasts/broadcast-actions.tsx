"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Eye, MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { apiFetch, errorMessage } from "./api";
import { formatCount } from "./format";
import { SendConfirmDialog } from "./send-confirm-dialog";
import type { AudienceEstimate, BroadcastRow } from "./types";

export interface BroadcastActionsProps {
  row: BroadcastRow;
  /** "menu" = kebab dropdown (list rows); "buttons" = inline buttons (report header). */
  variant?: "menu" | "buttons";
}

const EDITABLE: BroadcastRow["status"][] = ["DRAFT", "SCHEDULED"];
const CANCELLABLE: BroadcastRow["status"][] = ["SCHEDULED", "SENDING"];
const DELETABLE: BroadcastRow["status"][] = ["DRAFT", "CANCELLED", "SENT", "FAILED"];

/** Status-aware actions shared by the list and the report page. */
function BroadcastActions({ row, variant = "menu" }: BroadcastActionsProps) {
  const router = useRouter();
  const [sendOpen, setSendOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const canEdit = EDITABLE.includes(row.status);
  const canCancel = CANCELLABLE.includes(row.status);
  const canDelete = DELETABLE.includes(row.status);

  async function send(_est: AudienceEstimate) {
    try {
      const result = await apiFetch<{ eligible: number; skippedWindow: number }>(`/api/broadcasts/${row.id}/send`, { method: "POST" });
      toast.success(`Sending “${row.name}” to ${formatCount(result.eligible)} contact${result.eligible === 1 ? "" : "s"}`, {
        description: result.skippedWindow > 0 ? `${formatCount(result.skippedWindow)} skipped — outside the 24h window` : undefined,
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send the broadcast"));
      throw err;
    }
  }

  async function cancel() {
    try {
      const result = await apiFetch<{ cancelledJobs: number }>(`/api/broadcasts/${row.id}/cancel`, { method: "POST" });
      toast.success(row.status === "SENDING" ? `Cancelled — ${formatCount(result.cancelledJobs)} queued messages stopped` : "Schedule cancelled");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't cancel the broadcast"));
      throw err;
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/broadcasts/${row.id}`, { method: "DELETE" });
      toast.success("Broadcast deleted");
      if (variant === "buttons") router.push("/broadcasts");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the broadcast"));
      throw err;
    }
  }

  const dialogs = (
    <>
      <SendConfirmDialog open={sendOpen} onOpenChange={setSendOpen} name={row.name} channelId={row.channelId} audience={row.audience} onConfirm={send} />
      <ConfirmDialog
        trigger={null}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={row.status === "SENDING" ? "Stop this broadcast?" : "Cancel the schedule?"}
        description={
          row.status === "SENDING"
            ? "Messages already delivered stay delivered. Everything still queued is cancelled and the broadcast is marked as cancelled."
            : "The broadcast won't go out. You can delete it afterwards."
        }
        confirmLabel={row.status === "SENDING" ? "Stop sending" : "Cancel schedule"}
        destructive
        onConfirm={cancel}
      />
      <ConfirmDialog
        trigger={null}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete “${row.name}”?`}
        description="The broadcast is removed from this list. Delivery logs are kept."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      />
    </>
  );

  if (variant === "buttons") {
    return (
      <>
        {canEdit ? (
          <Button asChild variant="outline">
            <Link href={`/broadcasts/${row.id}`}>
              <Pencil />
              Edit
            </Link>
          </Button>
        ) : null}
        {canEdit ? (
          <Button onClick={() => setSendOpen(true)}>
            <Send />
            Send now
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="outline" onClick={() => setCancelOpen(true)}>
            <Ban />
            {row.status === "SENDING" ? "Stop sending" : "Cancel schedule"}
          </Button>
        ) : null}
        {canDelete ? (
          <Button variant="outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 />
            Delete
          </Button>
        ) : null}
        {dialogs}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={`/broadcasts/${row.id}`}>
              {canEdit ? <Pencil /> : <Eye />}
              {canEdit ? "Edit" : "View report"}
            </Link>
          </DropdownMenuItem>
          {canEdit ? (
            <DropdownMenuItem onSelect={() => setSendOpen(true)}>
              <Send />
              Send now
            </DropdownMenuItem>
          ) : null}
          {canCancel ? (
            <DropdownMenuItem onSelect={() => setCancelOpen(true)}>
              <Ban />
              {row.status === "SENDING" ? "Stop sending" : "Cancel schedule"}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}

export { BroadcastActions };
