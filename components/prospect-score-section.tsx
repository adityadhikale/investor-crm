"use client";

import { useState } from "react";
import { Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast-provider";
import { clearManualScore, setManualScore, suggestProspectScore } from "@/app/contacts/score-actions";
import {
  MAX_SCORE_REASON_CHARS,
  SCORE_LEVELS,
  scoreLevel,
  type ProspectScore,
} from "@/lib/prospect-score-types";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function LevelBadge({ score }: { score: number }) {
  const level = scoreLevel(score);
  if (!level) return null;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${level.className}`}>{level.label}</span>
  );
}

export function ProspectScoreSection({
  contactId,
  initialScore,
  error,
}: {
  contactId: string;
  initialScore: ProspectScore;
  error?: string | null;
}) {
  const { toast } = useToast();
  const [score, setScore] = useState<ProspectScore>(initialScore);
  const [busy, setBusy] = useState<"suggest" | "reset" | "save" | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [draftScore, setDraftScore] = useState<number | null>(null);
  const [draftReason, setDraftReason] = useState("");

  const overridden = score.manual_score !== null;
  const shown = score.manual_score ?? score.ai_score;
  const reason = overridden ? score.manual_score_reason : score.ai_score_reason;
  const scoredAt = overridden ? score.manual_scored_at : score.ai_scored_at;

  async function handleSuggest() {
    setBusy("suggest");
    try {
      const result = await suggestProspectScore(contactId);
      if ("error" in result) {
        toast(result.error, "error");
        return;
      }
      setScore(result.score);
      toast(overridden ? "AI suggestion updated. Your override is still in place." : "Score suggested.");
    } catch {
      toast("The score could not be generated. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    setBusy("reset");
    try {
      const result = await clearManualScore(contactId);
      if ("error" in result) {
        toast(result.error, "error");
        return;
      }
      setScore(result.score);
      toast("Back to the AI suggestion.");
    } catch {
      toast("The override could not be removed. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  function openOverride() {
    setDraftScore(score.manual_score ?? score.ai_score);
    setDraftReason(score.manual_score_reason ?? "");
    setOverrideOpen(true);
  }

  async function handleSaveOverride() {
    if (draftScore === null) return;
    setBusy("save");
    try {
      const result = await setManualScore(contactId, draftScore, draftReason);
      if ("error" in result) {
        toast(result.error, "error");
        return;
      }
      setScore(result.score);
      setOverrideOpen(false);
      toast("Your score is saved.");
    } catch {
      toast("The score could not be saved. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-5">
      <h2 className="text-base font-semibold">Prospect Score</h2>

      {error ? (
        <p className="mt-4 text-sm text-muted-foreground">{error}</p>
      ) : (
        <>
          {shown === null ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No score yet. The AI will rate this prospect from 1 to 5 using their tags, notes, messages, follow-ups
              and portfolio updates.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-3xl font-semibold leading-none">{shown}</span>
                <span className="text-sm text-muted-foreground">/ 5</span>
                <LevelBadge score={shown} />
                <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {overridden ? "Your override" : "AI suggested"}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {reason || <span className="text-muted-foreground">No reason given.</span>}
              </p>
              {scoredAt && <p className="text-xs text-muted-foreground">Scored {formatDate(scoredAt)}</p>}
              {overridden && score.ai_score !== null && (
                <p className="border-t pt-2 text-xs text-muted-foreground">
                  AI suggested {score.ai_score}/5{score.ai_score_reason ? `: ${score.ai_score_reason}` : ""}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void handleSuggest()}>
              {busy === "suggest" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {score.ai_score === null ? "Suggest score" : "Re-suggest"}
            </Button>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={openOverride}>
              <Pencil className="size-4" />
              {overridden ? "Edit override" : "Override"}
            </Button>
            {overridden && (
              <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void handleReset()}>
                {busy === "reset" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Reset to AI
              </Button>
            )}
          </div>
        </>
      )}

      <Dialog open={overrideOpen} onOpenChange={(next) => busy !== "save" && setOverrideOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set your own score</DialogTitle>
            <DialogDescription>
              Your score replaces the AI suggestion on this page. The AI suggestion is kept, and you can reset to it
              any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              {SCORE_LEVELS.map((level) => (
                <button
                  key={level.score}
                  type="button"
                  disabled={busy === "save"}
                  onClick={() => setDraftScore(level.score)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    draftScore === level.score ? "border-foreground bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="w-5 text-base font-semibold">{level.score}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">{level.label}</span>
                    <span className="block text-xs text-muted-foreground">{level.meaning}</span>
                  </span>
                </button>
              ))}
            </div>
            <Textarea
              rows={3}
              maxLength={MAX_SCORE_REASON_CHARS}
              placeholder="Your reason (optional)"
              value={draftReason}
              onChange={(event) => setDraftReason(event.target.value)}
              disabled={busy === "save"}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy === "save"} />}>Cancel</DialogClose>
            <Button type="button" disabled={busy === "save" || draftScore === null} onClick={() => void handleSaveOverride()}>
              {busy === "save" && <Loader2 className="size-4 animate-spin" />} Save score
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
