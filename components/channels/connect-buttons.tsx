import { Button, type ButtonProps } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";

import { connectHref } from "./channel-status";

export type MetaConfigured = { instagram: boolean; facebook: boolean };

export interface ConnectButtonsProps {
  configured: MetaConfigured;
  size?: ButtonProps["size"];
  className?: string;
}

/**
 * The two primary actions of the Channels page. Plain anchors: the targets
 * are route handlers that 302 to Meta, so client-side navigation/prefetch
 * would be wrong. Unconfigured platforms render disabled so the notice
 * above explains what's missing.
 */
export function ConnectButtons({ configured, size = "default", className }: ConnectButtonsProps) {
  return (
    <div className={className ?? "flex flex-wrap items-center gap-2"}>
      {configured.instagram ? (
        <Button asChild size={size}>
          <a href={connectHref("INSTAGRAM")}>
            <PlatformIcon platform="INSTAGRAM" />
            Connect Instagram
          </a>
        </Button>
      ) : (
        <Button size={size} disabled title="Instagram Login is not configured on this server">
          <PlatformIcon platform="INSTAGRAM" />
          Connect Instagram
        </Button>
      )}
      {configured.facebook ? (
        <Button asChild size={size} variant="outline">
          <a href={connectHref("FACEBOOK")}>
            <PlatformIcon platform="FACEBOOK" />
            Connect Facebook Page
          </a>
        </Button>
      ) : (
        <Button size={size} variant="outline" disabled title="Facebook Login is not configured on this server">
          <PlatformIcon platform="FACEBOOK" />
          Connect Facebook Page
        </Button>
      )}
    </div>
  );
}
