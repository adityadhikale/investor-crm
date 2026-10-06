import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

/**
 * Ensures the user is authenticated for Server Components (pages).
 * If unauthenticated, immediately redirects to /login.
 */
export async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

/**
 * Like requireActionAuth, but also confirms the signed-in user is the CRM
 * owner (the same check the database's row-level security uses). For actions
 * that run with the service-role key and so bypass those database rules.
 */
export async function requireOwnerAction() {
  const auth = await requireActionAuth();
  if (auth.error || !auth.supabase) return auth;

  const { data: isOwner, error } = await auth.supabase.rpc("is_crm_owner");
  if (error || isOwner !== true) {
    return { supabase: null, user: null, error: "Unauthorized" as const };
  }
  return auth;
}

/**
 * Ensures the caller is authenticated for Server Actions.
 * If unauthenticated, returns an Unauthorized error response instead of redirecting.
 */
export async function requireActionAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null, error: "Unauthorized" as const };
  }

  return { supabase, user, error: null };
}
