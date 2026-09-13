"use client";

import * as React from "react";
import { Check, FlaskConical, X } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { DmPreview } from "@/components/automations/dm-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import type { FlowGraph } from "@/lib/automation/flow-types";
import type { AutomationTestResult, MediaSummary } from "@/lib/services/automations";
import { cn } from "@/lib/utils";

import type { BuilderSettings } from "./builder-state";

export type TestDialogProps = {
  automationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: BuilderSettings;
  flow: FlowGraph;
  mediaById: Record<string, MediaSummary>;
  accountHandle: string;
  accountAvatarUrl: string | null;
};

const SUBJECT: Record<BuilderSettings["triggerType"], string> = { COMMENT: "comment", DM: "message", STORY_REPLY: "story reply" };

/**
 * Dry run against the *current* editor state (unsaved edits included): does
 * the text match, and what would the first message look like? Nothing is sent.
 */
export function TestDialog({ automationId, open, onOpenChange, settings, flow, mediaById, accountHandle, accountAvatarUrl }: TestDialogProps) {
  const [text, setText] = React.useState("");
  const [mediaId, setMediaId] = React.useState<string>("");
  const [result, setResult] = React.useState<AutomationTestResult | null>(null);
  const [pending, setPending] = React.useState(false);
  const subject = SUBJECT[settings.triggerType];
  const needsMedia = settings.triggerType === "COMMENT" && settings.mediaIds.length > 0;

  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    if (!text && settings.keywords[0]) setText(settings.keywords[0]);
    if (needsMedia && !settings.mediaIds.includes(mediaId)) setMediaId(settings.mediaIds[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed defaults only when the dialog opens
  }, [open]);

  async function run() {
    setPending(true);
    try {
      const res = await apiFetch<AutomationTestResult>(`/api/automations/${automationId}/test`, {
        method: "POST",
        json: {
          text,
          ...(needsMedia && mediaId ? { mediaId } : {}),
          overrides: {
            triggerType: settings.triggerType,
            matchMode: settings.matchMode,
            keywords: settings.keywords,
            excludeKeywords: settings.excludeKeywords,
            mediaIds: settings.mediaIds,
            flow,
          },
        },
      });
      setResult(res);
    } catch (err) {
      toast.error(errorMessage(err, "Test failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Test this automation</DialogTitle>
          <DialogDescription>Uses what&apos;s on screen right now, unsaved edits included. Nothing is sent.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="test-text">Sample {subject}</Label>
              <Textarea
                id="test-text"
                value={text}
                rows={3}
                placeholder={settings.keywords[0] ? `e.g. “${settings.keywords[0]} please!”` : `Type a ${subject}…`}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
                }}
              />
            </div>
            {needsMedia ? (
              <div className="space-y-1.5">
                <Label htmlFor="test-media">On post</Label>
                <Select value={mediaId} onValueChange={setMediaId}>
                  <SelectTrigger id="test-media">
                    <SelectValue placeholder="Pick a selected post" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.mediaIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {mediaById[id]?.caption?.slice(0, 60) || id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button onClick={run} loading={pending} disabled={!text.trim() && settings.matchMode !== "ANY"}>
              <FlaskConical /> Run test
            </Button>

            {result ? (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-white",
                      result.matches ? "bg-success" : "bg-destructive",
                    )}
                  >
                    {result.matches ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{result.matches ? "Match. This would run the automation." : "No match"}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {result.matches
                        ? result.matchedKeyword
                          ? `Matched keyword “${result.matchedKeyword}”`
                          : "Matches every " + subject
                        : result.reason}
                    </p>
                  </div>
                </div>
                {result.matches ? (
                  <div className="space-y-1.5 text-[12px]">
                    {result.path.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-muted-foreground">
                        <Badge variant="outline" className="font-normal">
                          {i + 1}
                        </Badge>
                        {step}
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {result.path.length + 1}
                      </Badge>
                      {result.preview ? (
                        <span>
                          {settings.triggerType === "COMMENT" ? "Private reply sent" : "Message sent"}
                          {result.followGate ? " (after the follow check passes)" : ""}
                        </span>
                      ) : (
                        <span className="text-warning">No message would be sent. There&apos;s no message step connected to the trigger.</span>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <DmPreview
            messages={result?.matches && result.preview ? [result.preview] : []}
            accountHandle={accountHandle}
            accountAvatarUrl={accountAvatarUrl}
            contactText={result ? text : null}
            contactLabel={`Their ${subject}`}
            emptyHint={result ? (result.matches ? "Nothing to send." : "No message. The text didn't match.") : "Run a test to preview the first message."}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
