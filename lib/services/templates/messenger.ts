/**
 * Messenger templates, for a connected Facebook Page.
 *
 * Two differences from the Instagram set: there are no story replies, and
 * there is no follow gate, so nothing here branches on whether the person
 * follows the account.
 */
import { AGENT_PLACEHOLDER, BRANCH_X, chain, edge, LINK, node, STEP_Y, TRIGGER, type AutomationTemplate } from "./kit";

const autoReplyToComments: AutomationTemplate = {
  id: "fb-auto-reply-to-comments",
  name: "Auto-reply to Page comments",
  description: "Send a link in Messenger when someone comments on a Page post.",
  platform: "MESSENGER",
  goal: "Drive traffic",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["link", "info"],
  followGate: false,
  popular: true,
  publicReplyEnabled: true,
  publicReplies: ["Sent you a message", "Check your inbox"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, thanks for commenting. Here is the link.",
          buttons: [{ type: "web_url", title: "Open link", url: LINK.site }],
        },
      }),
    ],
    edges: chain("trigger", "message-1"),
  },
};

const respondToEveryMessage: AutomationTemplate = {
  id: "fb-respond-to-every-message",
  name: "Respond to every message",
  description: "Answer the moment someone messages the Page, then point them the right way.",
  platform: "MESSENGER",
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
          text: "Thanks for the message, {{first_name|there}}. What can we help with?",
          quickReplies: [
            { title: "Prices", payload: "qr:0" },
            { title: "Opening hours", payload: "qr:1" },
            { title: "Talk to someone", payload: "qr:2" },
          ],
        },
      }),
      node("message-prices", -BRANCH_X * 1.5, STEP_Y * 2, {
        type: "send_message",
        message: { text: "Here is the full price list.", buttons: [{ type: "web_url", title: "See pricing", url: LINK.pricing }] },
      }),
      node("message-hours", 0, STEP_Y * 2, {
        type: "send_message",
        message: { text: "We are open Monday to Friday, 9am to 6pm." },
      }),
      node("message-human", BRANCH_X * 1.5, STEP_Y * 2, {
        type: "send_message",
        message: { text: "Someone will reply here shortly.", buttons: [{ type: "web_url", title: "Book a call", url: LINK.booking }] },
      }),
    ],
    edges: [
      edge("trigger", "message-1"),
      edge("message-1", "message-prices", "qr:0"),
      edge("message-1", "message-hours", "qr:1"),
      edge("message-1", "message-human", "qr:2"),
    ],
  },
};

const collectEmails: AutomationTemplate = {
  id: "fb-collect-emails",
  name: "Collect emails in Messenger",
  description: "Offer something worth an email address, then save it on the contact.",
  platform: "MESSENGER",
  goal: "Capture leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["guide", "free", "send"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you a message", "Check your inbox"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, the guide is ready. Tap below and we will email it over.",
          buttons: [{ type: "postback", title: "Get it", payload: "btn:0" }],
        },
      }),
      node("ask-email", 0, STEP_Y * 2, {
        type: "ask_question",
        prompt: { text: "What email should we send it to?" },
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

const answerFaqs: AutomationTemplate = {
  id: "fb-answer-faqs",
  name: "Answer FAQs in Messenger",
  description: "Answer the questions that come in every day.",
  platform: "MESSENGER",
  goal: "Engage your audience",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["hours", "where", "how", "delivery"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-topic", 0, STEP_Y, {
        type: "ask_question",
        prompt: {
          text: "Happy to help, {{first_name|there}}. Which is it?",
          quickReplies: [
            { title: "Opening hours", payload: "qr:0" },
            { title: "Where you are", payload: "qr:1" },
            { title: "Delivery", payload: "qr:2" },
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
          text: "Here is the answer, plus the full FAQ in case something else comes up.",
          buttons: [{ type: "web_url", title: "Read the FAQ", url: LINK.site }],
        },
      }),
    ],
    edges: chain("trigger", "ask-topic", "message-1"),
  },
};

const answerPriceQuestions: AutomationTemplate = {
  id: "fb-answer-price-questions",
  name: "Answer price questions",
  description: "When a message asks about price, reply with the list and a way to get in touch.",
  platform: "MESSENGER",
  goal: "Sell more",
  triggerType: "DM",
  matchMode: "CONTAINS",
  keywords: ["price", "pricing", "how much", "cost"],
  followGate: false,
  publicReplyEnabled: false,
  publicReplies: [],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Hi {{first_name|there}}, here are our prices. Reply here if you have more questions.",
          buttons: [
            { type: "web_url", title: "See pricing", url: LINK.pricing },
            { type: "web_url", title: "Book a call", url: LINK.booking },
          ],
        },
      }),
      node("tag-1", 0, STEP_Y * 2, { type: "add_tag", tag: "pricing" }),
    ],
    edges: chain("trigger", "message-1", "tag-1"),
  },
};

const bookACall: AutomationTemplate = {
  id: "fb-book-a-call",
  name: "Book a call from a comment",
  description: "Turn interest on a Page post into a booked call.",
  platform: "MESSENGER",
  goal: "Capture leads",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["call", "book", "interested"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you the booking link", "Check your inbox"],
  flow: {
    nodes: [
      TRIGGER,
      node("ask-need", 0, STEP_Y, {
        type: "ask_question",
        prompt: {
          text: "Happy to set that up, {{first_name|there}}. What is it about?",
          quickReplies: [
            { title: "A quote", payload: "qr:0" },
            { title: "A demo", payload: "qr:1" },
            { title: "Something else", payload: "qr:2" },
          ],
        },
        saveTo: "call_reason",
        validation: "none",
        maxRetries: 1,
      }),
      node("tag-1", 0, STEP_Y * 2, { type: "add_tag", tag: "call requested" }),
      node("message-1", 0, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "Pick whatever time suits you.",
          buttons: [{ type: "web_url", title: "Pick a time", url: LINK.booking }],
        },
      }),
    ],
    edges: chain("trigger", "ask-need", "tag-1", "message-1"),
  },
};

const runGiveaway: AutomationTemplate = {
  id: "fb-run-giveaway",
  name: "Run a giveaway",
  description: "Every comment is an entry. Tag the person and confirm it in Messenger.",
  platform: "MESSENGER",
  goal: "Engage your audience",
  triggerType: "COMMENT",
  matchMode: "ANY",
  keywords: [],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["You are in", "Entry received, good luck"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "giveaway" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: { text: "You are entered, {{first_name|there}}. The winner goes up on the Page, so keep an eye out." },
      }),
    ],
    edges: chain("trigger", "tag-1", "message-1"),
  },
};

const productLineup: AutomationTemplate = {
  id: "fb-product-lineup",
  name: "Send your product lineup",
  description: "Reply to a comment with the products people actually ask about.",
  platform: "MESSENGER",
  goal: "Sell more",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["shop", "buy", "want"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you the lineup", "Check your inbox"],
  flow: {
    nodes: [
      TRIGGER,
      node("message-1", 0, STEP_Y, {
        type: "send_message",
        message: {
          text: "Here is the lineup, {{first_name|there}}.",
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

const eventRsvp: AutomationTemplate = {
  id: "fb-event-rsvp",
  name: "Turn comments into RSVPs",
  description: "Register people for an event when they comment. No form needed.",
  platform: "MESSENGER",
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

const welcomeNewConversations: AutomationTemplate = {
  id: "fb-welcome-new-conversations",
  name: "Welcome new conversations",
  description: "Greet people the first time they message, and set expectations on reply times.",
  platform: "MESSENGER",
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
          text: "Hi {{first_name|there}}, thanks for getting in touch. We usually reply within a few hours.",
          buttons: [{ type: "web_url", title: "Browse the site", url: LINK.site }],
        },
      }),
      node("tag-1", 0, STEP_Y * 2, { type: "add_tag", tag: "new conversation" }),
    ],
    edges: chain("trigger", "message-1", "tag-1"),
  },
};

const sendCoupon: AutomationTemplate = {
  id: "fb-send-coupon",
  name: "Send a coupon code",
  description: "Reward a comment with a code, and tag who used it.",
  platform: "MESSENGER",
  goal: "Sell more",
  triggerType: "COMMENT",
  matchMode: "CONTAINS",
  keywords: ["code", "coupon", "discount"],
  followGate: false,
  publicReplyEnabled: true,
  publicReplies: ["Sent you the code", "Check your inbox"],
  flow: {
    nodes: [
      TRIGGER,
      node("tag-1", 0, STEP_Y, { type: "add_tag", tag: "coupon" }),
      node("message-1", 0, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Here you go, {{first_name|there}}. Use SAVE15 at checkout.",
          buttons: [{ type: "web_url", title: "Use the code", url: LINK.shop }],
        },
      }),
    ],
    edges: chain("trigger", "tag-1", "message-1"),
  },
};

const outsideOpeningHours: AutomationTemplate = {
  id: "fb-outside-opening-hours",
  name: "Reply outside opening hours",
  description: "Answer the messages that land overnight, and say when a human will pick them up.",
  platform: "MESSENGER",
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
          text: "Thanks {{first_name|there}}, we are closed right now. Someone picks this up when we open at 9am.",
          quickReplies: [
            { title: "That is fine", payload: "qr:0" },
            { title: "It is urgent", payload: "qr:1" },
          ],
        },
      }),
      node("message-urgent", BRANCH_X, STEP_Y * 2, {
        type: "send_message",
        message: {
          text: "Understood. Leave the details here and we will start with yours in the morning.",
          buttons: [{ type: "web_url", title: "Or book a time", url: LINK.booking }],
        },
      }),
      node("tag-1", BRANCH_X, STEP_Y * 3, { type: "add_tag", tag: "urgent" }),
    ],
    edges: [edge("trigger", "message-1"), edge("message-1", "message-urgent", "qr:1"), edge("message-urgent", "tag-1")],
  },
};

const aiSupport: AutomationTemplate = {
  id: "fb-ai-support",
  name: "Let AI answer support messages",
  description: "Your agent handles the everyday questions and passes anything it should not decide to a person.",
  platform: "MESSENGER",
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
      node("ai-1", 0, STEP_Y, { type: "ai_reply", agentId: AGENT_PLACEHOLDER, maxTurns: 6 }),
      node("tag-done", -BRANCH_X, STEP_Y * 2, { type: "add_tag", tag: "answered by ai" }),
      node("tag-human", BRANCH_X, STEP_Y * 2, { type: "add_tag", tag: "needs a human" }),
      node("message-human", BRANCH_X, STEP_Y * 3, {
        type: "send_message",
        message: {
          text: "Passing this to the team so you get a proper answer. They will reply here.",
          buttons: [{ type: "web_url", title: "Book a call instead", url: LINK.booking }],
        },
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

export const MESSENGER_TEMPLATES: readonly AutomationTemplate[] = [
  autoReplyToComments,
  respondToEveryMessage,
  collectEmails,
  answerFaqs,
  answerPriceQuestions,
  bookACall,
  runGiveaway,
  productLineup,
  eventRsvp,
  welcomeNewConversations,
  sendCoupon,
  outsideOpeningHours,
  aiSupport,
];
