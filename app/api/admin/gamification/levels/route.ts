import { NextResponse } from "next/server";
import { AdminApiError } from "@/lib/supabase/server-client";
import { requireWorkspacePermission } from "@/lib/supabase/workspace-auth";

const fields =
  "id,level,name,description,min_xp,icon,color,sort_order,is_active";

export async function POST(request: Request) {
  try {
    const actor = await requireWorkspacePermission("badges", "manage");
    const body = (await request.json()) as {
      level?: number;
      name?: string;
      description?: string;
      minXp?: number;
      icon?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
    };
    const level = Number(body.level);
    const minXp = Number(body.minXp);
    if (
      !Number.isInteger(level) ||
      level < 1 ||
      !body.name?.trim() ||
      !Number.isInteger(minXp) ||
      minXp < 0 ||
      minXp > 10000000
    )
      return NextResponse.json(
        { error: "Informe nível, nome e XP mínimo válidos." },
        { status: 400 },
      );
    const { data, error } = await actor.supabase
      .from("gamification_levels")
      .insert({
        level,
        name: body.name.trim().slice(0, 80),
        description: body.description?.trim().slice(0, 240) ?? "",
        min_xp: minXp,
        icon: body.icon?.trim().slice(0, 40) || "star",
        color: body.color?.trim() || "#60a5fa",
        sort_order: Number.isInteger(body.sortOrder) ? body.sortOrder : level,
        is_active: body.isActive !== false,
      })
      .select(fields)
      .single();
    if (error || !data)
      throw new AdminApiError("Não foi possível criar o nível.", 503);
    return NextResponse.json({ level: data });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireWorkspacePermission("badges", "manage");
    const body = (await request.json()) as {
      id?: string;
      level?: number;
      name?: string;
      description?: string;
      minXp?: number;
      icon?: string;
      color?: string;
      sortOrder?: number;
      isActive?: boolean;
    };
    if (
      !body.id ||
      !body.name?.trim() ||
      !Number.isInteger(Number(body.level)) ||
      !Number.isInteger(Number(body.minXp)) ||
      Number(body.minXp) < 0
    )
      return NextResponse.json(
        { error: "Dados do nível inválidos." },
        { status: 400 },
      );
    const { data, error } = await actor.supabase
      .from("gamification_levels")
      .update({
        level: Number(body.level),
        name: body.name.trim().slice(0, 80),
        description: body.description?.trim().slice(0, 240) ?? "",
        min_xp: Number(body.minXp),
        icon: body.icon?.trim().slice(0, 40) || "star",
        color: body.color?.trim() || "#60a5fa",
        sort_order: Number.isInteger(body.sortOrder)
          ? body.sortOrder
          : Number(body.level),
        is_active: body.isActive !== false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id)
      .select(fields)
      .single();
    if (error || !data)
      throw new AdminApiError("Não foi possível atualizar o nível.", 503);
    return NextResponse.json({ level: data });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireWorkspacePermission("badges", "manage");
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !body.id)
      return NextResponse.json({ error: "Nível inválido." }, { status: 400 });

    const { data, error } = await actor.supabase
      .from("gamification_levels")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select(fields)
      .single();
    if (error || !data)
      throw new AdminApiError("Não foi possível arquivar o nível.", 503);
    return NextResponse.json({ level: data });
  } catch (error) {
    return fail(error);
  }
}

function fail(error: unknown) {
  if (error instanceof AdminApiError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error("Gamification levels failed:", error);
  return NextResponse.json(
    { error: "Não foi possível salvar o nível." },
    { status: 500 },
  );
}
