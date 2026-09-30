"use client";

import { useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2, Paperclip, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type WhatsAppMessage = {
  id: string;
  direction: string;
  message_text: string | null;
  media_url: string | null;
  sent_at: string | null;
  created_at: string;
};

export type WhatsAppHistoryProps = {
  messages: WhatsAppMessage[];
  error?: string | null;
  isLoading?: boolean;
  className?: string;
  summary?: string | null;
  summaryGeneratedAt?: string | null;
  onRefreshSummary?: () => void;
  isGeneratingSummary?: boolean;
  summaryError?: string | null;
  onSendReply?: (message: string) => Promise<{ error?: string } | void>;
  isSendingReply?: boolean;
  onSendMedia?: (file: File, caption: string) => Promise<{ error?: string } | void>;
  isSendingMedia?: boolean;
  /** Called each time the full-history panel is opened (used to mark the chat as read). */
  onOpened?: () => void;
};

function formatWhatsAppDate(sentAt: string | null, createdAt: string) {
  const timestamp = sentAt || createdAt;
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "—";

  return `${date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} · ${date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
}

export function WhatsAppHistory({
  messages,
  error = null,
  isLoading = false,
  className,
  summary = null,
  summaryGeneratedAt = null,
  onRefreshSummary,
  isGeneratingSummary = false,
  summaryError = null,
  onSendReply,
  isSendingReply = false,
  onSendMedia,
  isSendingMedia = false,
  onOpened,
}: WhatsAppHistoryProps) {
  const [open, setOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSending = isSendingReply || isSendingMedia;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) onOpened?.();
  }

  async function handleSendReply() {
    const trimmed = replyText.trim();
    setReplyError(null);

    if (selectedFile) {
      if (!onSendMedia) return;
      const result = await onSendMedia(selectedFile, trimmed);
      if (result && "error" in result && result.error) {
        setReplyError(result.error);
        return;
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setReplyText("");
      return;
    }

    if (!trimmed || !onSendReply) return;
    const result = await onSendReply(trimmed);
    if (result && "error" in result && result.error) {
      setReplyError(result.error);
      return;
    }
    setReplyText("");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setReplyError(null);
    setSelectedFile(file);
  }

  const hasMessages = messages.length > 0;
  const lastMessage = hasMessages ? messages[messages.length - 1] : null;

  const isLastInbound =
    lastMessage?.direction === "in" ||
    lastMessage?.direction?.toLowerCase() === "inbound";

  const lastMessageText = lastMessage
    ? lastMessage.message_text && lastMessage.message_text.trim()
      ? lastMessage.message_text
      : lastMessage.media_url
      ? "[Media message]"
      : "No text"
    : "";

  return (
    <>
      <section className={cn("rounded-lg border bg-background p-5", className)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">WhatsApp History</h2>
              {hasMessages && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {messages.length} {messages.length === 1 ? "message" : "messages"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Message history with this contact.
            </p>
          </div>

          {(hasMessages || onSendReply || onSendMedia) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(true)}
              className="shrink-0"
            >
              {hasMessages ? "View Full History" : "Send WhatsApp Message"}
            </Button>
          )}
        </div>

        <div className="mt-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading WhatsApp messages...
            </p>
          ) : hasMessages && lastMessage ? (
            <div className="flex flex-col gap-3">
              {/* AI Summary Card */}
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Sparkles className="size-3.5 text-primary" />
                    <span>AI Summary</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {summaryGeneratedAt && (
                      <span>
                        Generated: {formatWhatsAppDate(summaryGeneratedAt, summaryGeneratedAt)}
                      </span>
                    )}
                    {onRefreshSummary && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onRefreshSummary}
                        disabled={isGeneratingSummary}
                        className="h-7 px-2.5 text-xs font-medium"
                      >
                        {isGeneratingSummary ? (
                          <>
                            <Loader2 className="mr-1.5 size-3 animate-spin" />
                            {summary ? "Refreshing..." : "Generating..."}
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1.5 size-3" />
                            {summary ? "Refresh Summary" : "Generate Summary"}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {summaryError && (
                  <p className="text-xs text-destructive">{summaryError}</p>
                )}

                <div className="text-xs leading-relaxed text-foreground/90">
                  {summary ? (
                    <p className="whitespace-pre-wrap">{summary}</p>
                  ) : (
                    <p className="italic text-muted-foreground">
                      No summary generated yet.
                    </p>
                  )}
                </div>
              </div>

              {/* Latest Message Card */}
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Latest Message</span>
                  <span>
                    Last message:{" "}
                    {formatWhatsAppDate(lastMessage.sent_at, lastMessage.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      isLastInbound
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {isLastInbound ? (
                      <>
                        <ArrowDownLeft className="size-3" />
                        Inbound
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="size-3" />
                        Outbound
                      </>
                    )}
                  </span>
                  <p className="truncate text-xs text-foreground/80 flex-1">
                    {lastMessageText}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No WhatsApp messages yet.
            </p>
          )}
        </div>
      </section>

      {/* Full WhatsApp History Sheet Panel */}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
          <SheetHeader className="border-b px-4 py-3.5 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-lg sm:text-xl">
                WhatsApp History
              </SheetTitle>
              {hasMessages && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {messages.length} {messages.length === 1 ? "message" : "messages"}
                </span>
              )}
            </div>
            <SheetDescription className="text-sm">
              Message history with this contact.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="space-y-4">
              {!hasMessages && (
                <p className="text-sm text-muted-foreground">
                  No WhatsApp messages logged yet. You can still send a message below.
                </p>
              )}
              {messages.map((message) => {
                const isInbound =
                  message.direction === "in" ||
                  message.direction?.toLowerCase() === "inbound";
                const hasText = Boolean(
                  message.message_text && message.message_text.trim()
                );

                return (
                  <div
                    key={message.id}
                    className="flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          isInbound
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {isInbound ? (
                          <>
                            <ArrowDownLeft className="size-3" />
                            Inbound
                          </>
                        ) : (
                          <>
                            <ArrowUpRight className="size-3" />
                            Outbound
                          </>
                        )}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {formatWhatsAppDate(message.sent_at, message.created_at)}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      {message.media_url && (
                        /\.(jpe?g|png|gif|webp)$/i.test(message.media_url) ? (
                          <a href={message.media_url} target="_blank" rel="noreferrer">
                            <img
                              src={message.media_url}
                              alt="WhatsApp media"
                              className="max-h-64 rounded-md border object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            href={message.media_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
                          >
                            <Paperclip className="size-3.5 shrink-0" />
                            View attachment
                          </a>
                        )
                      )}
                      {hasText && (
                        <p className="whitespace-pre-wrap text-sm">
                          {message.message_text}
                        </p>
                      )}
                      {!hasText && !message.media_url && null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {(onSendReply || onSendMedia) && (
            <div className="border-t px-4 py-3.5 sm:px-6 sm:py-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Send a WhatsApp message. This only works if the contact has messaged in
                the last 24 hours.
              </p>
              {replyError && (
                <p className="mb-2 text-xs text-destructive">{replyError}</p>
              )}
              {selectedFile && (
                <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{selectedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    disabled={isSending}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                {onSendMedia && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      onChange={handleFileChange}
                      disabled={isSending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSending}
                      className="shrink-0"
                    >
                      <Paperclip className="size-4" />
                    </Button>
                  </>
                )}
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={selectedFile ? "Add a caption (optional)..." : "Type a reply..."}
                  rows={2}
                  className="min-h-0 resize-none"
                  disabled={isSending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={handleSendReply}
                  disabled={isSending || (!selectedFile && !replyText.trim())}
                  className="shrink-0"
                >
                  {isSending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
