"use client";

import { useState, type ReactNode } from "react";
import {
  Bell,
  Database,
  Download,
  FileSpreadsheet,
  Mail,
  Palette,
  Sun,
} from "lucide-react";

import { saveAppSettings } from "@/app/settings/actions";
import { SendTestReminderButton } from "@/components/send-test-reminder-button";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Sun;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 border-b pb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold text-card-foreground">{title}</h2>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", disabled && "text-muted-foreground")}>
          {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        className="mt-0.5"
      />
    </div>
  );
}

export function SettingsPanel({
  initialSettings,
  envReminderEmail,
}: {
  initialSettings: AppSettings;
  /** The address used when no reminder email is saved here (from REMINDER_EMAIL_TO). */
  envReminderEmail: string | null;
}) {
  const { toast } = useToast();
  const { resolvedTheme, setTheme } = useTheme();
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [saved, setSaved] = useState<AppSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await saveAppSettings(settings);
    setSaving(false);

    if ("error" in result && result.error) {
      toast(result.error, "error");
      return;
    }
    setSaved(settings);
    toast("Settings saved");
  }

  return (
    <>
      <div className="mt-10">
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Preferences for how the CRM looks and what it notifies you about.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SettingsCard
          icon={Palette}
          title="Appearance"
          description="This is remembered on this device only."
        >
          <ToggleRow
            label="Dark mode"
            hint="Switch the whole CRM between light and dark."
            checked={resolvedTheme === "dark"}
            onChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </SettingsCard>

        <SettingsCard
          icon={Mail}
          title="Daily reminder email"
          description="A digest of what needs your attention, sent to you by email."
        >
          <ToggleRow
            label="Send the reminder email"
            hint="Turn off to stop scheduled reminder emails. The test button below still works."
            checked={settings.reminderEmailEnabled}
            onChange={(value) => update("reminderEmailEnabled", value)}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminder-email">Send it to</Label>
            <Input
              id="reminder-email"
              type="email"
              inputMode="email"
              placeholder={envReminderEmail ?? "name@company.com"}
              value={settings.reminderEmailTo ?? ""}
              onChange={(event) => update("reminderEmailTo", event.target.value)}
              disabled={!settings.reminderEmailEnabled}
            />
            <p className="text-xs text-muted-foreground">
              {envReminderEmail
                ? `Leave blank to use the default (${envReminderEmail}).`
                : "No default address is configured, so enter one here."}
            </p>
          </div>
          <ToggleRow
            label="Include follow-ups"
            hint="Overdue and due-today follow-ups."
            checked={settings.reminderIncludeFollowUps}
            onChange={(value) => update("reminderIncludeFollowUps", value)}
            disabled={!settings.reminderEmailEnabled}
          />
          <ToggleRow
            label="Include unread WhatsApp messages"
            hint="Contacts waiting for your reply."
            checked={settings.reminderIncludeUnread}
            onChange={(value) => update("reminderIncludeUnread", value)}
            disabled={!settings.reminderEmailEnabled}
          />
          <div className="border-t pt-4">
            <SendTestReminderButton />
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Bell}
          title="Notification bell"
          description="Choose what appears in the bell at the top of the page."
        >
          <ToggleRow
            label="New WhatsApp messages"
            hint="Contacts who have written to you and are waiting for a reply."
            checked={settings.notifyMessages}
            onChange={(value) => update("notifyMessages", value)}
          />
          <ToggleRow
            label="Follow-ups"
            hint="Overdue follow-ups and ones due today."
            checked={settings.notifyFollowUps}
            onChange={(value) => update("notifyFollowUps", value)}
          />
          <ToggleRow
            label="Sent broadcasts"
            hint="Broadcasts sent in the last 7 days. These never add to the red count."
            checked={settings.notifyBroadcasts}
            onChange={(value) => update("notifyBroadcasts", value)}
          />
        </SettingsCard>

        <SettingsCard
          icon={Database}
          title="Data & backup"
          description="Download your data. Worth doing regularly, and before any big import or cleanup."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Contacts (CSV)</p>
              <p className="text-xs text-muted-foreground">
                Name, phone, email, tags, notes and date saved. Opens in Excel.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href="/api/export/contacts" download />}
            >
              <FileSpreadsheet className="size-4" />
              Download
            </Button>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Full backup (JSON)</p>
              <p className="text-xs text-muted-foreground">
                Every table: contacts, groups, notes, follow-ups, templates, broadcasts and
                WhatsApp messages.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href="/api/export/backup" download />}
            >
              <Download className="size-4" />
              Download
            </Button>
          </div>
        </SettingsCard>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-6 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="text-sm text-muted-foreground">
          {dirty ? "You have unsaved changes." : "All changes saved."}
        </p>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </>
  );
}
