import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { createSignedPortfolioUrl } from "@/lib/supabase-storage";

export const dynamic = "force-dynamic";

/** Downloads the original file of a portfolio update (signed-in owner only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Row-level security limits this to the CRM owner's data.
  const { data: update } = await supabase
    .from("portfolio_updates")
    .select("file_path, file_name")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!update) return new NextResponse("Update not found.", { status: 404 });

  const signed = await createSignedPortfolioUrl(update.file_path, update.file_name);
  if (!signed) return new NextResponse("The file could not be opened.", { status: 404 });
  return NextResponse.redirect(signed);
}
