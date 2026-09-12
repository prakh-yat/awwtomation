import * as React from "react";

import { cn } from "@/lib/utils";

export type PlatformIconPlatform = "INSTAGRAM" | "FACEBOOK";

export interface PlatformIconProps extends React.SVGAttributes<SVGSVGElement> {
  platform: PlatformIconPlatform;
  size?: number;
}

/** Monochrome Instagram / Facebook glyphs drawn in currentColor. */
function PlatformIcon({ platform, size = 16, className, ...props }: PlatformIconProps) {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    className: cn("shrink-0", className),
    ...props,
  };

  if (platform === "FACEBOOK") {
    return (
      <svg {...shared} fill="currentColor">
        <title>Facebook</title>
        <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z" />
      </svg>
    );
  }

  return (
    <svg {...shared} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <title>Instagram</title>
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.6" cy="6.4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export { PlatformIcon };
