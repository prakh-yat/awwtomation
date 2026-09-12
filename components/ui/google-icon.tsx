import * as React from "react";

import { cn } from "@/lib/utils";

export interface GoogleIconProps extends React.SVGAttributes<SVGSVGElement> {
  /** Render the "G" in currentColor instead of Google's brand colors. */
  monochrome?: boolean;
}

/** Google "G" for the sign-in button. Brand colors by default, as Google's guidelines expect. */
function GoogleIcon({ monochrome = false, className, ...props }: GoogleIconProps) {
  const c = (hex: string) => (monochrome ? "currentColor" : hex);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("h-4 w-4", className)} {...props}>
      <path
        fill={c("#4285F4")}
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill={c("#34A853")}
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill={c("#FBBC05")}
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z"
      />
      <path
        fill={c("#EA4335")}
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export { GoogleIcon };
