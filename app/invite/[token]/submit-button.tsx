"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/** Primary ink pill that reflects the enclosing form's pending state. */
export function SubmitButton({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-12 w-full" loading={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
