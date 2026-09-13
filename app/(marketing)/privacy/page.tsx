import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/marketing/section";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${brand.name} collects, uses and protects personal data.`,
};

const UPDATED = "September 6, 2026";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description={`This policy explains what ${brand.name} collects, why, and the choices you have.`}
      updated={UPDATED}
    >
      <h2>1. Who we are</h2>
      <p>
        {brand.name} (&quot;{brand.name}&quot;, &quot;we&quot;, &quot;us&quot;) is operated by {brand.company}. We provide
        software that lets businesses automate replies to comments and messages on Instagram and Facebook
        (&quot;the Service&quot;). For privacy questions, contact{" "}
        <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>
      <p>
        This policy applies to people who create an account with us (&quot;Customers&quot;) and, in a more limited way,
        to people who interact with a Customer&apos;s Instagram or Facebook presence and whose messages are processed by
        the Service (&quot;End Users&quot;).
      </p>

      <h2>2. Information we collect</h2>
      <h3>2.1 Account information</h3>
      <p>
        When you sign in with Google we receive your name, email address and profile picture from Google. We use this
        to create and secure your account. We never receive or store your Google password.
      </p>
      <h3>2.2 Connected Meta accounts</h3>
      <p>
        When you connect an Instagram professional account or a Facebook Page, Meta issues us an access token limited to
        the permissions you approve on Meta&apos;s consent screen. We store that token encrypted (AES-256-GCM) together
        with the account&apos;s public identifier, username, display name, profile picture and follower count so the
        Service can act on your behalf.
      </p>
      <h3>2.3 Content processed on your behalf</h3>
      <p>Depending on the features you use, the Service receives from Meta and stores:</p>
      <ul>
        <li>Comments on your posts, reels and Page posts, including the commenter&apos;s public username and id.</li>
        <li>Direct messages and story replies sent to your connected account, and the replies you or your automations send.</li>
        <li>Basic public profile data of End Users who interact with you (name, username, profile picture, whether they follow you).</li>
        <li>Metadata about your posts (captions, thumbnails, permalinks, comment counts) so you can pick posts to automate.</li>
      </ul>
      <h3>2.4 Usage and technical data</h3>
      <p>
        We log requests to the Service, delivery results for each message, clicks on tracked links (with a hashed IP
        address and user agent) and product events needed to run and secure the Service. We use strictly necessary
        cookies for sign-in, the active organization and workspace, and interface preferences; we do not use advertising cookies.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>To provide the Service: match keywords, send private replies and messages, run flows and broadcasts, show your inbox.</li>
        <li>To enforce plan limits and Meta&apos;s platform rules, including rate limits and the 24-hour messaging window.</li>
        <li>To secure accounts, prevent abuse, debug failures and respond to support requests.</li>
        <li>To send transactional email about your account (invitations, billing, security). We do not send marketing email without consent.</li>
      </ul>
      <p>We do not sell personal data and we do not use End User content to build profiles across Customers.</p>

      <h2>4. Meta platform data</h2>
      <p>
        Our use of data received from Instagram and Facebook is governed by Meta&apos;s{" "}
        <a href="https://developers.facebook.com/terms/" target="_blank" rel="noreferrer">
          Platform Terms
        </a>{" "}
        and Developer Policies. We only request the permissions the Service needs, use platform data solely to provide
        the features you configure, and delete it when you delete a channel together with its data or delete your
        workspace. Disconnecting a channel destroys our access token immediately but keeps its records so you can
        reconnect later. You can revoke our access at any time from your Instagram or Facebook settings; doing so stops
        all automations immediately, and a data deletion request made through Meta removes that account&apos;s data at
        once (see our <Link href="/data-deletion">data deletion page</Link>).
      </p>

      <h2>5. Sharing</h2>
      <p>We share personal data only with service providers that help us run the Service, under contracts that restrict their use of it:</p>
      <ul>
        <li>
          <strong>Meta Platforms, Inc.</strong>: to send and receive messages and comments through the Instagram and
          Facebook APIs.
        </li>
        <li>
          <strong>Supabase</strong>: authentication and our managed Postgres database.
        </li>
        <li>
          <strong>Our hosting provider</strong>: application servers and background workers.
        </li>
        <li>
          <strong>Google</strong>: sign-in with Google.
        </li>
        <li>
          <strong>An email delivery provider</strong>: transactional email, where enabled.
        </li>
      </ul>
      <p>
        We may also disclose data when required by law, to protect the rights and safety of our users, or as part of a
        merger or acquisition (in which case this policy continues to apply).
      </p>

      <h2>6. Retention</h2>
      <p>
        Account data is retained while your account is active. Comments, messages and contact records are retained while
        the workspace that owns them exists. Raw webhook receipts and job records are kept for debugging and idempotency;
        those that reference a deleted channel are removed with it. Deleting an organization, a workspace, or a channel together with its
        data, removes the associated records immediately, and deletion requests received through Meta are processed at
        once. Requests made by email (see our <Link href="/data-deletion">data deletion page</Link>) are completed within
        30 days. Minimal audit records may be kept where we must meet legal obligations.
      </p>

      <h2>7. Security</h2>
      <p>
        All traffic is encrypted in transit. Access tokens are encrypted at rest with a key that is not stored in the
        database. Access to production systems is restricted to personnel who need it. Webhooks from Meta are verified
        with a signature before they are processed. No system is perfectly secure; if we learn of a breach affecting you
        we will notify you without undue delay.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Depending on where you live you may have the right to access, correct, export, restrict or delete your personal
        data, and to object to certain processing. Customers can do most of this from Settings; for anything else email{" "}
        <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>. End Users who want data about them removed
        from a Customer&apos;s workspace should contact that Customer, or contact us and we will assist.
      </p>

      <h2>9. International transfers</h2>
      <p>
        Our providers may process data in countries other than your own. Where required we rely on standard contractual
        clauses or equivalent safeguards for those transfers.
      </p>

      <h2>10. Children</h2>
      <p>The Service is not directed to anyone under 18 and we do not knowingly collect data from them.</p>

      <h2>11. Changes</h2>
      <p>
        We will post any changes to this policy here and update the date above. For material changes we will notify
        Customers by email or in the product before they take effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        {brand.company} · <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
      </p>
    </LegalPage>
  );
}
