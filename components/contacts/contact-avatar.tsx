import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  sm: { avatar: "h-7 w-7", text: "text-[10px]", badge: "h-3.5 w-3.5 -right-0.5 -bottom-0.5", icon: 9 },
  md: { avatar: "h-9 w-9", text: "text-[11px]", badge: "h-4 w-4 -right-0.5 -bottom-0.5", icon: 10 },
  lg: { avatar: "h-14 w-14", text: "text-base", badge: "h-5 w-5 -right-1 -bottom-1", icon: 12 },
} as const;

/** Round avatar with a small platform glyph pinned to the corner. Initials fall back from name → username. */
function ContactAvatar({ name, username, avatarUrl, platform, size = "md", className }: ContactAvatarProps) {
  const s = SIZES[size];
  const fallback = initials(name ?? username ?? null, "?");
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className={s.avatar}>
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
        <AvatarFallback className={s.text}>{fallback}</AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "absolute flex items-center justify-center rounded-full border border-background bg-primary text-primary-foreground",
          s.badge,
        )}
        aria-hidden
      >
        <PlatformIcon platform={platform} size={s.icon} />
      </span>
    </span>
  );
}

export { ContactAvatar };
