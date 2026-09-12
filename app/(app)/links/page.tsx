import type { Metadata } from "next";

import { brand } from "@/lib/brand";
import { listTrackedLinks } from "@/lib/services/links";
import { requireWorkspaceContext } from "@/lib/workspace/context";

import { LinksView } from "./links-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `Tracked links · ${brand.name}` };

export default async function LinksPage() {
  const ctx = await requireWorkspaceContext();
  const items = await listTrackedLinks(ctx.workspace.id);
  return <LinksView initialItems={items} timezone={ctx.workspace.timezone} />;
}
