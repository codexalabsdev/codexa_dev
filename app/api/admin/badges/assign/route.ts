import { NextResponse } from "next/server";
import { AdminApiError } from "@/lib/supabase/server-client";
import { requireWorkspacePermission } from "@/lib/supabase/workspace-auth";

export async function POST(request: Request) {
  try {
    const actor = await requireWorkspacePermission("badges", "manage");
    const body = (await request.json()) as {
      badgeId?: unknown;
      memberId?: unknown;
    };
    if (typeof body.badgeId !== "string" || typeof body.memberId !== "string")
      return NextResponse.json(
        { error: "Emblema ou membro inválido." },
        { status: 400 },
      );
    const { data: badge } = await actor.supabase
      .from("profile_badges")
      .select(
        "id,name,description,color,image_path,is_temporary,duration_days,assignment_expires_at,is_active,category,rarity,unlock_criteria",
      )
      .eq("id", body.badgeId)
      .is("member_id", null)
      .maybeSingle();
    if (!badge)
      return NextResponse.json(
        { error: "Emblema não encontrado na biblioteca." },
        { status: 404 },
      );
    if (!badge.is_active)
      return NextResponse.json(
        { error: "Este emblema foi arquivado e não pode mais ser atribuído." },
        { status: 410 },
      );
    if (
      badge.is_temporary &&
      badge.assignment_expires_at &&
      new Date(badge.assignment_expires_at) <= new Date()
    )
      return NextResponse.json(
        { error: "O período de atribuição deste emblema terminou." },
        { status: 410 },
      );
    const { data: existing } = await actor.supabase
      .from("profile_badges")
      .select("id")
      .eq("source_badge_id", badge.id)
      .eq("member_id", body.memberId)
      .maybeSingle();
    if (existing)
      return NextResponse.json(
        { error: "Este usuário já recebeu esse emblema." },
        { status: 409 },
      );
    const { data: member } = await actor.supabase
      .from("team_members")
      .select("id,xp,level,status")
      .eq("id", body.memberId)
      .maybeSingle();
    if (
      !member ||
      !["active", "ativo", "enabled", "habilitado"].includes(
        String(member.status).toLowerCase().replaceAll('"', ""),
      )
    )
      return NextResponse.json(
        { error: "Membro não encontrado ou inativo." },
        { status: 404 },
      );
    const { data: assignment, error: assignmentError } = await actor.supabase
      .from("profile_badges")
      .insert({
        source_badge_id: badge.id,
        member_id: member.id,
        name: badge.name,
        description: badge.description,
        color: badge.color,
        image_path: badge.image_path,
        is_temporary: badge.is_temporary,
        duration_days: badge.duration_days,
        expires_at: null,
        granted_by: actor.memberId,
        granted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (assignmentError || !assignment)
      throw new AdminApiError(
        "Não foi possível atribuir o emblema. Aplique a migração de catálogo de emblemas no Supabase.",
        503,
      );

    const { data: awardedXp, error: awardError } = await actor.supabase.rpc(
      "award_xp",
      {
        p_member_id: member.id,
        p_action_key: "assign_badge",
        p_entity_type: "badge",
        p_entity_id: assignment.id,
      },
    );
    if (awardError) {
      const { error: rollbackError } = await actor.supabase
        .from("profile_badges")
        .delete()
        .eq("id", assignment.id);
      if (rollbackError)
        console.error(
          "Badge assignment rollback failed:",
          rollbackError.message,
        );
      throw new AdminApiError(
        "Não foi possível registrar o XP do emblema. A atribuição não foi concluída.",
        503,
      );
    }

    return NextResponse.json({
      ok: true,
      badge: badge.name,
      awardedXp: Number(awardedXp ?? 0),
    });
  } catch (error) {
    if (error instanceof AdminApiError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("Badge assignment failed:", error);
    return NextResponse.json(
      { error: "Não foi possível atribuir o emblema." },
      { status: 500 },
    );
  }
}
