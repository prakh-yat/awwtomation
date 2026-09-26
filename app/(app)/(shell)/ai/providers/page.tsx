import { redirect } from "next/navigation";

/** Providers are picked and managed from the agent editor on /ai. Old links land there. */
export default function AiProvidersPage() {
  redirect("/ai");
}
