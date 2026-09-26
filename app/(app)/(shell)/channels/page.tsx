import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Flags an old link or bookmark may still carry; the dashboard turns them into toasts. */
const FORWARDED = ["connected", "error", "message", "platform"] as const;

/** Accounts are managed from the dashboard now. Old links land there with the accounts dialog open. */
export default async function ChannelsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams({ accounts: "1" });
  for (const key of FORWARDED) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) query.set(key, value);
  }
  redirect(`/dashboard?${query.toString()}`);
}
