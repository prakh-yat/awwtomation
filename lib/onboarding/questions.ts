/**
 * The welcome questionnaire.
 *
 * Two stages, split by what an answer can actually mean. "Profile" questions
 * describe the person and the brand, so they can be answered before anything is
 * connected. "Usage" questions talk about this account and the channel you
 * connected, which only mean something once a channel is attached, so they wait
 * until the Meta connection comes back.
 */
import {
  AtSign,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Film,
  Globe,
  GraduationCap,
  Handshake,
  Headphones,
  Heart,
  HelpCircle,
  Instagram,
  Facebook,
  LayoutGrid,
  Lightbulb,
  Link2,
  Linkedin,
  Mail,
  Megaphone,
  MessageCircleQuestion,
  MessagesSquare,
  MonitorPlay,
  Package,
  Percent,
  PieChart,
  Receipt,
  Search,
  Settings2,
  Shapes,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Target,
  TrendingUp,
  Twitter,
  User,
  UserPlus,
  Users,
  Video,
  XCircle,
  Youtube,
  type LucideIcon,
} from "lucide-react";

export type QuestionStage = "profile" | "usage";
export type QuestionKind = "single" | "multi";

export type QuestionOption = { value: string; label: string; icon: LucideIcon };

export type Question = {
  id: string;
  stage: QuestionStage;
  kind: QuestionKind;
  /** The question itself, above the options. */
  title: string;
  options: QuestionOption[];
};

export type Answers = Record<string, string | string[]>;

// ───────────────────────── Before connecting ─────────────────────────

const accountFor: Question = {
  id: "account_for",
  stage: "profile",
  kind: "single",
  title: "Who is this account for?",
  options: [
    { value: "employer", label: "For my employer", icon: Briefcase },
    { value: "myself", label: "For myself", icon: Lightbulb },
    { value: "client", label: "For my client", icon: Store },
  ],
};

const accountAbout: Question = {
  id: "account_about",
  stage: "profile",
  kind: "single",
  title: "Who or what is this account about?",
  options: [
    { value: "person", label: "A person", icon: User },
    { value: "business", label: "A business", icon: CircleDollarSign },
    { value: "other", label: "Other", icon: HelpCircle },
  ],
};

const describesYou: Question = {
  id: "describes_you",
  stage: "profile",
  kind: "single",
  title: "What best describes the account owner?",
  options: [
    { value: "coach", label: "Coach, trainer or educator", icon: BookOpen },
    { value: "public_figure", label: "Public figure or celebrity", icon: Star },
    { value: "media", label: "Media personality", icon: Shapes },
    { value: "consultant", label: "Consultant or expert", icon: Store },
    { value: "freelancer", label: "Freelancer or service provider", icon: Users },
    { value: "creator", label: "Creator or influencer", icon: Lightbulb },
  ],
};

// ───────────────────────── After connecting ─────────────────────────

const monetization: Question = {
  id: "monetization",
  stage: "usage",
  kind: "multi",
  title: "How does this account make money?",
  options: [
    { value: "physical", label: "Physical products or services", icon: Package },
    { value: "affiliate", label: "Affiliate marketing", icon: Link2 },
    { value: "none", label: "I do not monetize this account", icon: XCircle },
    { value: "digital", label: "Digital products or services", icon: ShoppingBag },
    { value: "sponsorships", label: "Brand partnerships and sponsorships", icon: Handshake },
    { value: "channel", label: "Channel monetization (YouTube, TikTok, other)", icon: Smartphone },
    { value: "other", label: "Other", icon: HelpCircle },
  ],
};

const platforms: Question = {
  id: "platforms",
  stage: "usage",
  kind: "multi",
  title: "Where do you build your audience?",
  options: [
    { value: "linkedin", label: "LinkedIn", icon: Linkedin },
    { value: "website", label: "Blog or website", icon: Globe },
    { value: "instagram", label: "Instagram", icon: Instagram },
    { value: "tiktok", label: "TikTok", icon: Video },
    { value: "x", label: "X (Twitter)", icon: Twitter },
    { value: "threads", label: "Threads", icon: AtSign },
    { value: "facebook", label: "Facebook", icon: Facebook },
    { value: "youtube", label: "YouTube", icon: Youtube },
    { value: "other", label: "Other", icon: HelpCircle },
  ],
};

const channelUse: Question = {
  id: "channel_use",
  stage: "usage",
  kind: "multi",
  title: "What do you use this account for?",
  options: [
    { value: "support", label: "Customer support and FAQs", icon: Headphones },
    { value: "inquiries", label: "Handling customer inquiries and orders", icon: MessagesSquare },
    { value: "leads", label: "Lead generation and qualification", icon: Target },
    { value: "ads", label: "Running ad campaigns that drive traffic here", icon: TrendingUp },
    { value: "affiliate", label: "Affiliate marketing and referrals", icon: Link2 },
    { value: "selling", label: "Selling products or services", icon: ShoppingCart },
    { value: "promotions", label: "Sending updates and promotions", icon: Percent },
    { value: "memberships", label: "Subscription content and memberships", icon: Mail },
    { value: "payments", label: "Payment processing and invoicing", icon: Receipt },
    { value: "other", label: "Other", icon: HelpCircle },
  ],
};

const planToUse: Question = {
  id: "plan_to_use",
  stage: "usage",
  kind: "multi",
  title: "What do you want to automate?",
  options: [
    { value: "faqs", label: "Automate responses to FAQs and inquiries", icon: MessageCircleQuestion },
    { value: "feedback", label: "Collect feedback and engage customers", icon: Heart },
    { value: "ads", label: "Run ad campaigns that drive traffic to this channel", icon: Megaphone },
    { value: "leads", label: "Capture and qualify leads", icon: UserPlus },
    { value: "orders", label: "Send order updates and confirmations", icon: ClipboardCheck },
    { value: "other", label: "Other", icon: HelpCircle },
  ],
};

const tools: Question = {
  id: "tools",
  stage: "usage",
  kind: "multi",
  title: "What tools do you use to manage this account?",
  options: [
    { value: "scheduling", label: "Call scheduling and appointment booking", icon: CalendarCheck },
    { value: "crm", label: "CRM and email marketing", icon: Settings2 },
    { value: "courses", label: "Online course and digital product platforms", icon: GraduationCap },
    { value: "ai", label: "AI content creation tools", icon: Sparkles },
    { value: "editing", label: "Content creation and editing", icon: Film },
    { value: "ecommerce", label: "E-commerce platforms", icon: ShoppingBag },
    { value: "social", label: "Social media scheduling and management", icon: CalendarDays },
    { value: "analytics", label: "Analytics and reporting", icon: PieChart },
  ],
};

const heardAbout: Question = {
  id: "heard_about",
  stage: "usage",
  kind: "multi",
  title: "How did you hear about us?",
  options: [
    { value: "ai_search", label: "AI search (ChatGPT, Gemini, Claude, Perplexity)", icon: Sparkles },
    { value: "our_channels", label: "Our Instagram or YouTube channels", icon: MonitorPlay },
    { value: "event", label: "At an event", icon: Calendar },
    { value: "search", label: "Search engine (Google, Bing, DuckDuckGo)", icon: Search },
    { value: "creator", label: "From a creator I follow", icon: Users },
    { value: "agency", label: "From an agency", icon: Store },
    { value: "ad", label: "Online advertisement", icon: LayoutGrid },
    { value: "friend", label: "From a friend", icon: Handshake },
    { value: "other", label: "Other (surprise us)", icon: HelpCircle },
  ],
};

export const QUESTIONS: readonly Question[] = [
  accountFor,
  accountAbout,
  describesYou,
  monetization,
  platforms,
  channelUse,
  planToUse,
  tools,
  heardAbout,
];

export const PROFILE_QUESTIONS = QUESTIONS.filter((q) => q.stage === "profile");
export const USAGE_QUESTIONS = QUESTIONS.filter((q) => q.stage === "usage");

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): Question | null {
  return BY_ID.get(id) ?? null;
}

/** True when the question has an answer that lets the flow move on. */
export function isAnswered(question: Question, answers: Answers): boolean {
  const value = answers[question.id];
  if (question.kind === "single") return typeof value === "string" && value.length > 0;
  return Array.isArray(value) && value.length > 0;
}

/**
 * Drops anything that is not a known question or a known option, so a stale
 * client or a hand-edited request cannot write junk onto the workspace.
 */
export function sanitizeAnswers(input: unknown): Answers {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const answers: Answers = {};
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    const question = BY_ID.get(id);
    if (!question) continue;
    const allowed = new Set(question.options.map((o) => o.value));
    if (question.kind === "single") {
      if (typeof value === "string" && allowed.has(value)) answers[id] = value;
    } else if (Array.isArray(value)) {
      const picked = value.filter((v): v is string => typeof v === "string" && allowed.has(v));
      if (picked.length > 0) answers[id] = picked;
    }
  }
  return answers;
}
