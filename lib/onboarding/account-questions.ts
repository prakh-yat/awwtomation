/**
 * The questions asked about an account right after it is connected, saved on
 * the channel (`Channel.setupAnswers`, keyed by question id).
 *
 * They describe the account rather than the person, which is why they are
 * asked per account and not in the welcome flow: one workspace can hold an
 * Instagram account and a Facebook Page that do different jobs. The goals are
 * the template gallery's own, so an answer can open the gallery on it.
 */
import {
  Briefcase,
  CalendarCheck,
  CircleDashed,
  Handshake,
  Magnet,
  MessagesSquare,
  MonitorPlay,
  MousePointerClick,
  Package,
  Shapes,
  ShoppingBag,
  Star,
  Store,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { TEMPLATE_GOALS, type TemplateGoal } from "@/lib/services/templates/kit";

import { sanitizeWith, type Answers, type QuestionShape } from "./questions";

export type AccountQuestion = QuestionShape & {
  /** The question as asked, naming the account it is about (its @handle or Page name). */
  title: (account: string) => string;
};

export const ACCOUNT_TYPE: AccountQuestion = {
  id: "account_type",
  kind: "single",
  title: (account) => `What is ${account}?`,
  options: [
    { value: "business", label: "A business or brand", icon: Store },
    { value: "creator", label: "A creator or public figure", icon: Star },
    { value: "professional", label: "A coach, consultant or freelancer", icon: Briefcase },
    { value: "other", label: "Something else", icon: Shapes },
  ],
};

export const MONETIZATION: AccountQuestion = {
  id: "monetization",
  kind: "multi",
  title: () => "How does it make money?",
  exclusive: "none",
  options: [
    { value: "physical", label: "Physical products", icon: Package },
    { value: "digital", label: "Digital products or courses", icon: MonitorPlay },
    { value: "services", label: "Services or bookings", icon: CalendarCheck },
    { value: "partnerships", label: "Brand deals and affiliate links", icon: Handshake },
    { value: "none", label: "Not yet", icon: CircleDashed },
  ],
};

/**
 * Stable ids for the gallery's goals, so a reworded label never orphans a
 * saved answer. Keyed by the goal, so a goal added to the gallery fails the
 * type check here until it has an id.
 */
const GOAL_IDS: Record<TemplateGoal, string> = {
  "Grow your followers": "followers",
  "Engage your audience": "engage",
  "Drive traffic": "traffic",
  "Capture leads": "leads",
  "Sell more": "sell",
};

/** The same marks the template gallery gives each goal. */
const GOAL_ICONS: Record<TemplateGoal, LucideIcon> = {
  "Grow your followers": UserPlus,
  "Engage your audience": MessagesSquare,
  "Drive traffic": MousePointerClick,
  "Capture leads": Magnet,
  "Sell more": ShoppingBag,
};

export const GOALS: AccountQuestion = {
  id: "goals",
  kind: "multi",
  title: () => "What should it do first?",
  options: TEMPLATE_GOALS.map((goal) => ({ value: GOAL_IDS[goal], label: goal, icon: GOAL_ICONS[goal] })),
};

/** In the order they are asked. */
export const ACCOUNT_QUESTIONS: readonly AccountQuestion[] = [ACCOUNT_TYPE, MONETIZATION, GOALS];

/** The goal answers that stand for `goals`, in the gallery's order. */
export function goalIdsFor(goals: readonly TemplateGoal[]): string[] {
  return TEMPLATE_GOALS.filter((goal) => goals.includes(goal)).map((goal) => GOAL_IDS[goal]);
}

/**
 * The questions as one account is asked them: its goals narrowed to `goalIds`,
 * the goals its platform has templates for, so no answer leads to an empty
 * gallery.
 */
export function accountQuestionsFor(goalIds: readonly string[]): AccountQuestion[] {
  return ACCOUNT_QUESTIONS.map((question) =>
    question.id === GOALS.id ? { ...question, options: question.options.filter((option) => goalIds.includes(option.value)) } : question,
  );
}

/** An account's answers, cleaned (see `sanitizeWith`). */
export function sanitizeAccountAnswers(input: unknown): Answers {
  return sanitizeWith(ACCOUNT_QUESTIONS, input);
}

/**
 * The answer Instagram's own account type implies. Only professional accounts
 * can connect, so anything but these two suggests nothing.
 */
export function accountTypeFromInstagram(accountType: string | undefined): string | null {
  if (accountType === "BUSINESS") return "business";
  if (accountType === "MEDIA_CREATOR") return "creator";
  return null;
}

/** The gallery goal a goal answer (or a `?goal=` parameter) stands for. */
export function templateGoalFor(id: string | null | undefined): TemplateGoal | null {
  return TEMPLATE_GOALS.find((goal) => GOAL_IDS[goal] === id) ?? null;
}
