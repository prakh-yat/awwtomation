"use client";

import { Toaster as Sonner, toast, type ToasterProps } from "sonner";

/**
 * App-wide toast host. Mounted once in app/layout.tsx; call `toast(...)` from
 * anywhere on the client. Styled through class names so it inherits the
 * monochrome tokens instead of sonner's default palette.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-elevated group-[.toaster]:rounded-lg group-[.toaster]:text-[13px]",
          title: "group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:text-xs",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          closeButton: "group-[.toast]:bg-background group-[.toast]:border-border group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:[&_svg]:text-success",
          error: "group-[.toaster]:[&_svg]:text-destructive",
          warning: "group-[.toaster]:[&_svg]:text-warning",
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
