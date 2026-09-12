/**
 * The sidebar's collapsed state lives in a cookie so the server can render the
 * correct width on first paint (no layout flash). The value is read by
 * app-frame.tsx on the server and written here on the client.
 */
export const SIDEBAR_COOKIE = "or_sidebar";

export type SidebarCookieValue = "collapsed" | "expanded";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Pure parser so server components can use it with `cookies()`. */
export function isSidebarCollapsed(cookieValue: string | undefined | null): boolean {
  return cookieValue === "collapsed";
}

/** Client-only: persist the user's choice. No-op during SSR. */
export function persistSidebarCollapsed(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  const value: SidebarCookieValue = collapsed ? "collapsed" : "expanded";
  // Not httpOnly on purpose (written here on the client); Secure whenever the page itself is served over TLS.
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIDEBAR_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}
