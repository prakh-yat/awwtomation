import { redirect } from "next/navigation";

/**
 * Templates used to be a page of its own. It is a dialog over the automations
 * list now, so this route just opens it; links and bookmarks still work.
 */
export default async function AutomationTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wanted = Array.isArray(params.template) ? params.template[0] : params.template;
  const query = new URLSearchParams({ templates: "1" });
  if (wanted) query.set("template", wanted);
  redirect(`/automations?${query.toString()}`);
}
