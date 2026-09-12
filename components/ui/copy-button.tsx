"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "value"> {
  /** Text placed on the clipboard. */
  value: string;
  /** Visible label. Omit for an icon-only button. */
  label?: string;
  /** Toast text shown after a successful copy; pass `false` to stay silent. */
  successMessage?: string | false;
}

async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for insecure contexts (plain http on a LAN) where the async
  // clipboard API is unavailable.
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) throw new Error("Clipboard unavailable");
}

const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  ({ value, label, successMessage = "Copied to clipboard", variant = "outline", size, className, ...props }, ref) => {
    const [copied, setCopied] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => () => {
      if (timer.current) clearTimeout(timer.current);
    }, []);

    async function handleCopy() {
      try {
        await writeClipboard(value);
        setCopied(true);
        if (successMessage) toast.success(successMessage);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      } catch {
        toast.error("Couldn't copy. Select the text and copy manually.");
      }
    }

    const Icon = copied ? Check : Copy;
    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size ?? (label ? "sm" : "icon")}
        onClick={handleCopy}
        aria-label={label ?? "Copy"}
        className={cn(!label && "h-8 w-8", className)}
        {...props}
      >
        <Icon className={cn(copied && "text-success")} />
        {label ? <span>{copied ? "Copied" : label}</span> : null}
      </Button>
    );
  },
);
CopyButton.displayName = "CopyButton";

export { CopyButton };
