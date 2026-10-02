import type { Metadata } from "next";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  User as UserIcon,
  CheckCircle2,
  ShieldCheck,
  Building2,
  LayoutDashboard,
  Users,
  TrendingUp,
  Mail,
  Calendar,
  Clock,
  ArrowRight,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { SettingsPanel } from "@/components/settings-panel";
import { requireAuth } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "My Profile",
};

import { getUserDisplayName, getUserInitials } from "@/lib/user";

type ProfileData = {
  id: string;
  email: string;
  displayName: string;
  initials: string;
  isEmailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
};

function extractProfileDetails(user: User): ProfileData {
  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(displayName);

  return {
    id: user.id,
    email: user.email ?? "",
    displayName,
    initials,
    isEmailVerified: Boolean(user.email_confirmed_at),
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MyProfilePage() {
  const { user, supabase } = await requireAuth();

  const profile = extractProfileDetails(user);
  const settings = await getAppSettings(supabase);

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account information, CRM workspace access and settings.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Card 1: Profile / Identity */}
        <div className="flex flex-col justify-between rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
              {profile.initials}
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-foreground truncate">
                {profile.displayName}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground truncate">
                {profile.email || "No email available"}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>

                {profile.isEmailVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Email Verified
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Account Information */}
        <div className="flex flex-col rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b pb-3">
            <UserIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-card-foreground">Account Information</h2>
          </div>

          <div className="mt-4 flex flex-col gap-3.5 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                Email Address
              </span>
              <span className="font-medium text-foreground break-all sm:break-normal sm:truncate sm:max-w-[240px]">
                {profile.email || "—"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Member Since
              </span>
              <span className="font-medium text-foreground">
                {formatDate(profile.createdAt)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                Last Login
              </span>
              <span className="font-medium text-foreground">
                {formatDateTime(profile.lastSignInAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Workspace */}
        <div className="flex flex-col rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b pb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-card-foreground">Workspace</h2>
          </div>

          <div className="mt-4">
            <h3 className="font-semibold text-foreground">CREST Capital Management</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your investor relationship workspace.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Link
                href="/dashboard"
                className="group flex items-center justify-between rounded-lg border bg-background p-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                  Dashboard
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
              </Link>

              <Link
                href="/contacts"
                className="group flex items-center justify-between rounded-lg border bg-background p-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                  Contacts
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
              </Link>

              <Link
                href="/investors"
                className="group flex items-center justify-between rounded-lg border bg-background p-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                  Investors
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
              </Link>
            </div>
          </div>
        </div>

        {/* Card 4: Security & Session */}
        <div className="flex flex-col justify-between rounded-xl border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2 border-b pb-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-card-foreground">Security & Session</h2>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Session Status</p>
                <p className="text-xs text-muted-foreground">
                  Your account session is active.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Session
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Read how personal information is handled
            </p>
            <Link
              href="/privacy-policy"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground"
            >
              Privacy Policy
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Sign out from this device
            </p>
            <LogoutButton />
          </div>
        </div>
      </div>

      <SettingsPanel
        initialSettings={settings}
        envReminderEmail={process.env.REMINDER_EMAIL_TO?.trim() || null}
      />
    </div>
  );
}
