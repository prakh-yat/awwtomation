# Meta App Review pack

Use this when submitting the app for Advanced Access so customers (not just people with a role on the app) can connect their Instagram and Facebook accounts.

## Order of operations

1. **Business Verification** (Meta Business Suite → Settings → Security Center). Upload company registration + tax document. Documents must be in a Meta-supported language — Nepali is not one, so use English-issued documents or a certified translation.
2. **Access Verification** (App Dashboard → App Review → Access verification). Choose "Tech Provider", describe: *"We provide a SaaS that lets businesses automate replies to comments and messages on their own Instagram and Facebook accounts."*
3. **App Review** — request the permissions below with the justifications and the screencast.
4. Set the app to **Live** mode.

## Permissions to request

| Permission | Why |
|---|---|
| `instagram_business_basic` | Identify the connected Instagram professional account and load its posts for the post picker. |
| `instagram_business_manage_comments` | Receive comment webhooks on the account's own media and post public replies. |
| `instagram_business_manage_messages` | Send the private reply (DM) after a keyword comment, continue the conversation when the user taps a button, and power the Inbox. |
| `pages_show_list`, `pages_manage_metadata` | List the user's Pages and subscribe them to webhooks. |
| `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement` | Receive Page post comments and reply to them. |
| `pages_messaging` | Send Messenger private replies and Inbox messages. |
| `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages` | Same as above for Instagram accounts connected through a Facebook Page. |

## Justification text (adapt wording)

**instagram_business_manage_messages** — "When a person comments a keyword the account owner configured (for example 'LINK') on the owner's own post or reel, our app sends that person one private reply containing the content they asked for. If the person taps a button in that reply, the flow continues inside the 24-hour messaging window. The account owner can also answer conversations manually from our Inbox. We never message people who have not interacted with the account, and we respect Meta's rate limits."

**instagram_business_manage_comments** — "We receive the `comments` webhook for the connected account's own media to detect keyword comments and, if the owner enabled it, post a public reply under the comment."

**instagram_business_basic** — "We read the connected account's id, username and media list so the owner can pick which post an automation applies to."

## Screencast script (2–3 min, one take, real accounts)

1. Sign in with Google.
2. Channels → Connect Instagram → show the Meta consent screen and the permissions.
3. Automations → New → pick a post, keyword `LINK`, write the DM with a button, enable public reply, save & activate.
4. From a second phone, comment `LINK` on that post.
5. Show the DM arriving with the button, and the public reply under the comment.
6. Tap the button → show the next message.
7. Back in the app: Logs shows the SENT rows; Inbox shows the conversation.

## Required URLs

- Privacy policy: `https://yourdomain.com/privacy`
- Terms: `https://yourdomain.com/terms`
- Data deletion instructions: `https://yourdomain.com/data-deletion`
- Data deletion callback: `https://yourdomain.com/api/meta/data-deletion`
- Deauthorize callback: `https://yourdomain.com/api/meta/deauthorize`

## Compliance points reviewers look for

- Only replies to comments on the connected account's own content.
- One private reply per comment; follow-ups only after user interaction, inside the 24h window.
- Automation is disclosed (first message is clearly from the business; Inbox marks automated messages).
- Tokens are encrypted at rest (AES-256-GCM) and deleted on disconnect / deauthorize.
- Rate limiting (750 private replies / hour / account) is enforced server-side.
