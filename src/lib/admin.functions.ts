import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function cabinetExists() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "cabinet");
  return (count ?? 0) > 0;
}

// Public: tells the login page whether the first cabinet account must be created.
export const getBootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { needsBootstrap: !(await cabinetExists()) };
});

// Public but only works while no cabinet account exists yet.
export const bootstrapCabinet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email(), password: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    if (await cabinetExists()) throw new Error("Le compte cabinet existe déjà.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "Création impossible");
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "cabinet" });
    return { ok: true };
  });

export const createClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ dossierId: z.string().uuid(), email: z.string().email(), password: z.string().min(8) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isCabinet } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "cabinet",
    });
    if (!isCabinet) throw new Error("Accès refusé");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // A client with several companies (Simon 6): an e-mail already member of another dossier gets this one too,
    // with its existing password; the client then switches dossier on its home page.
    const { data: known } = await supabaseAdmin
      .from("dossier_members")
      .select("user_id")
      .ilike("email", data.email.trim().replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1)
      .maybeSingle();
    if (known) {
      const { error: kErr } = await supabaseAdmin
        .from("dossier_members")
        .insert({ dossier_id: data.dossierId, user_id: known.user_id, email: data.email });
      if (kErr) throw new Error(kErr.code === "23505" ? "Ce client a déjà accès à ce dossier." : kErr.message);
      return { ok: true, existing: true };
    }
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "Création impossible");
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "client" });
    const { error: mErr } = await supabaseAdmin
      .from("dossier_members")
      .insert({ dossier_id: data.dossierId, user_id: created.user.id, email: data.email });
    if (mErr) throw new Error(mErr.message);
    return { ok: true, existing: false };
  });

// Cabinet accounts: any cabinet user can see them and add one (same pattern as client accounts).
export const listCabinetAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isCabinet } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "cabinet" });
    if (!isCabinet) throw new Error("Accès refusé");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "cabinet");
    if (error) throw new Error(error.message);
    const emails = await Promise.all(
      (roles ?? []).map(async (r) => (await supabaseAdmin.auth.admin.getUserById(r.user_id)).data.user?.email ?? null),
    );
    return emails.filter((e): e is string => !!e).sort();
  });

export const createCabinetAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email(), password: z.string().min(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isCabinet } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "cabinet" });
    if (!isCabinet) throw new Error("Accès refusé");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "Création impossible");
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "cabinet" });
    if (rErr) throw new Error(rErr.message);
    return { ok: true };
  });
