/** Central brand config: the product name and copy live here, nowhere else. */
export const brand = {
  /** Display name. The wordmark itself carries the trailing dot ("Awwtomation."). */
  name: "Awwtomation",
  wordmark: "Awwtomation.",
  tagline: "Comment-to-DM automation for Instagram and Facebook.",
  description:
    "Awwtomation sends a private message to people who comment a keyword on your Instagram or Facebook posts, replies under their comment and saves them as a contact.",
  supportEmail: "support@awwtomation.com",
  company: "Awwtomation",
  /** The legal pages live on the marketing site, not in this app. */
  legal: {
    privacy: "https://www.awwtomation.com/legal/privacy-policy",
    terms: "https://www.awwtomation.com/legal/terms-and-conditions",
    dataDeletion: "https://www.awwtomation.com/legal/data-deletion",
  },
  /** The marketing site's palette; `app/globals.css` holds the full set. */
  colors: { ink: "#0f0f0f", paper: "#ffffff", yellow: "#fff200", magenta: "#fb0df7", purple: "#7b34ce", lavender: "#d8bee3" },
} as const;
