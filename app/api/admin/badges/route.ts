import { NextResponse } from "next/server";
import { AdminApiError } from "@/lib/supabase/server-client";
import { requireWorkspacePermission } from "@/lib/supabase/workspace-auth";
import { computeLevelState } from "@/lib/gamification";

const allowedColors = new Set(["cyan", "violet", "amber", "emerald", "rose"]);
const allowedCategories = new Set([
  "Produtividade",
  "Desenvolvimento",
  "Organização",
  "Atendimento",
  "Colaboração",
  "Liderança",
  "Metas",
  "Conquistas especiais",
]);
const allowedRarities = new Set([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "special",
]);
const badgeFields =
  "id,name,description,color,image_path,granted_at,member_id,granted_by,is_temporary,duration_days,category,rarity,unlock_criteria,is_active,archived_at";
function fail(error: unknown) {
  if (error instanceof AdminApiError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error("Badge administration failed:", error);
  return NextResponse.json(
    { error: "Não foi possível concluir a operação de emblemas." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const actor = await requireWorkspacePermission("badges", "manage");
    const [
      { data: badges, error: badgesError },
      { data: members, error: membersError },
      { data: levels, error: levelsError },
      { data: assignments, error: assignmentsError },
    ] = await Promise.all([
      actor.supabase
        .from("profile_badges")
        .select(badgeFields)
        .is("member_id", null)
        .order("granted_at", { ascending: false }),
      actor.supabase
        .from("team_members")
        .select("id,full_name,email,role_name,xp,level,status")
        .order("xp", { ascending: false })
        .limit(500),
      actor.supabase
        .from("gamification_levels")
        .select("level,name,min_xp")
        .eq("is_active", true)
        .order("min_xp"),
      actor.supabase
        .from("profile_badges")
        .select("source_badge_id")
        .not("source_badge_id", "is", null),
    ]);
    if (membersError || levelsError || assignmentsError)
      throw new AdminApiError(
        "Não foi possível carregar emblemas e ranking.",
        503,
      );
    let catalogRows = badges ?? [];
    let migrationRequired = false;
    if (badgesError) {
      const missingCatalogSchema =
        badgesError.code === "42703" ||
        /category|rarity|unlock_criteria|is_active|archived_at/i.test(
          badgesError.message,
        );
      if (!missingCatalogSchema) throw badgesError;
      const legacy = await actor.supabase
        .from("profile_badges")
        .select(
          "id,name,description,color,image_path,granted_at,member_id,granted_by,is_temporary,duration_days",
        )
        .is("member_id", null)
        .order("granted_at", { ascending: false });
      if (legacy.error) throw legacy.error;
      migrationRequired = true;
      catalogRows = (legacy.data ?? []).map((badge) => ({
        ...badge,
        category: "Conquistas especiais",
        rarity: "common",
        unlock_criteria: {},
        is_active: true,
        archived_at: null,
      }));
    }
    const paths = [
      ...new Set(
        catalogRows.map((badge) => badge.image_path).filter(Boolean),
      ),
    ] as string[];
    const signed = paths.length
      ? await actor.supabase.storage
          .from("private-documents")
          .createSignedUrls(paths, 3600)
      : { data: [] };
    const urls = new Map(
      (signed.data ?? []).map((item) => [item.path, item.signedUrl]),
    );
    const configuredLevels = levels ?? [];
    const grantCounts = new Map<string, number>();
    for (const assignment of assignments ?? []) {
      if (assignment.source_badge_id) {
        grantCounts.set(
          assignment.source_badge_id,
          (grantCounts.get(assignment.source_badge_id) ?? 0) + 1,
        );
      }
    }
    const rankedMembers = (members ?? []).map((member) => ({
      ...member,
      level: computeLevelState(Number(member.xp ?? 0), configuredLevels).level,
    }));
    return NextResponse.json(
      {
        badges: catalogRows.map((badge) => ({
          ...badge,
          grant_count: grantCounts.get(badge.id) ?? 0,
          image_url: badge.image_path
            ? (urls.get(badge.image_path) ?? null)
            : null,
        })),
        members: rankedMembers,
        migrationRequired,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireWorkspacePermission("badges", "manage");
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const color = String(form.get("color") ?? "cyan");
    const category = String(form.get("category") ?? "Conquistas especiais");
    const rarity = String(form.get("rarity") ?? "common");
    const isActive = form.get("is_active") !== "false";
    const sourceBadgeId = String(form.get("source_badge_id") ?? "").trim();
    let unlockCriteria: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(form.get("unlock_criteria") ?? "{}"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid criteria");
      unlockCriteria = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          error: "Os critérios de desbloqueio devem ser um objeto JSON válido.",
        },
        { status: 400 },
      );
    }
    const isTemporary = form.get("is_temporary") === "true";
    const durationDays = isTemporary
      ? Number(form.get("duration_days") ?? 30)
      : null;
    if (
      name.length < 2 ||
      name.length > 80 ||
      description.length > 240 ||
      !allowedColors.has(color) ||
      !allowedCategories.has(category) ||
      !allowedRarities.has(rarity) ||
      (isTemporary &&
        (durationDays === null ||
          !Number.isInteger(durationDays) ||
          durationDays < 1 ||
          durationDays > 3650))
    )
      return NextResponse.json(
        { error: "Nome, descrição ou cor inválidos." },
        { status: 400 },
      );
    let imagePath: string | null = null;
    if (sourceBadgeId) {
      const { data: source } = await actor.supabase
        .from("profile_badges")
        .select("image_path,is_active")
        .eq("id", sourceBadgeId)
        .is("member_id", null)
        .maybeSingle();
      if (!source || !source.is_active)
        return NextResponse.json(
          { error: "O emblema de origem não está disponível para cópia." },
          { status: 404 },
        );
      imagePath = source.image_path;
    }
    const file = form.get("image");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024)
        return NextResponse.json(
          { error: "Envie uma imagem de até 2 MB." },
          { status: 400 },
        );
      imagePath = `badges/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const upload = await actor.supabase.storage
        .from("private-documents")
        .upload(imagePath, file, { contentType: file.type, upsert: false });
      if (upload.error)
        throw new AdminApiError(
          "Não foi possível armazenar a imagem do emblema.",
          503,
        );
    }
    const { data, error } = await actor.supabase
      .from("profile_badges")
      .insert({
        member_id: null,
        name,
        description,
        color,
        image_path: imagePath,
        category,
        rarity,
        unlock_criteria: unlockCriteria,
        is_active: isActive,
        granted_by: actor.memberId,
        is_temporary: isTemporary,
        duration_days: durationDays,
        assignment_expires_at:
          isTemporary && durationDays
            ? new Date(Date.now() + durationDays * 86400000).toISOString()
            : null,
      })
      .select(badgeFields)
      .single();
    if (error || !data) {
      console.error("Badge insert failed:", error?.message);
      throw new AdminApiError(
        "Não foi possível criar o emblema. A migração de emblemas precisa estar aplicada no Supabase.",
        503,
      );
    }
    return NextResponse.json({ badge: data }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireWorkspacePermission("badges", "manage");
    const form = await request.formData();
    const id = String(form.get("id") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const color = String(form.get("color") ?? "cyan");
    const category = String(form.get("category") ?? "Conquistas especiais");
    const rarity = String(form.get("rarity") ?? "common");
    const isTemporary = form.get("is_temporary") === "true";
    const durationDays = isTemporary
      ? Number(form.get("duration_days") ?? 30)
      : null;
    const isActive = form.get("is_active") !== "false";
    let unlockCriteria: Record<string, unknown>;
    try {
      const parsed = JSON.parse(String(form.get("unlock_criteria") ?? "{}"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid criteria");
      unlockCriteria = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          error: "Os critérios de desbloqueio devem ser um objeto JSON válido.",
        },
        { status: 400 },
      );
    }
    if (
      !id ||
      name.length < 2 ||
      name.length > 80 ||
      description.length > 240 ||
      !allowedColors.has(color) ||
      !allowedCategories.has(category) ||
      !allowedRarities.has(rarity) ||
      (isTemporary &&
        (durationDays === null ||
          !Number.isInteger(durationDays) ||
          durationDays < 1 ||
          durationDays > 3650))
    )
      return NextResponse.json(
        { error: "Dados do emblema inválidos." },
        { status: 400 },
      );

    const { data: current } = await actor.supabase
      .from("profile_badges")
      .select("id,image_path")
      .eq("id", id)
      .is("member_id", null)
      .maybeSingle();
    if (!current)
      return NextResponse.json(
        { error: "Emblema não encontrado na biblioteca." },
        { status: 404 },
      );

    let imagePath = current.image_path;
    const file = form.get("image");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024)
        return NextResponse.json(
          { error: "Envie uma imagem de até 2 MB." },
          { status: 400 },
        );
      imagePath = `badges/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const upload = await actor.supabase.storage
        .from("private-documents")
        .upload(imagePath, file, { contentType: file.type, upsert: false });
      if (upload.error)
        throw new AdminApiError(
          "Não foi possível armazenar a imagem do emblema.",
          503,
        );
    }

    const { data, error } = await actor.supabase
      .from("profile_badges")
      .update({
        name,
        description,
        color,
        image_path: imagePath,
        category,
        rarity,
        unlock_criteria: unlockCriteria,
        is_active: isActive,
        archived_at: isActive ? null : new Date().toISOString(),
        is_temporary: isTemporary,
        duration_days: durationDays,
        assignment_expires_at:
          isTemporary && durationDays
            ? new Date(Date.now() + durationDays * 86400000).toISOString()
            : null,
      })
      .eq("id", id)
      .is("member_id", null)
      .select(badgeFields)
      .single();
    if (error || !data)
      throw new AdminApiError(
        "Não foi possível atualizar o emblema. Aplique a migration 20261031100000_gamification_badge_catalog no Supabase.",
        503,
      );
    return NextResponse.json({ badge: data });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireWorkspacePermission("badges", "manage");
    const body = (await request.json()) as { id?: unknown; mode?: unknown };
    if (typeof body.id !== "string" || !body.id)
      return NextResponse.json({ error: "Emblema inválido." }, { status: 400 });

    if (body.mode === "delete") {
      const { data: badge, error: badgeError } = await actor.supabase
        .from("profile_badges")
        .select("id,name,image_path")
        .eq("id", body.id)
        .is("member_id", null)
        .maybeSingle();
      if (badgeError)
        throw new AdminApiError("Não foi possível verificar o emblema.", 503);
      if (!badge)
        return NextResponse.json(
          { error: "Emblema não encontrado na biblioteca." },
          { status: 404 },
        );

      const { count: grantCount, error: grantError } = await actor.supabase
        .from("profile_badges")
        .select("id", { count: "exact", head: true })
        .eq("source_badge_id", badge.id)
        .not("member_id", "is", null);
      if (grantError)
        throw new AdminApiError(
          "Não foi possível verificar o histórico de concessões.",
          503,
        );
      if ((grantCount ?? 0) > 0)
        return NextResponse.json(
          {
            error: "Este emblema já foi concedido. Arquive-o para preservar as conquistas existentes.",
            grantCount,
          },
          { status: 409 },
        );

      const { error: deleteError } = await actor.supabase
        .from("profile_badges")
        .delete()
        .eq("id", badge.id)
        .is("member_id", null);
      if (deleteError)
        throw new AdminApiError("Não foi possível excluir o emblema.", 503);

      if (badge.image_path) {
        const { count: imageReferences, error: imageReferenceError } =
          await actor.supabase
            .from("profile_badges")
            .select("id", { count: "exact", head: true })
            .eq("image_path", badge.image_path);
        if (!imageReferenceError && (imageReferences ?? 0) === 0) {
          const { error: imageDeleteError } = await actor.supabase.storage
            .from("private-documents")
            .remove([badge.image_path]);
          if (imageDeleteError)
            console.error(
              "Badge image cleanup failed:",
              imageDeleteError.message,
            );
        }
      }

      return NextResponse.json({ deleted: true, badge: badge.name });
    }

    const { data, error } = await actor.supabase
      .from("profile_badges")
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq("id", body.id)
      .is("member_id", null)
      .select("id,name,is_active,archived_at")
      .single();
    if (error || !data)
      throw new AdminApiError("Não foi possível arquivar o emblema.", 503);
    return NextResponse.json({ badge: data });
  } catch (error) {
    return fail(error);
  }
}
