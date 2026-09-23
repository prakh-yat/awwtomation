import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PLATFORM_TONE } from "@/components/ui/platform-badge";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { cn, initials } from "@/lib/utils";

export interface ContactAvatarProps {
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  platform: "INSTAGRAM" | "FACEBOOK";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { avatar: "h-8 w-8", text: "text-[11px]", badge: "-bottom-0.5 -right-0.5 h-4 w-4 border-[1.5px]", icon: 9 },
  md: { avatar: "h-10 w-10", text: "text-xs", badge: "-bottom-0.5 -right-0.5 h-[18px] w-[18px] border-2", icon: 10 },
  lg: { avatar: "h-16 w-16", text: "text-lg", badge: "-bottom-0.5 -right-0.5 h-6 w-6 border-2", icon: 12 },
} as const;

/**
 * Round avatar with the platform's colour tile pinned to the corner: magenta
 * for Instagram, blue for Facebook. Initials fall back from name to username.
 */
function ContactAvatar({ name, username, avatarUrl, platform, size = "md", className }: ContactAvatarProps) {
  const s = SIZES[size];
  const fallback = initials(name ?? username ?? null, "?");
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className={s.avatar}>
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
        <AvatarFallback className={s.text}>{fallback}</AvatarFallback>
      </Avatar>
      <span className={cn("absolute flex items-center justify-center rounded-full border-background", PLATFORM_TONE[platform].tile, s.badge)} aria-hidden>
        <PlatformIcon platform={platform} size={s.icon} />
      </span>
    </span>
  );
}

export { ContactAvatar };
