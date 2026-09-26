/**
 * The questions asked while setting up, and the rules every answer follows.
 *
 * There are three sets. The welcome flow asks about the person (their role,
 * how they heard about us), stored on `User.profileAnswers` and asked once
 * whichever workspace they set up next, and about the workspace (who it is
 * for), stored on `Workspace.onboardingAnswers`. Each account is asked about
 * itself right after it is connected (account-questions.ts), stored on
 * `Channel.setupAnswers`. All are plain JSON keyed by question id, and all
 * pass through `sanitizeWith` before they are saved or read back.
 */
import {
  Briefcase,
  Building2,
  Code,
  Facebook,
  GraduationCap,
  Handshake,
  Headset,
  Instagram,
  Megaphone,
  Music2,
  Search,
  Shapes,
  Sparkles,
  Star,
  User,
  Users,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import { brand } from "@/lib/brand";

export type QuestionKind = "single" | "multi";

export type QuestionOption = { value: string; label: string; icon: LucideIcon };

/** What every question has, whatever its title looks like. */
export type QuestionShape = {
  id: string;
  kind: QuestionKind;
  options: readonly QuestionOption[];
  /**
   * A multi-choice option that stands alone, such as "Not yet": choosing it
   * clears the others, and choosing another clears it.
   */
  exclusive?: string;
};

export type Question = QuestionShape & {
  /** The question itself, above the options. */
  title: string;
};

export type Answers = Record<string, string | string[]>;

const accountFor: Question = {
  id: "account_for",
  kind: "single",
  title: "Who is this workspace for?",
  options: [
    { value: "myself", label: "For myself", icon: User },
    { value: "employer", label: "For my employer", icon: Briefcase },
    { value: "client", label: "For a client", icon: Handshake },
  ],
};

/** The welcome flow's question about the workspace. */
export const WORKSPACE_QUESTIONS: readonly Question[] = [accountFor];

const role: Question = {
  id: "role",
  kind: "single",
  title: "What best describes your role?",
  options: [
    { value: "founder", label: "Business owner or founder", icon: Building2 },
    { value: "marketing", label: "Marketing or social media", icon: Megaphone },
    { value: "creator", label: "Creator or influencer", icon: Star },
    { value: "agency", label: "Agency or freelancer", icon: Briefcase },
    { value: "sales_support", label: "Sales or customer support", icon: Headset },
    { value: "coach", label: "Coach, consultant or educator", icon: GraduationCap },
    { value: "developer", label: "Developer", icon: Code },
    { value: "other", label: "Something else", icon: Shapes },
  ],
};

const heardFrom: Question = {
  id: "heard_from",
  kind: "single",
  title: `How did you hear about ${brand.name}?`,
  options: [
    { value: "instagram", label: "Instagram", icon: Instagram },
    { value: "facebook", label: "Facebook", icon: Facebook },
    { value: "tiktok", label: "TikTok", icon: Music2 },
    { value: "youtube", label: "YouTube", icon: Youtube },
    { value: "search", label: "Google or another search engine", icon: Search },
    { value: "ai", label: "ChatGPT or another AI assistant", icon: Sparkles },
    { value: "referral", label: "A friend or colleague", icon: Users },
    { value: "other", label: "Somewhere else", icon: Shapes },
  ],
};

/** The welcome flow's questions about the person, asked before the workspace one. */
export const PROFILE_QUESTIONS: readonly Question[] = [role, heardFrom];

/** True when the question has an answer that lets the flow move on. */
export function isAnswered(question: QuestionShape, answers: Answers): boolean {
  const value = answers[question.id];
  if (question.kind === "single") return typeof value === "string" && value.length > 0;
  return Array.isArray(value) && value.length > 0;
}

/** The answers after `value` is picked, or unpicked when a multi-choice option was already on. */
export function toggleAnswer(question: QuestionShape, answers: Answers, value: string): Answers {
  if (question.kind === "single") return { ...answers, [question.id]: value };
  const current = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]) : [];
  let next: string[];
  if (current.includes(value)) next = current.filter((v) => v !== value);
  else if (value === question.exclusive) next = [value];
  else next = [...current.filter((v) => v !== question.exclusive), value];
  return { ...answers, [question.id]: next };
}

/**
 * Drops anything that is not one of `questions` or one of its options, so a
 * stale client or a hand-edited request cannot write junk. An exclusive option
 * sent together with others gives way to them: the specific answers are the
 * ones worth keeping.
 */
export function sanitizeWith(questions: readonly QuestionShape[], input: unknown): Answers {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers: Answers = {};
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    const question = byId.get(id);
    if (!question) continue;
    const allowed = new Set(question.options.map((o) => o.value));
    if (question.kind === "single") {
      if (typeof value === "string" && allowed.has(value)) answers[id] = value;
      continue;
    }
    if (!Array.isArray(value)) continue;
    let picked = Array.from(new Set(value.filter((v): v is string => typeof v === "string" && allowed.has(v))));
    if (question.exclusive && picked.length > 1) picked = picked.filter((v) => v !== question.exclusive);
    if (picked.length > 0) answers[id] = picked;
  }
  return answers;
}

/** The workspace's welcome answers, cleaned (see `sanitizeWith`). */
export function sanitizeAnswers(input: unknown): Answers {
  return sanitizeWith(WORKSPACE_QUESTIONS, input);
}

/** A person's welcome answers, cleaned (see `sanitizeWith`). */
export function sanitizeProfileAnswers(input: unknown): Answers {
  return sanitizeWith(PROFILE_QUESTIONS, input);
}
