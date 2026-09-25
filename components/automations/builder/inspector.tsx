"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink, MousePointerClick, Plus, Trash2, X } from "lucide-react";
import type { ChannelPlatform } from "@prisma/client";

import { Playground } from "@/components/ai/playground";
import { DmPreview } from "@/components/automations/dm-preview";
import { StageDot } from "@/components/pipelines/stage-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MAX_BUTTON_TEMPLATE_CHARS, MAX_BUTTON_TITLE_CHARS, MAX_BUTTONS, MAX_QUICK_REPLIES, MAX_QUICK_REPLY_TITLE_CHARS, MAX_TEXT_BYTES } from "@/lib/meta/messages";
import {
  ASK_QUESTION_FIELDS,
  DEFAULT_ASK_RETRIES,
  DEFAULT_ASK_RETRY_PROMPT,
  MAX_ASK_RETRIES,
  SAVE_TO_KEY_RE,
  type AnswerValidation,
  type FlowNodeData,
  DEFAULT_AI_TURNS,
} from "@/lib/automation/flow-types";
import type { OutboundButton, OutboundMessage, OutboundQuickReply } from "@/lib/meta/types";
import type { AgentOption } from "@/lib/services/ai";
import type { PipelineSummary } from "@/lib/services/pipelines";
import { cn } from "@/lib/utils";

import { AiStepEditor, type StepTarget } from "./ai-step-editor";
import { charCount, followPromptMessage, renderPreviewMessage, utf8Bytes, type AddableNodeType, type BuilderAction, type BuilderNode } from "./builder-state";
import { STEP_INFO, StepIcon } from "./step-catalog";
import { TONES } from "@/components/ui/tone";

// ───────────────────────── Shared bits ─────────────────────────

const TEMPLATE_VARS: Array<{ token: string; label: string }> = [
  { token: "{{username}}", label: "@username" },
  { token: "{{first_name}}", label: "First name" },
  { token: "{{name}}", label: "Full name" },
];

function Counter({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <span className={cn("tabular-nums", over ? "font-medium text-destructive" : "text-muted-foreground")}>
      {value.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
    </span>
  );
}

/**
 * Instagram caps a DM at 1,000 bytes, and at 640 characters once it has buttons.
 * Show whichever limit is closer so there is one number to watch. For English
 * text that is simply the character count; scripts like Devanagari use several
 * bytes a letter, so the byte limit is the one that bites.
 */
function lengthUsage(text: string, hasButtons: boolean): { value: number; max: number } {
  const bytes = { value: utf8Bytes(text), max: MAX_TEXT_BYTES };
  if (!hasButtons) return bytes;
  const chars = { value: charCount(text), max: MAX_BUTTON_TEMPLATE_CHARS };
  return chars.value / chars.max >= bytes.value / bytes.max ? chars : bytes;
}

function Field({ label, htmlFor, right, children, hint }: { label: string; htmlFor?: string; right?: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px]">
        <Label htmlFor={htmlFor}>{label}</Label>
        {right}
      </div>
      {children}
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A short note in the builder's yellow, for the one thing a step needs you to know. */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-yellow-soft px-3 py-2 text-[12px] leading-relaxed text-ink">{children}</p>;
}

/** Textarea with {{variable}} chips that insert at the caret (falls back to appending). */
function TemplateTextarea({
  id,
  value,
  onChange,
  rows = 5,
  placeholder,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  rows?: number;
  placeholder?: string;
  invalid?: boolean;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  function insertVar(token: string) {
    const el = ref.current;
    if (!el) {
      onChange(`${value}${token}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <>
      <Textarea id={id} ref={ref} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className="text-[13px]" />
      <div className="flex flex-wrap items-center gap-1">
        {TEMPLATE_VARS.map((v) => (
          <button
            key={v.token}
            type="button"
            onClick={() => insertVar(v.token)}
            className="inline-flex items-center gap-1 rounded-full bg-purple-soft px-2 py-0.5 text-[11px] font-semibold text-purple-ink transition-colors hover:bg-purple hover:text-white"
          >
            <Plus className="h-2.5 w-2.5" strokeWidth={3} />
            {v.label}
          </button>
        ))}
      </div>
    </>
  );
}

// ───────────────────────── Message editor ─────────────────────────

type MessageData = Extract<FlowNodeData, { type: "send_message" }>;

function MessageEditor({ id, data, update }: { id: string; data: MessageData; update: (next: FlowNodeData, remap?: Record<string, string | null>) => void }) {
  const message = data.message;
  const text = message.text ?? "";
  const buttons = message.buttons ?? [];
  const quick = message.quickReplies ?? [];
  const usage = lengthUsage(text, buttons.length > 0);

  function setMessage(patch: Partial<OutboundMessage>, remap?: Record<string, string | null>) {
    const next: OutboundMessage = { ...message, ...patch };
    if (next.buttons && next.buttons.length === 0) delete next.buttons;
    if (next.quickReplies && next.quickReplies.length === 0) delete next.quickReplies;
    if (next.imageUrl !== undefined && !next.imageUrl) delete next.imageUrl;
    update({ type: "send_message", message: next }, remap);
  }

  function setButton(i: number, patch: Partial<OutboundButton> & { type?: OutboundButton["type"] }) {
    const current = buttons[i];
    let next: OutboundButton;
    if (patch.type && patch.type !== current.type) {
      next = patch.type === "web_url" ? { type: "web_url", title: current.title, url: "" } : { type: "postback", title: current.title, payload: `btn:${i}` };
    } else {
      next = { ...current, ...patch } as OutboundButton;
    }
    setMessage({ buttons: buttons.map((b, j) => (j === i ? next : b)) });
  }

  function removeButton(i: number) {
    // Edges hang off `btn:${index}`; later buttons slide down one slot.
    const remap: Record<string, string | null> = { [`btn:${i}`]: null };
    for (let j = i + 1; j < buttons.length; j++) remap[`btn:${j}`] = `btn:${j - 1}`;
    setMessage({ buttons: buttons.filter((_, j) => j !== i) }, remap);
  }

  function setQuick(i: number, patch: Partial<OutboundQuickReply>) {
    setMessage({ quickReplies: quick.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  }

  function removeQuick(i: number) {
    const remap: Record<string, string | null> = { [`qr:${i}`]: null };
    for (let j = i + 1; j < quick.length; j++) remap[`qr:${j}`] = `qr:${j - 1}`;
    setMessage({ quickReplies: quick.filter((_, j) => j !== i) }, remap);
  }

  return (
    <div className="space-y-5">
      <Field
        label="Message text"
        htmlFor={`${id}-text`}
        right={<Counter value={usage.value} max={usage.max} />}
      >
        <TemplateTextarea
          id={`${id}-text`}
          value={text}
          placeholder="Hi {{first_name}}, here's the link you asked for."
          onChange={(value) => setMessage({ text: value })}
          invalid={usage.value > usage.max}
        />
      </Field>

      <Field
        label="Buttons"
        right={
          <span className="text-muted-foreground">
            {buttons.length}/{MAX_BUTTONS}
          </span>
        }
      >
        <div className="space-y-2">
          {buttons.map((b, i) => (
            <div key={i} className="space-y-1.5 rounded-xl border bg-fog/50 p-2">
              <div className="flex items-center gap-1.5">
                <Select value={b.type} onValueChange={(v) => setButton(i, { type: v as OutboundButton["type"] })}>
                  <SelectTrigger className="h-8 w-[118px] text-[12px]" aria-label={`Button ${i + 1} type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="web_url">
                      <span className="inline-flex items-center gap-1.5">
                        <ExternalLink className="h-3 w-3" /> Link
                      </span>
                    </SelectItem>
                    <SelectItem value="postback">
                      <span className="inline-flex items-center gap-1.5">
                        <MousePointerClick className="h-3 w-3" /> Next step
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={b.title}
                  maxLength={MAX_BUTTON_TITLE_CHARS}
                  placeholder="Button title"
                  aria-label={`Button ${i + 1} title`}
                  onChange={(e) => setButton(i, { title: e.target.value })}
                  className="h-8 text-[12px]"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Remove button" onClick={() => removeButton(i)}>
                  <X />
                </Button>
              </div>
              {b.type === "web_url" ? (
                <Input
                  value={b.url}
                  type="url"
                  placeholder="https://"
                  aria-label={`Button ${i + 1} URL`}
                  aria-invalid={b.url !== "" && !/^https?:\/\//i.test(b.url) ? true : undefined}
                  onChange={(e) => setButton(i, { url: e.target.value })}
                  className="h-8 text-[12px]"
                />
              ) : (
                <p className="text-[11px] text-muted-foreground">Leads to the step it is connected to on the canvas.</p>
              )}
              <p className="text-right text-[10px] text-muted-foreground tabular-nums">
                {charCount(b.title)}/{MAX_BUTTON_TITLE_CHARS}
              </p>
            </div>
          ))}
          {buttons.length < MAX_BUTTONS ? (
            <Button variant="secondary" size="sm" onClick={() => setMessage({ buttons: [...buttons, { type: "web_url", title: "Open link", url: "" }] })}>
              <Plus /> Add button
            </Button>
          ) : null}
        </div>
      </Field>

      <Field label="Image link" htmlFor={`${id}-image`} hint="Sent before the text.">
        <Input
          id={`${id}-image`}
          type="url"
          value={message.imageUrl ?? ""}
          placeholder="https://…/image.jpg"
          onChange={(e) => setMessage({ imageUrl: e.target.value })}
          className="text-[13px]"
        />
      </Field>

      <Field
        label="Quick replies"
        right={
          <span className="text-muted-foreground">
            {quick.length}/{MAX_QUICK_REPLIES}
          </span>
        }
        hint="Each one can lead to its own step."
      >
        <div className="space-y-1.5">
          {quick.map((q, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={q.title}
                maxLength={MAX_QUICK_REPLY_TITLE_CHARS}
                placeholder={`Quick reply ${i + 1}`}
                aria-label={`Quick reply ${i + 1}`}
                onChange={(e) => setQuick(i, { title: e.target.value })}
                className="h-8 text-[12px]"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Remove quick reply" onClick={() => removeQuick(i)}>
                <X />
              </Button>
            </div>
          ))}
          {quick.length < MAX_QUICK_REPLIES ? (
            <Button variant="secondary" size="sm" onClick={() => setMessage({ quickReplies: [...quick, { title: "", payload: `qr:${quick.length}` }] })}>
              <Plus /> Add quick reply
            </Button>
          ) : null}
        </div>
      </Field>

    </div>
  );
}

// ───────────────────────── Ask a question editor ─────────────────────────

type AskQuestionData = Extract<FlowNodeData, { type: "ask_question" }>;

const CUSTOM_FIELD = "__custom__";

const VALIDATION_OPTIONS: Array<{ value: AnswerValidation; label: string }> = [
  { value: "none", label: "Any text" },
  { value: "email", label: "Email address" },
  { value: "phone", label: "Phone number" },
  { value: "number", label: "Number" },
];

/** Keys double as template variables, so only lowercase snake_case survives typing. */
function sanitizeFieldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32);
}

function AskQuestionEditor({ id, data, update }: { id: string; data: AskQuestionData; update: (next: FlowNodeData) => void }) {
  const prompt = data.prompt;
  const text = prompt.text ?? "";
  const quick = prompt.quickReplies ?? [];
  const retry = data.retryPrompt ?? "";
  const bytes = utf8Bytes(text);
  const isPreset = ASK_QUESTION_FIELDS.some((f) => f.key === data.saveTo);
  // "Custom field…" stays selected while the key is being typed, even though an empty key is not a preset either.
  const [custom, setCustom] = React.useState(!isPreset);
  const keyInvalid = custom && data.saveTo !== "" && !SAVE_TO_KEY_RE.test(data.saveTo);

  function patch(next: Partial<Omit<AskQuestionData, "type">>) {
    update({ ...data, ...next });
  }

  function setPrompt(next: Partial<OutboundMessage>) {
    const merged: OutboundMessage = { ...prompt, ...next };
    if (merged.quickReplies && merged.quickReplies.length === 0) delete merged.quickReplies;
    patch({ prompt: merged });
  }

  function chooseField(value: string) {
    if (value === CUSTOM_FIELD) {
      setCustom(true);
      if (isPreset) patch({ saveTo: "", validation: "none" });
      return;
    }
    setCustom(false);
    const preset = ASK_QUESTION_FIELDS.find((f) => f.key === value);
    patch({ saveTo: value, validation: preset?.validation ?? data.validation });
  }

  function setQuick(i: number, title: string) {
    setPrompt({ quickReplies: quick.map((q, j) => (j === i ? { ...q, title } : q)) });
  }

  return (
    <div className="space-y-5">
      <Field label="Question" htmlFor={`${id}-prompt`} right={<Counter value={bytes} max={MAX_TEXT_BYTES} />}>
        <TemplateTextarea
          id={`${id}-prompt`}
          value={text}
          placeholder="What's the best email to send it to?"
          onChange={(value) => setPrompt({ text: value })}
          invalid={bytes > MAX_TEXT_BYTES}
        />
      </Field>

      <Field
        label="Suggested answers"
        right={
          <span className="text-muted-foreground">
            {quick.length}/{MAX_QUICK_REPLIES}
          </span>
        }
        hint="They can also type their own answer."
      >
        <div className="space-y-1.5">
          {quick.map((q, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={q.title}
                maxLength={MAX_QUICK_REPLY_TITLE_CHARS}
                placeholder={`Option ${i + 1}`}
                aria-label={`Suggested answer ${i + 1}`}
                onChange={(e) => setQuick(i, e.target.value)}
                className="h-8 text-[12px]"
              />
              <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                {charCount(q.title)}/{MAX_QUICK_REPLY_TITLE_CHARS}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Remove suggested answer"
                onClick={() => setPrompt({ quickReplies: quick.filter((_, j) => j !== i) })}
              >
                <X />
              </Button>
            </div>
          ))}
          {quick.length < MAX_QUICK_REPLIES ? (
            <Button variant="secondary" size="sm" onClick={() => setPrompt({ quickReplies: [...quick, { title: "", payload: `qr:${quick.length}` }] })}>
              <Plus /> Add suggestion
            </Button>
          ) : null}
        </div>
      </Field>

      <Field label="Save answer to" htmlFor={`${id}-save-to`} hint={data.saveTo ? <>Use it in later messages as <span className="font-mono text-ink">{`{{${data.saveTo}}}`}</span></> : undefined}>
        <Select value={custom ? CUSTOM_FIELD : data.saveTo} onValueChange={chooseField}>
          <SelectTrigger id={`${id}-save-to`} aria-label="Save answer to">
            <SelectValue placeholder="Choose a field" />
          </SelectTrigger>
          <SelectContent>
            {ASK_QUESTION_FIELDS.map((f) => (
              <SelectItem key={f.key} value={f.key}>
                {f.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_FIELD}>Custom field…</SelectItem>
          </SelectContent>
        </Select>
        {custom ? (
          <div className="space-y-1">
            <Input
              value={data.saveTo}
              placeholder="e.g. company or favourite_colour"
              aria-label="Custom field key"
              aria-invalid={keyInvalid || undefined}
              onChange={(e) => patch({ saveTo: sanitizeFieldKey(e.target.value) })}
              className="h-8 font-mono text-[12px]"
            />
            <p className="text-[11px] text-muted-foreground">Lowercase letters, digits and underscores.</p>
          </div>
        ) : null}
      </Field>

      <Field label="Check the answer" htmlFor={`${id}-validation`}>
        <Select value={data.validation ?? "none"} onValueChange={(v) => patch({ validation: v as AnswerValidation })}>
          <SelectTrigger id={`${id}-validation`} aria-label="Answer validation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VALIDATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Retry prompt" htmlFor={`${id}-retry`} right={<Counter value={utf8Bytes(retry)} max={MAX_TEXT_BYTES} />} hint="Leave empty for the default.">
        <Textarea
          id={`${id}-retry`}
          value={retry}
          rows={3}
          placeholder={DEFAULT_ASK_RETRY_PROMPT}
          onChange={(e) => patch({ retryPrompt: e.target.value })}
          aria-invalid={utf8Bytes(retry) > MAX_TEXT_BYTES || undefined}
          className="text-[13px]"
        />
      </Field>

      <Field label="Tries before moving on" htmlFor={`${id}-retries`}>
        <Input
          id={`${id}-retries`}
          type="number"
          min={0}
          max={MAX_ASK_RETRIES}
          value={data.maxRetries ?? DEFAULT_ASK_RETRIES}
          onChange={(e) => patch({ maxRetries: Math.min(MAX_ASK_RETRIES, Math.max(0, Math.round(Number(e.target.value) || 0))) })}
          className="w-24"
        />
      </Field>

    </div>
  );
}

// ───────────────────────── Other editors ─────────────────────────

const DELAY_UNITS = [
  { value: 1, label: "Seconds" },
  { value: 60, label: "Minutes" },
  { value: 3600, label: "Hours" },
  { value: 86400, label: "Days" },
] as const;

function splitSeconds(seconds: number): { amount: number; unit: number } {
  for (const u of [...DELAY_UNITS].reverse()) {
    if (seconds % u.value === 0) return { amount: seconds / u.value, unit: u.value };
  }
  return { amount: seconds, unit: 1 };
}

function DelayEditor({ id, seconds, update }: { id: string; seconds: number; update: (next: FlowNodeData) => void }) {
  const { amount, unit } = splitSeconds(seconds);
  return (
    <div className="space-y-4">
      <Field label="Wait for" htmlFor={`${id}-amount`} hint="Up to 7 days.">
        <div className="flex gap-1.5">
          <Input
            id={`${id}-amount`}
            type="number"
            min={1}
            value={amount}
            onChange={(e) => update({ type: "delay", seconds: Math.max(1, Math.round(Number(e.target.value) || 1)) * unit })}
            className="w-24"
          />
          <Select value={String(unit)} onValueChange={(v) => update({ type: "delay", seconds: Math.max(1, amount) * Number(v) })}>
            <SelectTrigger aria-label="Unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELAY_UNITS.map((u) => (
                <SelectItem key={u.value} value={String(u.value)}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Field>
      {seconds > 23 * 3600 ? <Note>A message sent more than 24 hours after their last reply is not delivered, so put a question or button before a long wait.</Note> : null}
    </div>
  );
}

function TagEditor({ id, type, tag, update }: { id: string; type: "add_tag" | "remove_tag"; tag: string; update: (next: FlowNodeData) => void }) {
  return (
    <Field label="Tag" htmlFor={`${id}-tag`}>
      <Input id={`${id}-tag`} value={tag} maxLength={64} placeholder="lead" onChange={(e) => update({ type, tag: e.target.value })} />
    </Field>
  );
}

type PipelineStepData = Extract<FlowNodeData, { type: "add_to_pipeline" | "move_stage" | "remove_from_pipeline" }>;

const PIPELINE_STEP_HINT: Record<PipelineStepData["type"], string> = {
  add_to_pipeline: "Contacts already in it keep their stage.",
  move_stage: "Adds them to the pipeline if they are not in it.",
  remove_from_pipeline: "",
};

function PipelineStepEditor({ id, data, pipelines, update }: { id: string; data: PipelineStepData; pipelines: PipelineSummary[]; update: (next: FlowNodeData) => void }) {
  const pipeline = pipelines.find((p) => p.id === data.pipelineId);
  const needsStage = data.type !== "remove_from_pipeline";
  const stageId = data.type === "remove_from_pipeline" ? "" : data.stageId;
  const stageMissing = needsStage && Boolean(pipeline) && Boolean(stageId) && !pipeline?.stages.some((s) => s.id === stageId);

  function pickPipeline(pipelineId: string) {
    const next = pipelines.find((p) => p.id === pipelineId);
    if (data.type === "remove_from_pipeline") update({ type: data.type, pipelineId });
    else {
      const firstStage = data.type === "move_stage" ? (next?.stages[1] ?? next?.stages[0]) : next?.stages[0];
      update({ type: data.type, pipelineId, stageId: firstStage?.id ?? "" });
    }
  }

  if (pipelines.length === 0) {
    return (
      <Note>
        No pipelines yet.{" "}
        <Link href="/contacts/pipelines" target="_blank" className="font-semibold underline underline-offset-2">
          Create one
        </Link>
      </Note>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Pipeline" htmlFor={`${id}-pipeline`}>
        <Select value={pipeline ? data.pipelineId : ""} onValueChange={pickPipeline}>
          <SelectTrigger id={`${id}-pipeline`} aria-invalid={(!pipeline && Boolean(data.pipelineId)) || undefined}>
            <SelectValue placeholder={data.pipelineId ? "Deleted pipeline, pick another" : "Pick a pipeline"} />
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {needsStage ? (
        <Field label={data.type === "add_to_pipeline" ? "Starting stage" : "Move to stage"} htmlFor={`${id}-stage`}>
          <Select
            value={pipeline && !stageMissing ? stageId : ""}
            onValueChange={(next) => update({ ...data, stageId: next })}
            disabled={!pipeline}
          >
            <SelectTrigger id={`${id}-stage`} aria-invalid={stageMissing || undefined}>
              <SelectValue placeholder={stageMissing ? "Deleted stage, pick another" : "Pick a stage"} />
            </SelectTrigger>
            <SelectContent>
              {pipeline?.stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <StageDot color={s.color} />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <p className="text-[12px] text-muted-foreground">
        {PIPELINE_STEP_HINT[data.type]}{" "}
        <Link href="/contacts/pipelines" target="_blank" className="font-semibold text-purple-ink hover:underline">
          Edit pipelines
        </Link>
      </p>
    </div>
  );
}

function FollowEditor({
  id,
  retryPrompt,
  update,
  accountHandle,
  platform,
}: {
  id: string;
  retryPrompt?: string;
  update: (next: FlowNodeData) => void;
  accountHandle: string;
  platform: ChannelPlatform | null;
}) {
  const value = retryPrompt ?? "";
  return (
    <div className="space-y-4">
      {platform === "FACEBOOK" ? <Note>Facebook has no followers, so everyone on Messenger takes the Following path.</Note> : null}
      <Field
        label="Ask them to follow"
        htmlFor={`${id}-prompt`}
        right={<Counter value={utf8Bytes(value)} max={MAX_TEXT_BYTES} />}
        hint="Sent with an “I'm following” button when Not following has no step."
      >
        <Textarea
          id={`${id}-prompt`}
          value={value}
          rows={4}
          placeholder={`It looks like you're not following ${accountHandle} yet. Follow, then tap the button below to continue.`}
          onChange={(e) => update({ type: "condition_follow", retryPrompt: e.target.value })}
          className="text-[13px]"
        />
      </Field>
    </div>
  );
}

// ───────────────────────── Inspector ─────────────────────────

export type InspectorProps = {
  node: BuilderNode | null;
  errors: string[];
  dispatch: React.Dispatch<BuilderAction>;
  accountHandle: string;
  accountAvatarUrl: string | null;
  platform: ChannelPlatform | null;
  conversation: OutboundMessage[];
  contactText: string | null;
  contactLabel: string;
  pipelines: PipelineSummary[];
  agents: AgentOption[];
  /** Admins and owners can create agents and connect AI providers from the AI step. */
  canManageAi: boolean;
  /** The step a node's exit leads to, if anything is connected there. */
  stepAfter: (nodeId: string, handle: string) => StepTarget | null;
  onAddAfter: (nodeId: string, handle: string, type: AddableNodeType) => void;
  onOpenStep: (id: string) => void;
  /** Closes the panel by clearing the selection. */
  onClose: () => void;
};

export function Inspector({
  node,
  errors,
  dispatch,
  accountHandle,
  accountAvatarUrl,
  platform,
  conversation,
  contactText,
  contactLabel,
  pipelines,
  agents,
  canManageAi,
  stepAfter,
  onAddAfter,
  onOpenStep,
  onClose,
}: InspectorProps) {
  const update = React.useCallback(
    (data: FlowNodeData, handleRemap?: Record<string, string | null>) => {
      if (node) dispatch({ type: "updateNodeData", id: node.id, data, handleRemap });
    },
    [dispatch, node],
  );

  let preview: OutboundMessage[] = conversation;
  let previewTitle = "Conversation";
  if (node?.data.type === "send_message") {
    preview = [renderPreviewMessage(node.data.message)];
    previewTitle = "This message";
  } else if (node?.data.type === "ask_question") {
    preview = [renderPreviewMessage(node.data.prompt)];
    previewTitle = "This question";
  } else if (node?.data.type === "condition_follow") {
    preview = [followPromptMessage(node.data.retryPrompt, accountHandle)];
    previewTitle = "If they don't follow";
  }

  if (!node) return null;
  const isAi = node.data.type === "ai_reply";
  const aiAgentId = node.data.type === "ai_reply" ? node.data.agentId : undefined;
  const aiAgent = aiAgentId ? agents.find((a) => a.id === aiAgentId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("shrink-0 px-5 py-4", node.data.type === "trigger" ? TONES.yellow.solid : isAi ? "bg-ink text-white" : TONES[STEP_INFO[node.data.type].tone].soft)}>
        <div className="flex items-center gap-3">
          <StepIcon type={node.data.type} size={36} className={node.data.type === "trigger" ? "bg-ink text-yellow" : isAi ? "bg-white text-ink" : undefined} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold leading-tight">{STEP_INFO[node.data.type].label}</h2>
            <p className="truncate text-[12px] leading-tight opacity-70">{STEP_INFO[node.data.type].hint}</p>
          </div>
          {node.data.type !== "trigger" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete this step"
              title="Delete this step"
              className={cn("shrink-0", isAi ? "text-white hover:bg-white/10 hover:text-white" : "hover:bg-white/60 hover:text-destructive")}
              onClick={() => dispatch({ type: "removeNode", id: node.id })}
            >
              <Trash2 />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            title="Close (Esc)"
            className={cn("-mr-1.5 shrink-0", isAi ? "text-white hover:bg-white/10 hover:text-white" : "hover:bg-white/60")}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        {errors.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-xl bg-white/80 px-3 py-2">
            {errors.map((e) => (
              <li key={e} className="flex items-start gap-1.5 text-[12px] text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {e}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Keyed by step, so moving to another step starts at its top. */}
      <div key={node.id} data-panel-scroll className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="border-b px-5 py-5">
          {node.data.type === "trigger" ? (
            <p className="text-[13px] text-muted-foreground">Account, keywords and posts are in the left panel.</p>
          ) : node.data.type === "send_message" ? (
            <MessageEditor id={node.id} data={node.data} update={update} />
          ) : node.data.type === "ask_question" ? (
            <AskQuestionEditor key={node.id} id={node.id} data={node.data} update={update} />
          ) : node.data.type === "ai_reply" ? (
            <AiStepEditor
              key={node.id}
              id={node.id}
              data={node.data}
              agents={agents}
              canManageAi={canManageAi}
              platform={platform}
              update={update}
              exits={{ next: stepAfter(node.id, "next"), handoff: stepAfter(node.id, "handoff") }}
              onAddAfter={(handle, type) => onAddAfter(node.id, handle, type)}
              onOpenStep={onOpenStep}
            />
          ) : node.data.type === "delay" ? (
            <DelayEditor id={node.id} seconds={node.data.seconds} update={update} />
          ) : node.data.type === "condition_follow" ? (
            <FollowEditor id={node.id} retryPrompt={node.data.retryPrompt} update={update} accountHandle={accountHandle} platform={platform} />
          ) : node.data.type === "add_tag" || node.data.type === "remove_tag" ? (
            <TagEditor id={node.id} type={node.data.type} tag={node.data.tag} update={update} />
          ) : (
            <PipelineStepEditor id={node.id} data={node.data} pipelines={pipelines} update={update} />
          )}
        </div>

        {node.data.type === "ai_reply" ? (
          aiAgent ? (
            <div className="h-[28rem] px-5 py-5">
              <Playground
                key={node.id}
                agentId={aiAgent.id}
                dirty={false}
                instruction={node.data.instruction}
                maxReplies={node.data.maxTurns ?? DEFAULT_AI_TURNS}
                title="Try this step"
                notes={{ handoff: "Goes to Needs a human", done: "Goes to Done", limit: "Last reply, then Done" }}
              />
            </div>
          ) : null
        ) : (
          <div className="px-5 py-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="brand-label text-muted-foreground">{previewTitle}</h3>
              <span className="text-[11px] text-muted-foreground">What they see</span>
            </div>
            <DmPreview messages={preview} accountHandle={accountHandle} accountAvatarUrl={accountAvatarUrl} platform={platform} contactText={contactText} contactLabel={contactLabel} />
          </div>
        )}
      </div>
    </div>
  );
}
