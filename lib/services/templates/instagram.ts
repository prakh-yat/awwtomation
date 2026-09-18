/**
 * Instagram templates.
 *
 * Every one is a complete, activatable flow: the trigger, the keywords and the
 * whole graph. Links and copy are placeholders the user edits in the builder,
 * so nothing here should read as final marketing text.
 */
import { ACCOUNT_PLACEHOLDER, AGENT_PLACEHOLDER, BRANCH_X, chain, edge, LINK, node, STEP_Y, TRIGGER, type AutomationTemplate } from "./kit";

const autoDmLinks: AutomationTemplate = {
  id: "ig-auto-dm-links",
  name: "Auto-DM links from comments",
  description: "Send a link when people comment on a post or reel.",
  platform: "INSTAGRAM",
  goal: "Drive traffic",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["link"],
  followGate: false,
  popular: true,
  publicReplyEnabled: true,
  publicReplies: ["Sent you a DM", "Check your messages", "Just sent it over"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, thanks for your comment. Here is the link you asked for.",
          buttons: [{ type: "web_url", title: "Open link", url: LINK.site }],
        },
      }),
    ],
    edges: chain("trigger", "message-1"),
  },
};

const leadsFromStories: AutomationTemplate = {
  id: "ig-leads-from-stories",
  name: "Generate leads with stories",
  description: "Use limited-time offers in your stories to convert leads.",
  platform: "INSTAGRAM",
  goal: "Capture leads",
  triggerType: "STORY_REPLY",
  matchMode: "CONTAINS",
  keywords: ["offer", "yes", "me"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "You caught the story, {{first_name|there}}. The offer runs for 24 hours. Want me to save your spot?",
          buttons: [{ type: "postback", title: "Save my spot", payload: "btn:0" }],
        },
      }),
      node("ask-email", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: { text: "What email should I send the details to?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "That does not look like an email address. Could you type it again?",
        maxRetries: 2,
      }),
      node("tag-1", 0, STEP_Y * 3, { type: "add_tag", tag: "story lead" }),
      node("message-2", 0, STEP_Y * 4, {
        type: "send_message",
        message: {
          text: "Locked in. Details are on their way to {{email|your inbox}}.",
          buttons: [{ type: "web_url", title: "See the offer", url: LINK.shop }],
        },
      }),
    ],
    edges: [edge("trigger", "message-1"), edge("message-1", "ask-email", "btn:0"), ...chain("ask-email", "tag-1", "message-2")],
  },
};

const respondToAllDms: AutomationTemplate = {
  id: "ig-respond-to-all-dms",
  name: "Respond to all your DMs",
  description: "Auto-send customized replies when people DM you.",
  platform: "INSTAGRAM",
  goal: "Engage your audience",
  triggerType: "DM",
  matchMode: "ANY",
  keywords: [],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Thanks for the message, {{first_name|there}}. Someone reads every DM here. In the meantime, what are you after?",
          quickReplies: [
            { title: "Prices", payload: "qr:0" },
            { title: "How it works", payload: "qr:1" },
            { title: "Just saying hi", payload: "qr:2" },
          ],
        },
      }),
      node("message-prices", -BRANCH_X * 1.5, STEP_Y * 2, {
        type: "send_message",
        message: { text: "Here is the full price list.", buttons: [{ type: "web_url", title: "See pricing", url: LINK.pricing }] },
      }),
      node("message-how", 0, STEP_Y * 2, {
        type: "send_message",
        message: { text: "Here is the short version of how it works.", buttons: [{ type: "web_url", title: "Read more", url: LINK.site }] },
      }),
      node("message-hi", BRANCH_X * 1.5, STEP_Y * 2, {
        type: "send_message",
        message: { text: "Hi back. Reply any time you need something." },
      }),
    ],
    edges: [
      edge("trigger", "message-1"),
      edge("message-1", "message-prices", "qr:0"),
      edge("message-1", "message-how", "qr:1"),
      edge("message-1", "message-hi", "qr:2"),
    ],
  },
};

const growFollowersFromComments: AutomationTemplate = {
  id: "ig-grow-followers-from-comments",
  name: "Grow followers from comments",
  description: "Incentivize a follow to grow your account.",
  platform: "INSTAGRAM",
  goal: "Grow your followers",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["link", "send"],
  followGate: true,
  publicReplyEnabled: true,
  publicReplies: ["Check your DMs", "Sent, have a look in your messages"],
  flow: {
    nodes: [
      TRIGGER,
      node("follow-1", 0, STEP_Y, {
        type: "condition_follow",
        retryPrompt: `Follow ${ACCOUNT_PLACEHOLDER}, then tap the button below to get your link.`,
      }),
      node("message-link", -BRANCH_X, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Thanks for following. Here is your link.",
          buttons: [{ type: "web_url", title: "Open link", url: LINK.site }],
        },
      }),
    ],
    edges: [edge("trigger", "follow-1"), edge("follow-1", "message-link", "yes")],
  },
};

const affiliateLinks: AutomationTemplate = {
  id: "ig-affiliate-links",
  name: "Send affiliate product links",
  description: "Include a product card with photos and links from your affiliate collabs.",
  platform: "INSTAGRAM",
  goal: "Sell more",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["where", "link", "code"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you the link", "Check your DMs for the code"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Here is everything from that post, {{first_name|there}}. The code saves you a bit at checkout.",
          imageUrl: "https://example.com/product.jpg",
          buttons: [
            { type: "web_url", title: "Shop the look", url: LINK.shop },
            { type: "web_url", title: "See all links", url: LINK.site },
          ],
        },
      }),
      node("tag-1", 0, STEP_Y * 2, { type: "add_tag", tag: "affiliate click" }),
    ],
    edges: chain("trigger", "message-1", "tag-1"),
  },
};

const guidedConversation: AutomationTemplate = {
  id: "ig-guided-conversation",
  name: "Guide the conversation",
  description: "Collect what you need, pitch the offer and point people at the right product.",
  platform: "INSTAGRAM",
  goal: "Engage your audience",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["help", "info", "start"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-goal", 0, STEP_Y, {
        type: "ask_question",
        prompt: {
          text: "Happy to help, {{first_name|there}}. What brings you here today?",
          quickReplies: [
            { title: "Buying something", payload: "qr:0" },
            { title: "Working together", payload: "qr:1" },
            { title: "Something else", payload: "qr:2" },
          ],
        },
        saveTo: "intent",
        validation: "none",
        maxRetries: 1,
      }),
      node("ask-budget", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: {
          text: "Got it. Roughly what budget are you working with?",
          quickReplies: [
            { title: "Under 100", payload: "qr:0" },
            { title: "100 to 500", payload: "qr:1" },
            { title: "500 plus", payload: "qr:2" },
          ],
        },
        saveTo: "budget",
        validation: "none",
        maxRetries: 1,
      }),
      node("tag-1", 0, STEP_Y * 3, { type: "add_tag", tag: "qualified" }),
      node("message-1", 0, STEP_Y * 4, {
        type: "send_message",
        message: {
          text: "Thanks. Based on that, this is where I would start.",
          buttons: [
            { type: "web_url", title: "See the options", url: LINK.shop },
            { type: "web_url", title: "Talk to a human", url: LINK.booking },
          ],
        },
      }),
    ],
    edges: chain("trigger", "ask-goal", "ask-budget", "tag-1", "message-1"),
  },
};

const commentReplyInDm: AutomationTemplate = {
  id: "ig-auto-reply-comment-in-dm",
  name: "Auto-reply to comment in DM",
  description: "Send a product lineup in Instagram DMs.",
  platform: "INSTAGRAM",
  goal: "Sell more",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["shop", "price", "want"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you the lineup", "Just DMed you"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Here is the lineup, {{first_name|there}}. Tap whichever one you had your eye on.",
          buttons: [
            { type: "web_url", title: "Best seller", url: LINK.shop },
            { type: "web_url", title: "New arrivals", url: LINK.shop },
            { type: "web_url", title: "See everything", url: LINK.site },
          ],
        },
      }),
    ],
    edges: chain("trigger", "message-1"),
  },
};

const autoSendLinksInDm: AutomationTemplate = {
  id: "ig-auto-send-links-in-dm",
  name: "Auto-send links in DM",
  description: "Send followers to your website instead of saying link in bio.",
  platform: "INSTAGRAM",
  goal: "Drive traffic",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["link", "website", "bio"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "No hunting through the bio. Here is the link.",
          buttons: [{ type: "web_url", title: "Open link", url: LINK.site }],
        },
      }),
      node("tag-1", 0, STEP_Y * 2, { type: "add_tag", tag: "link sent" }),
    ],
    edges: chain("trigger", "message-1", "tag-1"),
  },
};

const followFirstThenFreebie: AutomationTemplate = {
  id: "ig-follow-first-then-freebie",
  name: "Follow first, then freebie",
  description: "The freebie goes to followers. Everyone else is asked to follow first.",
  platform: "INSTAGRAM",
  goal: "Grow your followers",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["free", "guide", "freebie"],
  followGate: true,
  publicReplyEnabled: true,
  publicReplies: ["Check your DMs", "Sent it over"],
  flow: {
    nodes: [
      TRIGGER,
      node("follow-1", 0, STEP_Y, {
        type: "condition_follow",
        retryPrompt: `The freebie is for followers. Follow ${ACCOUNT_PLACEHOLDER}, then tap below and it is yours.`,
      }),
      node("tag-1", -BRANCH_X, STEP_Y * 2, { type: "add_tag", tag: "freebie" }),
      node("message-1", -BRANCH_X, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "Thanks for following. Here is the freebie.",
          buttons: [{ type: "web_url", title: "Download it", url: LINK.guide }],
        },
      }),
    ],
    edges: [edge("trigger", "follow-1"), edge("follow-1", "tag-1", "yes"), edge("tag-1", "message-1")],
  },
};

const growEmailList: AutomationTemplate = {
  id: "ig-grow-email-list",
  name: "Grow your email list",
  description: "Collect emails on Instagram with a freebie offer.",
  platform: "INSTAGRAM",
  goal: "Capture leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["guide", "free", "send"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you a DM", "Check your messages"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, the free guide is ready. Tap below and I will email it to you.",
          buttons: [{ type: "postback", title: "Get it", payload: "btn:0" }],
        },
      }),
      node("ask-email", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: { text: "What email should I send it to?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "That does not look like an email address. Could you type it again?",
        maxRetries: 2,
      }),
      node("tag-1", 0, STEP_Y * 3, { type: "add_tag", tag: "lead" }),
      node("message-2", 0, STEP_Y * 4, {
        type: "send_message",
        message: { text: "Thanks. It is on its way to {{email|your inbox}}." },
      }),
    ],
    edges: [edge("trigger", "message-1"), edge("message-1", "ask-email", "btn:0"), ...chain("ask-email", "tag-1", "message-2")],
  },
};

const runGiveaway: AutomationTemplate = {
  id: "ig-run-giveaway",
  name: "Run a giveaway",
  description: "Run a giveaway to grow Instagram followers. Every comment is an entry.",
  platform: "INSTAGRAM",
  goal: "Engage your audience",
  triggerType: "COMMENT",
  matchMode: "ANY",
  keywords: [],
  followGate: true,
  publicReplyEnabled: true,
  publicReplies: ["You are in", "Entry received, good luck"],
  flow: {
    nodes: [
      TRIGGER,
      node("follow-1", 0, STEP_Y, {
        type: "condition_follow",
        retryPrompt: `Entries are for followers. Follow ${ACCOUNT_PLACEHOLDER}, then tap below to enter.`,
      }),
      node("tag-1", -BRANCH_X, STEP_Y * 2, { type: "add_tag", tag: "giveaway" }),
      node("message-1", -BRANCH_X, STEP_Y * 3, {
        type: "send_message",
        message: { text: "You are entered, {{first_name|there}}. The winner goes up on the page, so keep an eye out." },
      }),
    ],
    edges: [edge("trigger", "follow-1"), edge("follow-1", "tag-1", "yes"), edge("tag-1", "message-1")],
  },
};

const routeDmQuestions: AutomationTemplate = {
  id: "ig-route-dm-questions",
  name: "Recognize questions in DM",
  description: "Identify and respond to the questions people ask most.",
  platform: "INSTAGRAM",
  goal: "Engage your audience",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["price", "shipping", "how", "when", "where"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-topic", 0, STEP_Y, {
        type: "ask_question",
        prompt: {
          text: "Good question, {{first_name|there}}. Which one is it?",
          quickReplies: [
            { title: "Pricing", payload: "qr:0" },
            { title: "Shipping", payload: "qr:1" },
            { title: "Returns", payload: "qr:2" },
            { title: "Something else", payload: "qr:3" },
          ],
        },
        saveTo: "topic",
        validation: "none",
        maxRetries: 1,
      }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Here is the answer, and the full FAQ in case something else comes up.",
          buttons: [
            { type: "web_url", title: "Read the FAQ", url: LINK.site },
            { type: "web_url", title: "Talk to a human", url: LINK.booking },
          ],
        },
      }),
    ],
    edges: chain("trigger", "ask-topic", "message-1"),
  },
};

const gamifyLive: AutomationTemplate = {
  id: "ig-gamify-live",
  name: "Gamify Instagram live",
  description: "Turn comments during a live into DMs, entries and links.",
  platform: "INSTAGRAM",
  goal: "Engage your audience",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["play", "me", "live"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["You are playing", "Sent you the next step"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "live player" }),
      node("ask-answer", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: {
          text: "You are in the game, {{first_name|there}}. Lock in your answer.",
          quickReplies: [
            { title: "A", payload: "qr:0" },
            { title: "B", payload: "qr:1" },
            { title: "C", payload: "qr:2" },
          ],
        },
        saveTo: "live_answer",
        validation: "none",
        maxRetries: 1,
      }),
      node("message-1", 0, STEP_Y * 3, {
        type: "send_message",
        message: { text: "Locked in. Stay on the live, the winners go up at the end." },
      }),
    ],
    edges: chain("trigger", "tag-1", "ask-answer", "message-1"),
  },
};

const collabsFromStoryReplies: AutomationTemplate = {
  id: "ig-collabs-from-story-replies",
  name: "Get more collabs from story replies",
  description: "When your story sparks collab requests, the automation has the answers.",
  platform: "INSTAGRAM",
  goal: "Capture leads",
  triggerType: "STORY_REPLY",
  matchMode: "CONTAINS",
  keywords: ["collab", "work", "partner"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "collab" }),
      node("ask-brand", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: { text: "Love that. Who are you with?" },
        saveTo: "brand",
        validation: "none",
        maxRetries: 1,
      }),
      node("ask-email", 0, STEP_Y * 3, {
        type: "ask_question",
        prompt: { text: "And the best email to send the media kit to?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "That does not look like an email address. One more go?",
        maxRetries: 2,
      }),
      node("message-1", 0, STEP_Y * 4, {
        type: "send_message",
        message: {
          text: "Thanks. The kit is heading to {{email|your inbox}} and I will follow up personally.",
          buttons: [{ type: "web_url", title: "Book a call", url: LINK.booking }],
        },
      }),
    ],
    edges: chain("trigger", "tag-1", "ask-brand", "ask-email", "message-1"),
  },
};

const couponsInStories: AutomationTemplate = {
  id: "ig-coupons-in-stories",
  name: "Give coupons in stories",
  description: "Someone watched your story? Treat them like a VIP with a coupon by DM.",
  platform: "INSTAGRAM",
  goal: "Sell more",
  triggerType: "STORY_REPLY",
  matchMode: "CONTAINS",
  keywords: ["code", "coupon", "vip"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "coupon" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Story watchers get the better price. Use VIP15 at checkout.",
          buttons: [{ type: "web_url", title: "Use the code", url: LINK.shop }],
        },
      }),
    ],
    edges: chain("trigger", "tag-1", "message-1"),
  },
};

const offersDuringLive: AutomationTemplate = {
  id: "ig-offers-during-live",
  name: "Send offers in DMs during live",
  description: "Every where is this from moment is a missed sale unless the DM goes out.",
  platform: "INSTAGRAM",
  goal: "Sell more",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["where", "buy", "want"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you the link", "In your DMs now"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Live price only, {{first_name|there}}. It goes back up when the stream ends.",
          buttons: [{ type: "web_url", title: "Buy at live price", url: LINK.shop }],
        },
      }),
      node("delay-1", 0, STEP_Y * 2, { type: "delay", seconds: 900 }),
      node("message-2", 0, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "Still on the fence? The live price has a few minutes left.",
          buttons: [{ type: "web_url", title: "Grab it", url: LINK.shop }],
        },
      }),
    ],
    edges: chain("trigger", "message-1", "delay-1", "message-2"),
  },
};

const sellFromReelComments: AutomationTemplate = {
  id: "ig-sell-from-reel-comments",
  name: "Sell from Reel comments",
  description: "A reel got people talking. Slide into their DMs with something worth buying.",
  platform: "INSTAGRAM",
  goal: "Sell more",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["want", "price", "shop"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you the details", "Check your DMs"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "That is the one from the reel, {{first_name|there}}.",
          imageUrl: "https://example.com/product.jpg",
          buttons: [{ type: "web_url", title: "See the details", url: LINK.shop }],
        },
      }),
      node("delay-1", 0, STEP_Y * 2, { type: "delay", seconds: 86400 }),
      node("message-2", 0, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "No rush, just checking you saw this. Any questions, reply here.",
          buttons: [{ type: "web_url", title: "Take another look", url: LINK.shop }],
        },
      }),
    ],
    edges: chain("trigger", "message-1", "delay-1", "message-2"),
  },
};

const commentsToRsvp: AutomationTemplate = {
  id: "ig-comments-to-rsvp",
  name: "Turn comments into RSVPs",
  description: "Comment to join becomes you are registered. No forms, no fuss.",
  platform: "INSTAGRAM",
  goal: "Capture leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["join", "rsvp", "going"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["You are on the list", "Saved you a seat"],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-email", 0, STEP_Y, {
        type: "ask_question",
        prompt: { text: "Saving you a seat, {{first_name|there}}. Where should the joining link go?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "That does not look like an email address. Could you type it again?",
        maxRetries: 2,
      }),
      node("tag-1", 0, STEP_Y * 2, { type: "add_tag", tag: "rsvp" }),
      node("message-1", 0, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "You are registered. The link is on its way to {{email|your inbox}}.",
          buttons: [{ type: "web_url", title: "Add to calendar", url: LINK.rsvp }],
        },
      }),
    ],
    edges: chain("trigger", "ask-email", "tag-1", "message-1"),
  },
};

const qualifyWithQuiz: AutomationTemplate = {
  id: "ig-qualify-with-quiz",
  name: "Qualify with a quiz",
  description: "People love talking about themselves. Quiz them, tag them and send the right thing.",
  platform: "INSTAGRAM",
  goal: "Capture leads",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["quiz", "which", "help me"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-level", 0, STEP_Y, {
        type: "ask_question",
        prompt: {
          text: "Three quick questions, {{first_name|there}}. Where are you right now?",
          quickReplies: [
            { title: "Just starting", payload: "qr:0" },
            { title: "Some experience", payload: "qr:1" },
            { title: "Doing this a while", payload: "qr:2" },
          ],
        },
        saveTo: "level",
        validation: "none",
        maxRetries: 1,
      }),
      node("ask-goal", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: {
          text: "And what would make the biggest difference?",
          quickReplies: [
            { title: "More reach", payload: "qr:0" },
            { title: "More sales", payload: "qr:1" },
            { title: "More time", payload: "qr:2" },
          ],
        },
        saveTo: "goal",
        validation: "none",
        maxRetries: 1,
      }),
      node("tag-1", 0, STEP_Y * 3, { type: "add_tag", tag: "quiz" }),
      node("message-1", 0, STEP_Y * 4, {
        type: "send_message",
        message: {
          text: "Based on your answers, start here.",
          buttons: [{ type: "web_url", title: "See your result", url: LINK.site }],
        },
      }),
    ],
    edges: chain("trigger", "ask-level", "ask-goal", "tag-1", "message-1"),
  },
};

const dmYourCourse: AutomationTemplate = {
  id: "ig-dm-your-course",
  name: "DM your course like a closer",
  description: "Give followers early access to a launch without the launch day chaos.",
  platform: "INSTAGRAM",
  goal: "Sell more",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["course", "enroll", "waitlist"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you early access", "Check your DMs"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "course interest" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Doors open tomorrow, but you get in now, {{first_name|there}}.",
          buttons: [{ type: "web_url", title: "Get early access", url: LINK.course }],
        },
      }),
      node("delay-1", 0, STEP_Y * 3, { type: "delay", seconds: 172800 }),
      node("message-2", 0, STEP_Y * 4, {
        type: "send_message",
        message: {
          text: "Early access closes tonight. Any questions before it does, reply here.",
          buttons: [{ type: "web_url", title: "Enroll now", url: LINK.course }],
        },
      }),
    ],
    edges: chain("trigger", "tag-1", "message-1", "delay-1", "message-2"),
  },
};

const dmsDuringIgLive: AutomationTemplate = {
  id: "ig-dms-during-live",
  name: "Trigger DMs during IG Live",
  description: "Use lives to spark DMs, drop links and collect leads while people are watching.",
  platform: "INSTAGRAM",
  goal: "Capture leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["live", "info", "send"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent it to your DMs", "Check your messages"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "live viewer" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Here is what I mentioned on the live, {{first_name|there}}.",
          buttons: [
            { type: "web_url", title: "Open the link", url: LINK.site },
            { type: "postback", title: "Email it to me", payload: "btn:1" },
          ],
        },
      }),
      node("ask-email", BRANCH_X, STEP_Y * 3, {
        type: "ask_question",
        prompt: { text: "Sure. What email should it go to?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "That does not look like an email address. One more go?",
        maxRetries: 2,
      }),
      node("message-2", BRANCH_X, STEP_Y * 4, {
        type: "send_message",
        message: { text: "Sent to {{email|your inbox}}. Enjoy the rest of the live." },
      }),
    ],
    edges: [edge("trigger", "tag-1"), edge("tag-1", "message-1"), edge("message-1", "ask-email", "btn:1"), edge("ask-email", "message-2")],
  },
};

const faqFromStoryReplies: AutomationTemplate = {
  id: "ig-faq-from-story-replies",
  name: "Answer FAQs from story replies",
  description: "Reply to your followers questions as soon as they ask them.",
  platform: "INSTAGRAM",
  goal: "Engage your audience",
  triggerType: "STORY_REPLY",
  matchMode: "ANY",
  keywords: [],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-topic", 0, STEP_Y, {
        type: "ask_question",
        prompt: {
          text: "Thanks for replying, {{first_name|there}}. What can I help with?",
          quickReplies: [
            { title: "Pricing", payload: "qr:0" },
            { title: "Availability", payload: "qr:1" },
            { title: "Something else", payload: "qr:2" },
          ],
        },
        saveTo: "topic",
        validation: "none",
        maxRetries: 1,
      }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Here is the answer. If it is something else, reply and a human picks it up.",
          buttons: [{ type: "web_url", title: "Read the FAQ", url: LINK.site }],
        },
      }),
    ],
    edges: chain("trigger", "ask-topic", "message-1"),
  },
};

const welcomeFirstDm: AutomationTemplate = {
  id: "ig-welcome-first-dm",
  name: "Welcome a first DM",
  description: "Greet someone the first time they message, and set expectations on replies.",
  platform: "INSTAGRAM",
  goal: "Engage your audience",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["hi", "hello", "hey"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, thanks for the message. We read every DM and usually reply within a few hours.",
          buttons: [{ type: "web_url", title: "Have a look around", url: LINK.site }],
        },
      }),
      node("tag-1", 0, STEP_Y * 2, { type: "add_tag", tag: "new dm" }),
    ],
    edges: chain("trigger", "message-1", "tag-1"),
  },
};

const waitlistFromComments: AutomationTemplate = {
  id: "ig-waitlist-from-comments",
  name: "Build a waitlist from comments",
  description: "Turn a comment into a name on the list before the thing is even out.",
  platform: "INSTAGRAM",
  goal: "Capture leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["waitlist", "notify", "me"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["You are on the list", "Added, check your DMs"],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-email", 0, STEP_Y, {
        type: "ask_question",
        prompt: { text: "Adding you now, {{first_name|there}}. Where should the launch note go?" },
        saveTo: "email",
        validation: "email",
        retryPrompt: "That does not look like an email address. Could you type it again?",
        maxRetries: 2,
      }),
      node("tag-1", 0, STEP_Y * 2, { type: "add_tag", tag: "waitlist" }),
      node("message-1", 0, STEP_Y * 3, {
        type: "send_message",
        message: { text: "You are on the list. You will hear from us before anyone else does." },
      }),
    ],
    edges: chain("trigger", "ask-email", "tag-1", "message-1"),
  },
};

const aiConversations: AutomationTemplate = {
  id: "ig-ai-conversations",
  name: "Let AI handle the conversation",
  description: "Your agent answers in your own words, collects what you need and hands over when it cannot help.",
  platform: "INSTAGRAM",
  goal: "Engage your audience",
  triggerType: "DM",
  matchMode: "ANY",
  keywords: [],
  followGate: false,
  popular: true,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("ai-1", 0, STEP_Y, { type: "ai_reply", agentId: AGENT_PLACEHOLDER, maxTurns: 6 }),
      node("tag-done", -BRANCH_X, STEP_Y * 2, { type: "add_tag", tag: "answered by ai" }),
      node("tag-human", BRANCH_X, STEP_Y * 2, { type: "add_tag", tag: "needs a human" }),
      node("message-human", BRANCH_X, STEP_Y * 3, {
        type: "send_message",
        message: { text: "Let me get someone from the team on this. They will reply here shortly." },
      }),
    ],
    edges: [
      edge("trigger", "ai-1"),
      edge("ai-1", "tag-done", "next"),
      edge("ai-1", "tag-human", "handoff"),
      edge("tag-human", "message-human"),
    ],
  },
};

const aiQuestionsFromComments: AutomationTemplate = {
  id: "ig-ai-questions-from-comments",
  name: "Answer comment questions with AI",
  description: "A question under a post becomes a real answer in the DM, written by your agent.",
  platform: "INSTAGRAM",
  goal: "Sell more",
  triggerType: "COMMENT",
  matchMode: "ANY",
  keywords: [],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Just answered you in the DMs", "Sent you a message"],
  flow: {
    nodes: [
      TRIGGER,
      node("ai-1", 0, STEP_Y, {
        type: "ai_reply",
        agentId: AGENT_PLACEHOLDER,
        instruction: "They asked this under a post. Answer the question, then offer the link if it helps.",
        maxTurns: 4,
      }),
      node("tag-human", BRANCH_X, STEP_Y * 2, { type: "add_tag", tag: "needs a human" }),
      node("message-human", BRANCH_X, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "I want to get this right, so I am passing you to the team. They will reply here.",
          buttons: [{ type: "web_url", title: "Meanwhile, the FAQ", url: LINK.site }],
        },
      }),
    ],
    edges: [edge("trigger", "ai-1"), edge("ai-1", "tag-human", "handoff"), edge("tag-human", "message-human")],
  },
};

export const INSTAGRAM_TEMPLATES: readonly AutomationTemplate[] = [
  autoDmLinks,
  leadsFromStories,
  respondToAllDms,
  growFollowersFromComments,
  affiliateLinks,
  guidedConversation,
  commentReplyInDm,
  autoSendLinksInDm,
  followFirstThenFreebie,
  growEmailList,
  runGiveaway,
  routeDmQuestions,
  gamifyLive,
  collabsFromStoryReplies,
  couponsInStories,
  offersDuringLive,
  sellFromReelComments,
  commentsToRsvp,
  qualifyWithQuiz,
  dmYourCourse,
  dmsDuringIgLive,
  faqFromStoryReplies,
  welcomeFirstDm,
  waitlistFromComments,
  aiConversations,
  aiQuestionsFromComments,
];
