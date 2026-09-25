/**
 * The questions asked while setting up, and the rules every answer follows.
 *
 * There are two sets. The welcome flow asks one question about the workspace
 * (below), stored on `Workspace.onboardingAnswers`. Each account is asked about
 * itself right after it is connected (account-questions.ts), stored on
 * `Channel.setupAnswers`. Both are plain JSON keyed by question id, and both
 * pass through `sanitizeWith` before they are saved or read back.
 */
import { Briefcase, Handshake, User, type LucideIcon } from "lucide-react";

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

/** The welcome flow's questions, in order. */
export const WORKSPACE_QUESTIONS: readonly Question[] = [accountFor];

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

/** The welcome answers, cleaned (see `sanitizeWith`). */
export function sanitizeAnswers(input: unknown): Answers {
  return sanitizeWith(WORKSPACE_QUESTIONS, input);
}
