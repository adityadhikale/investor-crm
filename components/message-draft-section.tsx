"use client";

import { useState } from "react";
import { Copy, Loader2, Send, Sparkles } from "lucide-react";
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
import { sendWhatsAppReply } from "@/app/contacts/actions";
import { generatePersonalisedMessage } from "@/app/contacts/message-actions";
import { MESSAGES_CHANGED_EVENT } from "@/lib/unread-events";

const MAX_CHARS = 1000;

export function MessageDraftSection({ contactId, contactName }: { contactId: string; contactName: string }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const [windowOpen, setWindowOpen] = useState(true);
  const [busy, setBusy] = useState<"generate" | "send" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const text = draft?.trim() ?? "";

  async function handleGenerate() {
    setBusy("generate");
    try {
      const result = await generatePersonalisedMessage(contactId);
      if ("error" in result) {
        toast(result.error, "error");
        return;
      }
      setDraft(result.message);
      setWindowOpen(result.windowOpen);
    } catch {
      toast("The message could not be generated. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("Message copied.");
    } catch {
      toast("Could not copy the message.", "error");
    }
  }

  async function handleSend() {
    setBusy("send");
    try {
      const result = await sendWhatsAppReply(contactId, text);
      if ("error" in result) {
        toast(result.error, "error");
        return;
      }
      toast("Message sent.");
      // The chat history picks up the new message from this event.
      window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
      setConfirmOpen(false);
      setDraft(null);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "The message could not be sent.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-5">
      <h2 className="text-base font-semibold">Personalised Message</h2>

      {draft === null ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The AI writes a short message to {contactName} from their tag, notes and last conversation. You can edit it,
          then copy it or send it on WhatsApp.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          <Textarea
            rows={6}
            maxLength={MAX_CHARS}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy !== null}
          />
          <p className="text-xs text-muted-foreground">
            {draft.length}/{MAX_CHARS} characters
          </p>
          {!windowOpen && (
            <p className="text-sm text-amber-700">
              {contactName} hasn&apos;t messaged in the last 24 hours, so WhatsApp won&apos;t deliver a normal message.
              Copy the text, or send an approved template from the chat.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void handleGenerate()}>
          {busy === "generate" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {draft === null ? "Generate message" : "Regenerate"}
        </Button>
        {draft !== null && (
          <>
            <Button type="button" variant="outline" disabled={busy !== null || !text} onClick={() => void handleCopy()}>
              <Copy className="size-4" />
              Copy
            </Button>
            <Button
              type="button"
              disabled={busy !== null || !text || !windowOpen}
              onClick={() => setConfirmOpen(true)}
            >
              <Send className="size-4" />
              Send on WhatsApp
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={(next) => busy !== "send" && setConfirmOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this message to {contactName}?</DialogTitle>
            <DialogDescription>It will be sent now as a WhatsApp message and can&apos;t be unsent.</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{text}</p>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy === "send"} />}>Cancel</DialogClose>
            <Button type="button" disabled={busy === "send"} onClick={() => void handleSend()}>
              {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
