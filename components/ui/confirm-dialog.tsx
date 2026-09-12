"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  /** Element that opens the dialog (rendered with asChild, so pass a Button). */
  trigger: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button red; use for deletes and disconnects. */
  destructive?: boolean;
  /** May return a promise — the dialog shows a spinner and closes on success. */
  onConfirm: () => void | Promise<void>;
  /** Optional controlled state, e.g. to open from a dropdown item. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  function setOpen(next: boolean) {
    // Never let the dialog close mid-request; the caller's promise decides.
    if (pending && !next) return;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      setPending(false);
      setOpen(false);
    } catch {
      // The caller is responsible for surfacing the error (toast). Keep the
      // dialog open so the user can retry or cancel.
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter className="mt-2 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            loading={pending}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog };
