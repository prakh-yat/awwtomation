"use client";

import * as React from "react";
import { ArrowUp, ExternalLink, RotateCcw, X } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { Button } from "@/components/ui/button";
import type { AgentButton } from "@/lib/ai/agent";
import { cn } from "@/lib/utils";

type Outcome = "handoff" | "done" | "limit";
type Turn = { role: "user" | "assistant"; content: string; buttons?: AgentButton[]; note?: Outcome };

const NOTES: Record<Outcome, string> = { handoff: "Hands over to your team", done: "Ends the conversation", limit: "Last reply" };
const NOTE_TONE: Record<Outcome, string> = { handoff: "bg-orange-soft text-orange-ink", done: "bg-green-soft text-green-ink", limit: "bg-green-soft text-green-ink" };

export type PlaygroundProps = {
  agentId: string;
  /** The agent has unsaved edits the chat cannot use yet. */
  dirty: boolean;
  onClose?: () => void;
  /** A flow step's own instruction, added to the agent's for this chat. */
  instruction?: string;
  /** The step's reply limit: the reply that reaches it is marked. */
  maxReplies?: number;
  title?: string;
  /** Overrides the words under a reply that ends the conversation, hands over, or uses the last reply. */
  notes?: Partial<Record<Outcome, string>>;
};

/**
 * A chat with the saved agent: the same call an automation makes, with the same
 * key and prompt. Nothing is sent to anyone.
 */
export function Playground({ agentId, dirty, onClose, instruction, maxReplies, title = "Test chat", notes }: PlaygroundProps) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  // Shown in the chat, where the eye already is: a toast would cover the box you type in.
  const [error, setError] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Switching agent starts a fresh conversation; a half-finished one would read
  // as the new agent's history.
  React.useEffect(() => {
    setTurns([]);
    setInput("");
    setError(null);
  }, [agentId]);

  // Scrolls the chat itself: scrollIntoView would also scroll whatever panel the chat sits in.
  React.useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    setError(null);
    setPending(true);
    try {
      const result = await apiFetch<{ reply: string; buttons: AgentButton[]; handoff: boolean; done: boolean }>("/api/ai/playground", {
        method: "POST",
        json: { agentId, messages: next.map(({ role, content }) => ({ role, content })), ...(instruction?.trim() ? { instruction: instruction.trim() } : {}) },
      });
      const replies = next.filter((t) => t.role === "assistant").length + 1;
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          buttons: result.buttons,
          note: result.handoff ? "handoff" : result.done ? "done" : maxReplies && replies === maxReplies ? "limit" : undefined,
        },
      ]);
    } catch (err) {
      setError(errorMessage(err, "The provider did not answer"));
      setTurns((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border bg-card">
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3 text-white">
        <p className="text-[13px] font-semibold">{title}</p>
        <div className="flex items-center gap-1">
          {turns.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setTurns([]);
                setError(null);
              }}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" /> Start over
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close test chat"
              className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 xl:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-fog/60 px-4 py-4">
        {dirty ? <p className="rounded-xl bg-yellow-soft px-3 py-2 text-[12px] font-medium">Save to test your changes.</p> : null}

        {turns.length === 0 && !error ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center text-center">
            <p className="text-[13px] font-semibold">Message it as a customer would</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Replies use your saved agent and key.</p>
          </div>
        ) : null}

        {turns.map((turn, i) => (
          <div key={i} className={cn("flex animate-fade-in", turn.role === "user" ? "justify-end" : "justify-start")}>
            <div className="max-w-[85%]">
              {/* An agent that closes the conversation without a word sends nothing: only its note shows. */}
              {turn.content ? (
                <div
                  className={cn(
                    "whitespace-pre-wrap rounded-[20px] px-3.5 py-2 text-[13px] leading-relaxed",
                    turn.role === "user" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-background text-ink shadow-[0_1px_2px_rgb(15_15_15/0.06)]",
                  )}
                >
                  {turn.content}
                </div>
              ) : null}
              {turn.buttons && turn.buttons.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {turn.buttons.map((button, b) => (
                    <span key={b} className="flex items-center justify-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-[12px] font-semibold text-purple-ink">
                      {button.title}
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  ))}
                </div>
              ) : null}
              {turn.note ? (
                <p className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", NOTE_TONE[turn.note])}>{notes?.[turn.note] ?? NOTES[turn.note]}</p>
              ) : null}
            </div>
          </div>
        ))}

        {error ? <p className="animate-fade-in rounded-xl bg-destructive/10 px-3 py-2 text-[12px] font-medium leading-snug text-destructive">{error}</p> : null}

        {pending ? (
          <div className="flex justify-start">
            <div className="rounded-[20px] rounded-bl-md bg-background px-3.5 py-3 shadow-[0_1px_2px_rgb(15_15_15/0.06)]">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <form
        className="flex items-center gap-2 border-t bg-background p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="How much is delivery to Pokhara?"
          aria-label="Message to test with"
          disabled={pending}
          className="h-10 min-w-0 flex-1 rounded-full bg-fog px-4 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || pending} aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
    </div>
  );
}
