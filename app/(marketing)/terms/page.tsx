import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/marketing/section";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The agreement that governs your use of ${brand.name}.`,
};

const UPDATED = "September 6, 2026";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      description={`These terms govern your use of ${brand.name}. Please read them carefully.`}
      updated={UPDATED}
    >
      <h2>1. Agreement</h2>
      <p>
        By creating an account or using {brand.name} (&quot;the Service&quot;), operated by {brand.company}
        (&quot;we&quot;, &quot;us&quot;), you agree to these Terms and to our{" "}
        <Link href="/privacy">Privacy Policy</Link>. If you use the Service on behalf of a company, you confirm you have
        authority to bind it, and &quot;you&quot; refers to that company.
      </p>

      <h2>2. The Service</h2>
      <p>
        {brand.name} lets you automate replies to comments and messages on Instagram professional accounts and Facebook
        Pages that you control, manage conversations, send broadcasts and track links. The Service depends on APIs
        provided by Meta Platforms, Inc.; features may change or become unavailable if Meta changes those APIs or its
        policies.
      </p>

      <h2>3. Accounts, organizations and workspaces</h2>
      <ul>
        <li>You must be at least 18 and provide accurate account information.</li>
        <li>You are responsible for activity in your organizations and their workspaces, including by team members you invite.</li>
        <li>Plans and billing apply to an organization and cover every workspace in it.</li>
        <li>You may only connect Instagram accounts and Facebook Pages that you own or are authorized to manage.</li>
        <li>Keep your Google sign-in secure. Notify us promptly at <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> if you suspect unauthorized access.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>Send unsolicited, deceptive, harassing or unlawful messages, or messages that violate Meta&apos;s Platform Terms, Community Standards or Messenger and Instagram messaging policies.</li>
        <li>Message people who have not interacted with your account, or attempt to bypass the messaging windows and rate limits Meta imposes.</li>
        <li>Collect or use End User data for purposes unrelated to the conversation, or sell it to third parties.</li>
        <li>Impersonate others, infringe intellectual property, or distribute malware or phishing links.</li>
        <li>Probe, disrupt or reverse-engineer the Service, or use it to build a competing product.</li>
      </ul>
      <p>
        We may suspend or remove automations, channels or accounts that we reasonably believe breach this section, and
        we will tell you why unless the law prevents us.
      </p>

      <h2>5. Your content and data</h2>
      <p>
        You retain all rights to the messages, flows and other content you create, and to the data about your audience.
        You grant us a licence to host, process and transmit that content solely to operate the Service. You are
        responsible for having a lawful basis to message your audience and for the accuracy of what you send.
      </p>

      <h2>6. Plans, billing and limits</h2>
      <ul>
        <li>Plans are described on the <Link href="/pricing">pricing page</Link>. Limits (channels, automations, monthly DMs, team members) are enforced automatically; messages beyond your DM limit are not sent.</li>
        <li>Paid plans are billed monthly or yearly in advance, depending on the option you choose. Prices exclude taxes, which we add where required.</li>
        <li>You can upgrade, downgrade or cancel at any time from Settings. Upgrades and downgrades apply immediately: an upgrade charges the difference for the rest of the billing period, and a downgrade credits unused time to your billing balance for future invoices. Cancelling keeps your plan until the end of the period you have paid for.</li>
        <li>Fees are non-refundable except where required by law or stated otherwise in writing.</li>
        <li>We may change prices with at least 30 days&apos; notice by email.</li>
      </ul>

      <h2>7. Third-party platforms</h2>
      <p>
        Your use of Instagram and Facebook is governed by Meta&apos;s own terms. We do not control Meta&apos;s APIs,
        review processes or enforcement actions and are not responsible for restrictions Meta places on your accounts.
        You must comply with Meta&apos;s requirements for automated messaging, including disclosing automation where
        required.
      </p>

      <h2>8. Availability and support</h2>
      <p>
        We aim for high availability but do not guarantee uninterrupted service. Message delivery depends on Meta and
        may be delayed, rate-limited or rejected. Support is provided by email at{" "}
        <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may delete a workspace, an organization or your account at any time. We may suspend or terminate the Service for material
        breach of these Terms, for legal reasons, or if we discontinue the Service (with reasonable notice). On
        termination your data is deleted as described in the <Link href="/data-deletion">data deletion page</Link>.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent permitted by law we
        disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose and
        non-infringement. We do not warrant that automated messaging will achieve any particular result.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, neither party is liable for indirect, incidental, special, consequential
        or punitive damages, or for lost profits, revenue or data. Our total liability arising from the Service in any
        twelve-month period is limited to the fees you paid us in that period. Nothing in these Terms limits liability
        that cannot be limited by law.
      </p>

      <h2>12. Indemnity</h2>
      <p>
        You will defend and indemnify us against claims arising from your content, your messaging practices or your
        breach of these Terms or of Meta&apos;s policies.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms. We will post the new version here and, for material changes, notify you at least 14
        days before they take effect. Continued use after that date means you accept the new Terms.
      </p>

      <h2>14. General</h2>
      <p>
        These Terms are the entire agreement between you and us about the Service. If any provision is unenforceable,
        the rest remains in effect. You may not assign these Terms without our consent. These Terms are governed by the
        laws of the jurisdiction in which {brand.company} is established, and disputes will be resolved in its courts,
        without prejudice to mandatory consumer protections where you live.
      </p>

      <h2>15. Contact</h2>
      <p>
        {brand.company} · <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
      </p>
    </LegalPage>
  );
}
