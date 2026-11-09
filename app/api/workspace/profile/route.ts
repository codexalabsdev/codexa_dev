import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor } from '@/lib/supabase/workspace-auth'
import { computeLevelState } from '@/lib/gamification'

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Workspace profile update failed:', error)
  return NextResponse.json({ error: 'Não foi possível atualizar seu perfil.' }, { status: 500 })
}

export async function GET() {
  try {
    const actor = await getWorkspaceActor()
    const { data: authUser, error } = await actor.supabase.auth.admin.getUserById(actor.actorId)
    if (error || !authUser.user) throw new AdminApiError('Não foi possível carregar seu perfil.', 503)
    const [{ data: member }, { data: levels }] = await Promise.all([
      actor.supabase.from('team_members').select('full_name, email, role_name, xp, level').eq('id', actor.memberId).maybeSingle(),
      actor.supabase.from('gamification_levels').select('level,name,min_xp').eq('is_active', true).order('min_xp'),
    ])
    const { data: badges } = await actor.supabase.from('profile_badges').select('id, name, description, color, image_path, granted_at, expires_at, is_temporary').eq('member_id', actor.memberId).order('granted_at', { ascending: false })
    const metadata = authUser.user.user_metadata ?? {}
    const badgePaths = [...new Set((badges ?? []).map((badge) => badge.image_path).filter(Boolean))] as string[]
    const signed = badgePaths.length ? await actor.supabase.storage.from('private-documents').createSignedUrls(badgePaths, 3600) : { data: [] }
    const badgeUrls = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]))
    const badgesWithImages = (badges ?? []).map((badge) => ({ ...badge, image_url: badge.image_path ? badgeUrls.get(badge.image_path) ?? null : null }))
    const points = Number(member?.xp ?? metadata.profile_points ?? 0)
    const configuredLevels = (levels ?? []).filter((item) => (item as { is_active?: boolean | null }).is_active !== false)
    const levelState = computeLevelState(points, configuredLevels)
    return NextResponse.json({
      fullName: member?.full_name ?? metadata.full_name ?? '',
      nickname: metadata.nickname ?? '',
      avatarUrl: metadata.avatar_url ?? '',
      email: authUser.user.email ?? member?.email ?? '',
      role: member?.role_name ?? 'Membro',
      points,
      level: levelState.level,
      levelName: levelState.levelName,
      hasNextMilestone: levelState.hasNextMilestone,
      currentLevelXp: levelState.currentLevelXp,
      nextLevelXp: levelState.nextLevelXp,
      progress: levelState.progress,
      badges: badgesWithImages,
    })
  } catch (error) { return fail(error) }
}

export async function PATCH(request: Request) {
  let body: { fullName?: unknown; nickname?: unknown; avatarUrl?: unknown }
  try {
    body = await request.json() as { fullName?: unknown }
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }

  if (typeof body.fullName !== 'string' || body.fullName.trim().length < 2 || body.fullName.trim().length > 200) return NextResponse.json({ error: 'Informe um nome entre 2 e 200 caracteres.' }, { status: 400 })
  if (body.nickname !== undefined && (typeof body.nickname !== 'string' || body.nickname.trim().length > 40)) return NextResponse.json({ error: 'O apelido deve ter até 40 caracteres.' }, { status: 400 })
  if (body.avatarUrl !== undefined && (typeof body.avatarUrl !== 'string' || (body.avatarUrl.trim() && !/^https:\/\//i.test(body.avatarUrl.trim())))) return NextResponse.json({ error: 'A foto deve usar uma URL HTTPS válida.' }, { status: 400 })

  try {
    const actor = await getWorkspaceActor()
    const { data: authUser, error: authLookupError } = await actor.supabase.auth.admin.getUserById(actor.actorId)
    if (authLookupError || !authUser.user) throw new AdminApiError('Não foi possível localizar sua conta.', 503)
    const previousMetadata = authUser.user.user_metadata ?? {}
    const fullName = body.fullName.trim()
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : String(previousMetadata.nickname ?? '')
    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : String(previousMetadata.avatar_url ?? '')
    const { error: authUpdateError } = await actor.supabase.auth.admin.updateUserById(actor.actorId, {
      user_metadata: { ...previousMetadata, display_name: fullName, full_name: fullName, nickname, avatar_url: avatarUrl },
    })
    if (authUpdateError) {
      console.error('Workspace profile auth update failed:', authUpdateError.message)
      throw new AdminApiError('Não foi possível atualizar os dados da conta.', 503)
    }

    const { error: memberUpdateError } = await actor.supabase.from('team_members')
      .update({ full_name: fullName, updated_at: new Date().toISOString() })
      .eq('id', actor.memberId)
    if (memberUpdateError) {
      const { error: rollbackError } = await actor.supabase.auth.admin.updateUserById(actor.actorId, {
        user_metadata: previousMetadata,
      })
      if (rollbackError) console.error('Workspace profile auth rollback failed:', rollbackError.message)
      console.error('Workspace profile member update failed:', memberUpdateError.message)
      throw new AdminApiError('Não foi possível salvar o nome do membro da equipe.', 503)
    }

    return NextResponse.json({ fullName })
  } catch (error) {
    return fail(error)
  }
}
