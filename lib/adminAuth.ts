import { cookies } from "next/headers";
import { getSessionCookieName, verifySession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get(getSessionCookieName())?.value;
  if (!token) return null;
  try {
    const user = await verifySession(token);
    const supabase = getSupabaseServerClient();
    const { data } = await supabase.from("app_users").select("is_admin").eq("id", user.id).maybeSingle();
    if (!data?.is_admin) return null;
    return user;
  } catch {
    return null;
  }
}
