"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";

import { getChatTemplates, type ChatTemplate } from "@/app/templates/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function placeholdersOf(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(/\{\{(\d+)\}\}/g), (m) => m[1]))).sort(
    (a, b) => Number(a) - Number(b),
  );
}

/**
 * Picks a template for one contact and fills its variables ({{1}} defaults to
 * the contact's first name), then asks for confirmation before sending.
 * - Meta-approved templates are sent as WhatsApp templates and work any time.
 * - CRM templates are sent as plain text, so only while the reply window is open.
 */
export function SendTemplateForm({
  contactName,
  windowOpen,
  onSendMetaTemplate,
  onSendText,
  onClose,
}: {
  contactName: string;
  /** Whether the contact messaged in the last 24 hours. */
  windowOpen: boolean;
  onSendMetaTemplate?: (templateId: string, params: string[]) => Promise<{ error?: string } | void>;
  onSendText?: (message: string) => Promise<{ error?: string } | void>;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<ChatTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChatTemplates()
      .then((list) => {
        if (!cancelled) setTemplates(list);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const metaTemplates = (templates ?? []).filter((t) => t.kind === "meta" && onSendMetaTemplate);
  const crmTemplates = (templates ?? []).filter((t) => t.kind === "crm" && onSendText);
  const template = templates?.find((t) => t.id === templateId) ?? null;
  const placeholders = useMemo(() => (template ? placeholdersOf(template.body_text) : []), [template]);
  const blockedByWindow = template?.kind === "crm" && !windowOpen;

  function handleSelect(id: string) {
    setTemplateId(id);
    setConfirming(false);
    setError(null);
    const selected = templates?.find((t) => t.id === id);
    const firstName = contactName.trim().split(/\s+/)[0] ?? "";
    const next: Record<string, string> = {};
    for (const ph of selected ? placeholdersOf(selected.body_text) : []) {
      next[ph] = ph === "1" ? firstName : "";
    }
    setValues(next);
  }

  const preview = template
    ? placeholders.reduce(
        (text, ph) => text.replaceAll(`{{${ph}}}`, values[ph]?.trim() || `{{${ph}}}`),
        template.body_text,
      )
    : "";

  // First click checks the variables and asks for confirmation; the second sends.
  function handleReview() {
    if (!template || blockedByWindow) return;
    if (placeholders.some((ph) => !values[ph]?.trim())) {
      setError("Please fill in every variable.");
      return;
    }
    setError(null);
    setConfirming(true);
  }

  async function handleSend() {
    if (!template) return;
    setSending(true);
    setError(null);
    const result =
      template.kind === "meta"
        ? await onSendMetaTemplate?.(
            template.id,
            placeholders.map((ph) => values[ph]?.trim() ?? ""),
          )
        : await onSendText?.(preview);
    setSending(false);
    setConfirming(false);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <div className="mb-3 max-h-[60vh] overflow-y-auto overscroll-contain rounded-md border bg-muted/20 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <FileText className="size-3.5" />
          Send a template
        </span>
        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close template form"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {templates === null ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading templates…
        </p>
      ) : metaTemplates.length === 0 && crmTemplates.length === 0 ? (
        <p className="text-muted-foreground">
          No templates yet. Create CRM templates on the Templates page, or create one in
          WhatsApp Manager and click &quot;Sync from Meta&quot;.
        </p>
      ) : (
        <div className="space-y-2">
          <Select
            value={templateId || null}
            onValueChange={(val) => handleSelect(typeof val === "string" ? val : "")}
            disabled={sending}
          >
            <SelectTrigger className="h-8 w-full text-xs font-medium" aria-label="Template">
              <SelectValue placeholder="Choose a template…">
                {(value: string | null) =>
                  templates?.find((t) => t.id === value)?.name ?? "Choose a template…"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {metaTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Approved by Meta (any time)</SelectLabel>
                  {metaTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {crmTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>CRM templates (24-hour window only)</SelectLabel>
                  {crmTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id} disabled={!windowOpen}>
                      {t.name}
                      {windowOpen ? "" : " (window closed)"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>

          {template && (
            <p className="text-muted-foreground">
              {template.kind === "meta"
                ? "Approved Meta template: delivered even if the reply window is closed."
                : "CRM template: sent as a normal message while the reply window is open."}
            </p>
          )}

          {placeholders.map((ph) => (
            <div key={ph} className="flex items-center gap-2">
              <span className="w-10 shrink-0 font-mono text-primary">{`{{${ph}}}`}</span>
              <Input
                value={values[ph] ?? ""}
                onChange={(e) => {
                  setValues((current) => ({ ...current, [ph]: e.target.value }));
                  setConfirming(false);
                }}
                placeholder={template?.variables?.[ph] ? `e.g. ${template.variables[ph]}` : "Value"}
                disabled={sending}
                className="h-8 text-xs"
              />
            </div>
          ))}

          {template && (
            <p className="whitespace-pre-wrap rounded-md border bg-background p-2 text-foreground/90">
              {preview}
            </p>
          )}

          {blockedByWindow && (
            <p className="text-amber-700 dark:text-amber-400">
              The reply window is closed, so this CRM template can&apos;t be delivered. Choose an
              approved Meta template instead.
            </p>
          )}

          {error && <p className="text-destructive">{error}</p>}

          {confirming && template ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <p className="font-medium text-foreground">
                Send &quot;{template.name}&quot; to {contactName || "this contact"}?
              </p>
              <p className="mt-0.5 text-muted-foreground">
                The message above will go out on WhatsApp immediately.
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" onClick={handleSend} disabled={sending}>
                  {sending ? "Sending…" : "Yes, send"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                  disabled={sending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleReview}
              disabled={!template || blockedByWindow}
            >
              Send template
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
