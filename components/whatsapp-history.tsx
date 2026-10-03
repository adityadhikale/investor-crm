"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Loader2,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { startVisibleInterval } from "@/lib/visible-interval";
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
import { SendTemplateForm } from "@/components/send-template-form";

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
  /** Unread inbound messages; shown as a badge until the full history is opened. */
  unreadCount?: number;
  /** Sends a Meta-approved template (works outside the 24-hour window). */
  onSendTemplate?: (templateId: string, params: string[]) => Promise<{ error?: string } | void>;
  /** Used to pre-fill {{1}} with the contact's first name. */
  contactName?: string;
};

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A photo, voice note, audio, video or file inside a chat bubble. Older
 * incoming files that were only saved as a Meta reference open through
 * /api/whatsapp/media, which fetches and keeps a copy on first open.
 */
function MessageMedia({ messageId, mediaUrl }: { messageId: string; mediaUrl: string }) {
  if (mediaUrl.startsWith("meta_media_id:")) {
    return (
      <a
        href={`/api/whatsapp/media/${messageId}`}
        target="_blank"
        rel="noreferrer"
        className="mb-1 inline-flex items-center gap-1.5 underline underline-offset-2"
      >
        <Paperclip className="size-3.5 shrink-0" />
        Open attachment
      </a>
    );
  }

  const path = mediaUrl.split("?")[0].toLowerCase();
  if (/\.(jpe?g|png|gif|webp)$/.test(path)) {
    return (
      <a href={mediaUrl} target="_blank" rel="noreferrer">
        <img src={mediaUrl} alt="WhatsApp photo" className="mb-1 max-h-64 rounded-md object-cover" />
      </a>
    );
  }
  if (/\.(ogg|opus|mp3|m4a|aac|amr|wav)$/.test(path)) {
    return <audio controls preload="none" src={mediaUrl} className="mb-1 h-10 w-60 max-w-full" />;
  }
  if (/\.(mp4|3gp|mov|webm)$/.test(path)) {
    return (
      <video controls preload="metadata" src={mediaUrl} className="mb-1 max-h-64 max-w-full rounded-md" />
    );
  }
  const filename = decodeURIComponent(path.split("/").pop() ?? "").replace(/^\d+-/, "");
  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noreferrer"
      className="mb-1 inline-flex max-w-full items-center gap-1.5 underline underline-offset-2"
    >
      <Paperclip className="size-3.5 shrink-0" />
      <span className="truncate">{filename || "View attachment"}</span>
    </a>
  );
}

function dayKey(at: string) {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today", "Yesterday" or a date, for the separators between days. */
function dayLabel(at: string) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(at) === dayKey(today.toISOString())) return "Today";
  if (dayKey(at) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatBubbleTime(at: string) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Meta's 24-hour customer service window: free-form messages can only be
 * sent within 24 hours of the contact's last message. It restarts each time
 * the contact writes; our own messages don't extend it.
 */
/** Time (ms) of the contact's latest message, or 0 if they never wrote. */
function lastInboundTime(messages: WhatsAppMessage[]) {
  let lastInbound = 0;
  for (const message of messages) {
    const isInbound = message.direction === "in" || message.direction?.toLowerCase() === "inbound";
    if (!isInbound) continue;
    const time = new Date(message.sent_at || message.created_at).getTime();
    if (!isNaN(time) && time > lastInbound) lastInbound = time;
  }
  return lastInbound;
}

function ReplyWindowBanner({ messages, now }: { messages: WhatsAppMessage[]; now: number }) {
  if (!now) return null;

  const lastInbound = lastInboundTime(messages);
  const remaining = lastInbound ? lastInbound + REPLY_WINDOW_MS - now : 0;

  if (remaining <= 0) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-700 dark:text-amber-400"
        title="Free-form messages need the contact to have messaged you in the last 24 hours."
      >
        <Clock className="size-3 shrink-0" />
        <span className="truncate">
          {lastInbound ? "Reply window closed" : "No message from this contact yet"} · approved
          templates only
        </span>
      </div>
    );
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  const closesAt = new Date(lastInbound + REPLY_WINDOW_MS).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div
      className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-700 dark:text-emerald-400"
      title="The 24-hour window restarts whenever this contact sends a new message."
    >
      <Clock className="size-3 shrink-0" />
      <span className="truncate">
        <span className="font-semibold">
          {hours}h {minutes.toString().padStart(2, "0")}m left to reply
        </span>{" "}
        · closes {closesAt}
      </span>
    </div>
  );
}

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
  unreadCount = 0,
  onSendTemplate,
  contactName = "",
}: WhatsAppHistoryProps) {
  const [open, setOpen] = useState(false);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [unread, setUnread] = useState(unreadCount);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSending = isSendingReply || isSendingMedia;
  const router = useRouter();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // Current time for the 24-hour window countdown; set while the chat is open.
  const [now, setNow] = useState(0);
  // Free-form messages only reach the contact within 24 h of their last message.
  const windowOpen = now > 0 && now - lastInboundTime(messages) < REPLY_WINDOW_MS;

  // While the chat is open, re-check every 30 s so new messages and the window
  // countdown stay current (paused while the browser tab is hidden).
  useEffect(() => {
    if (!open) return;
    return startVisibleInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 30_000);
  }, [open, router]);

  // Keep the newest message in view, like a chat app.
  // The panel slides in, so scroll again once the animation has finished.
  useEffect(() => {
    if (!open) return;
    const scrollToBottom = () => {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    const frame = requestAnimationFrame(scrollToBottom);
    const timers = [150, 400].map((ms) => window.setTimeout(scrollToBottom, ms));
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [open, messages.length]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setNow(Date.now());
      setUnread(0);
      onOpened?.();
    }
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
              {unread > 0 && (
                <span
                  className="flex h-5 items-center justify-center rounded-full bg-destructive px-2 text-[11px] font-semibold leading-none text-white"
                  title={`${unread} unread ${unread === 1 ? "message" : "messages"}`}
                >
                  {unread > 99 ? "99+" : unread} new
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
              onClick={() => handleOpenChange(true)}
              className="h-11 w-full shrink-0 gap-2 px-5 text-sm font-semibold sm:w-auto"
            >
              <MessageCircle className="size-4" />
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
          <SheetHeader className="gap-1 border-b px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2.5 pr-8">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                {(contactName.trim()[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate text-sm font-semibold sm:text-base">
                  {contactName || "WhatsApp History"}
                </SheetTitle>
                <SheetDescription className="text-[11px] leading-tight">
                  {hasMessages
                    ? `WhatsApp · ${messages.length} ${messages.length === 1 ? "message" : "messages"}`
                    : "WhatsApp"}
                </SheetDescription>
              </div>
            </div>
            <ReplyWindowBanner messages={messages} now={now} />
          </SheetHeader>

          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto bg-[#efeae2] px-3 py-4 dark:bg-[#0b141a] sm:px-5"
          >
            {!hasMessages && (
              <p className="mx-auto mt-6 max-w-xs rounded-lg bg-background/80 px-3 py-2 text-center text-xs text-muted-foreground">
                No WhatsApp messages yet. Start the conversation with an approved Meta
                template below.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              {messages.map((message, index) => {
                const isInbound =
                  message.direction === "in" ||
                  message.direction?.toLowerCase() === "inbound";
                const hasText = Boolean(
                  message.message_text && message.message_text.trim()
                );
                const at = message.sent_at || message.created_at;
                const previous = messages[index - 1];
                const showDay =
                  !previous ||
                  dayKey(previous.sent_at || previous.created_at) !== dayKey(at);

                return (
                  <div key={message.id} className="flex flex-col">
                    {showDay && (
                      <span className="mx-auto my-2 rounded-md bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-xs">
                        {dayLabel(at)}
                      </span>
                    )}
                    <div
                      className={cn(
                        "flex",
                        isInbound ? "justify-start" : "justify-end"
                      )}
                    >
                      <div
                        className={cn(
                          "relative max-w-[82%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-sm shadow-xs",
                          isInbound
                            ? "rounded-tl-none bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"
                            : "rounded-tr-none bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
                        )}
                      >
                        {message.media_url && (
                          <MessageMedia messageId={message.id} mediaUrl={message.media_url} />
                        )}
                        {hasText && (
                          <p className="whitespace-pre-wrap break-words leading-snug">
                            {message.message_text}
                          </p>
                        )}
                        <p className="mt-0.5 text-right text-[10px] leading-none opacity-60">
                          {formatBubbleTime(at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {(onSendReply || onSendMedia) && (
            <div className="border-t px-4 py-3 sm:px-5">
              {onSendTemplate && !templateFormOpen && !windowOpen && (
                <div className="flex flex-col items-center gap-2 py-1 text-center text-xs text-muted-foreground">
                  <p>
                    The reply window is closed, so normal messages can&apos;t be delivered. Send
                    an approved Meta template; once they reply you can chat normally.
                  </p>
                  <Button type="button" size="sm" onClick={() => setTemplateFormOpen(true)}>
                    Send approved template
                  </Button>
                </div>
              )}
              {onSendTemplate && !templateFormOpen && windowOpen && (
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setTemplateFormOpen(true)}
                    disabled={isSending}
                    className="text-xs font-medium text-primary underline underline-offset-2"
                    title="Approved Meta templates work any time; CRM templates only while the reply window is open."
                  >
                    Send template
                  </button>
                </div>
              )}
              {onSendTemplate && templateFormOpen && (
                <SendTemplateForm
                  contactName={contactName}
                  windowOpen={windowOpen}
                  onSendMetaTemplate={onSendTemplate}
                  onSendText={onSendReply}
                  onClose={() => setTemplateFormOpen(false)}
                />
              )}
              {replyError && (
                <p className="mb-2 text-xs text-destructive">{replyError}</p>
              )}
              {windowOpen && selectedFile && (
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
              {windowOpen && (
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
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
