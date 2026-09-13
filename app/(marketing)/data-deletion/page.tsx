import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/marketing/section";
import { brand } from "@/lib/brand";
import { findDataDeletionRecord, type DataDeletionRecord } from "@/lib/services/channels";

export const metadata: Metadata = {
  title: "Data Deletion",
  description: `How to delete the data ${brand.name} holds about you or your audience.`,
};

/**
 * Every sentence on this page describes what the code actually does today
 * (see lib/services/channels.ts: disconnectChannel, purgeChannel,
 * handleMetaDeauthorize, handleMetaDataDeletion). Update both together.
 */
const UPDATED = "September 7, 2026";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Status box for the confirmation code Meta shows after a data deletion request. */
function DeletionStatus({ code, record }: { code: string; record: DataDeletionRecord | null }) {
  return (
    <div className="mt-8 rounded-lg border bg-muted/40 px-5 py-4 text-sm">
      <p className="text-[13px] font-medium text-muted-foreground">Deletion request status</p>
      <p className="mt-2">
        Confirmation code <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[13px]">{code}</code>
      </p>
      {record ? (
        <p className="mt-2">
          <span className="font-medium text-foreground">Completed</span> on {record.completedAt.toUTCString()}.{" "}
          {record.channels === 0
            ? "No connected account matched the request, so there was nothing left to delete."
            : `${record.channels} connected account${record.channels === 1 ? " was" : "s were"} permanently deleted together with all associated data.`}
        </p>
      ) : (
        <p className="mt-2">
          We have no record of a request with this code. Codes are issued by Meta when you use &quot;Delete your
          information&quot;; if you believe this is an error, email{" "}
          <a href={`mailto:${brand.supportEmail}?subject=Data%20deletion%20status`}>{brand.supportEmail}</a> and quote the
          code.
        </p>
      )}
    </div>
  );
}

export default async function DataDeletionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawCode = typeof params.code === "string" ? params.code.trim() : "";
  const code = rawCode.slice(0, 64);
  const record = code ? await findDataDeletionRecord(code) : null;

  return (
    <LegalPage
      title="Data Deletion Instructions"
      description={`You can remove the data ${brand.name} stores about your account, your connected channels or your audience at any time. This page explains every route and exactly what each one deletes.`}
      updated={UPDATED}
    >
      {code ? <DeletionStatus code={code} record={record} /> : null}

      <h2>1. Disconnect a channel (keeps data for reconnection)</h2>
      <p>Admins and owners can disconnect an Instagram account or Facebook Page from inside {brand.name}:</p>
      <ol>
        <li>Sign in and open <strong>Channels</strong> in the sidebar.</li>
        <li>Open the menu on the account card and choose <strong>Disconnect</strong>, then confirm.</li>
      </ol>
      <p>
        Disconnecting destroys the stored access token immediately, asks Meta to stop sending webhooks for a Facebook
        Page (Instagram has no equivalent, so its events are discarded on arrival), and stops all processing for that
        account: incoming comments and messages are ignored and automations on it no longer fire. The channel&apos;s contacts, conversations, messages, automations, cached posts and delivery logs are
        <strong> kept</strong> so that reconnecting the same account later restores the workspace exactly as it was. If
        you want that data gone, use the next option.
      </p>

      <h2>2. Delete a channel and all of its data (permanent)</h2>
      <p>An owner can permanently erase everything an account ever produced in the workspace:</p>
      <ol>
        <li>Open <strong>Channels</strong>, open the menu on the account card and choose <strong>Delete account and data</strong>.</li>
        <li>Type the account&apos;s username (or the Page name) to confirm.</li>
      </ol>
      <p>
        This deletes the channel record and its access token, every contact and conversation on that account
        (including all messages), the automations built on it and their flow sessions and tracked links, broadcasts
        sent from it, delivery logs, cached posts, and any queued background jobs for the account. We also delete the
        raw webhook receipts we keep for de-duplicating Meta&apos;s deliveries wherever they reference the account or
        one of its posts. The deletion runs immediately and cannot be undone. The only trace that remains is an audit
        entry in your workspace stating that the channel was deleted, when, by whom, and how many records it contained.
      </p>

      <h2>3. Delete a workspace or an organization</h2>
      <p>
        An owner can delete a workspace from <strong>Settings → General</strong> (Ownership and deletion). This removes
        every channel in it with all the data listed in section 2, plus its pipelines, tracked links, logs, queued jobs
        and the workspace&apos;s audit log. Connected accounts are released so they can be connected elsewhere.
      </p>
      <p>
        Deleting the organization, from the same place, removes all of its workspaces in the same way, plus team
        memberships, pending invitations and payment history. Cancel a paid subscription first so nothing is charged
        again. To delete your user account as well, or if you can no longer sign in, email us (section 6).
      </p>

      <h2>4. Remove {brand.name} from your Instagram or Facebook settings</h2>
      <p>
        You can revoke {brand.name}&apos;s access directly on Meta&apos;s side. On Facebook go to{" "}
        <strong>Settings &amp; privacy → Settings → Business integrations</strong> and remove {brand.name}; on Instagram
        go to <strong>Settings → Website permissions → Apps and websites</strong> and remove {brand.name}.
      </p>
      <p>
        Meta then sends us a deauthorization callback. For every account we can match to it we do exactly what
        section 1 describes: the token is destroyed at once and processing stops, while the workspace&apos;s data is
        kept until an owner deletes it (sections 2, 3 or 5) or asks us to (section 6). For Facebook Pages, Meta
        identifies the <em>person</em> who removed the app rather than the Page, which we cannot always map to a
        connected Page; in that case the Page token simply stops working on its next use and the account shows as
        &quot;Reconnect needed&quot; until someone in the workspace disconnects or deletes it.
      </p>

      <h2>5. Meta&apos;s data deletion request</h2>
      <p>
        If you use Facebook&apos;s <strong>&quot;Delete your information&quot;</strong> (send request) for {brand.name},
        Meta calls our data deletion callback. We immediately and permanently delete every connected account matched to
        your Meta user id, with the full scope described in section 2, in whichever workspace holds it. Meta shows you a
        confirmation code and a link back to this page; opening that link displays whether the request completed and
        how many accounts were deleted. The same Facebook Page matching limitation from section 4 applies.
      </p>

      <h2>6. Request deletion by email</h2>
      <p>
        For anything the options above do not cover, such as deleting your user account, removing data when you cannot
        sign in, or requests from people who interacted with a business that uses {brand.name}, email{" "}
        <a href={`mailto:${brand.supportEmail}?subject=Data%20deletion%20request`}>{brand.supportEmail}</a> with the
        subject &quot;Data deletion request&quot;. Tell us what you want deleted: a specific channel, a workspace, an organization, your
        whole account, or, if you are a member of someone else&apos;s audience, the Instagram or Facebook username the
        data relates to.
      </p>
      <p>
        We verify the request, complete the deletion within 30 days and confirm by email. If you are asking us to
        remove data held in another customer&apos;s workspace, we may also forward the request to that customer, who is
        the controller of that data.
      </p>

      <h2>7. What remains after deletion</h2>
      <ul>
        <li>
          Audit entries that record that a deletion happened (timestamp, actor, account id and record counts). These
          never include message content or contact details.
        </li>
        <li>Invoices, payment records and payment-provider receipts we are legally required to keep for accounting.</li>
        <li>Aggregated, anonymised statistics that cannot identify anyone.</li>
        <li>
          Copies inside our hosting provider&apos;s database backups, which roll off on the provider&apos;s retention
          schedule. Deleted data is never restored from a backup except to recover from a platform-wide failure.
        </li>
      </ul>

      <h2>8. Questions</h2>
      <p>
        See our <Link href="/privacy">Privacy Policy</Link> for how we handle data generally, or contact{" "}
        <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>
    </LegalPage>
  );
}
