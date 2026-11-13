import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor } from '@/lib/supabase/workspace-auth'
import { computeLevelState } from '@/lib/gamification'

function isMissingContactSchemaError(error: { code?: string | null; message?: string | null } | null | undefined) {
  return Boolean(error && (
    ['42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
    || /phone_e164|whatsapp_enabled/i.test(error.message ?? '')
  ))
}

function normalizeE164Phone(value: string) {
  const normalized = value.trim().replace(/[\s().-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}

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
    const [memberResult, levelsResult] = await Promise.all([
      actor.supabase.from('team_members').select('full_name, email, role_name, xp, level, phone_e164, whatsapp_enabled').eq('id', actor.memberId).maybeSingle(),
      actor.supabase.from('gamification_levels').select('level,name,min_xp').eq('is_active', true).order('min_xp'),
    ])
    type MemberProfile = { full_name?: string | null; email?: string | null; role_name?: string | null; xp?: number | null; level?: number | null; phone_e164?: string | null; whatsapp_enabled?: boolean | null }
    let member = memberResult.data as MemberProfile | null
    if (memberResult.error && isMissingContactSchemaError(memberResult.error)) {
      const fallback = await actor.supabase.from('team_members').select('full_name, email, role_name, xp, level').eq('id', actor.memberId).maybeSingle()
      if (fallback.error) throw fallback.error
      member = fallback.data as MemberProfile | null
    } else if (memberResult.error) {
      throw memberResult.error
    }
    const { data: levels } = levelsResult
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
      phone: member?.phone_e164 ?? '',
      whatsappEnabled: Boolean(member?.whatsapp_enabled),
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
  let body: { fullName?: unknown; nickname?: unknown; avatarUrl?: unknown; phone?: unknown; whatsappEnabled?: unknown }
  try {
    body = await request.json() as { fullName?: unknown; nickname?: unknown; avatarUrl?: unknown; phone?: unknown; whatsappEnabled?: unknown }
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }

  const hasIdentityUpdates = body.fullName !== undefined || body.nickname !== undefined || body.avatarUrl !== undefined
  const hasContactUpdates = body.phone !== undefined || body.whatsappEnabled !== undefined
  if (!hasIdentityUpdates && !hasContactUpdates) return NextResponse.json({ error: 'Nenhum dado para atualizar.' }, { status: 400 })
  if (body.fullName !== undefined && (typeof body.fullName !== 'string' || body.fullName.trim().length < 2 || body.fullName.trim().length > 200)) return NextResponse.json({ error: 'Informe um nome entre 2 e 200 caracteres.' }, { status: 400 })
  if (body.nickname !== undefined && (typeof body.nickname !== 'string' || body.nickname.trim().length > 40)) return NextResponse.json({ error: 'O apelido deve ter até 40 caracteres.' }, { status: 400 })
  if (body.avatarUrl !== undefined && (typeof body.avatarUrl !== 'string' || (body.avatarUrl.trim() && !/^https:\/\//i.test(body.avatarUrl.trim())))) return NextResponse.json({ error: 'A foto deve usar uma URL HTTPS válida.' }, { status: 400 })
  if (hasContactUpdates && (body.phone === undefined || body.whatsappEnabled === undefined || typeof body.phone !== 'string' || typeof body.whatsappEnabled !== 'boolean')) {
    return NextResponse.json({ error: 'Informe o telefone e a opção de WhatsApp juntos.' }, { status: 400 })
  }

  let phone: string | null = null
  if (hasContactUpdates) {
    const rawPhone = (body.phone as string).trim()
    phone = rawPhone ? normalizeE164Phone(rawPhone) : null
    if (rawPhone && !phone) return NextResponse.json({ error: 'Informe um telefone válido no formato internacional, como +55 11 91234-5678.' }, { status: 400 })
    if (body.whatsappEnabled && !phone) return NextResponse.json({ error: 'Informe um telefone antes de ativar o WhatsApp.' }, { status: 400 })
  }

  try {
    const actor = await getWorkspaceActor()
    let previousMetadata: Record<string, unknown> = {}
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : undefined

    if (hasIdentityUpdates) {
      const { data: authUser, error: authLookupError } = await actor.supabase.auth.admin.getUserById(actor.actorId)
      if (authLookupError || !authUser.user) throw new AdminApiError('Não foi possível localizar sua conta.', 503)
      previousMetadata = authUser.user.user_metadata ?? {}
      const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : String(previousMetadata.nickname ?? '')
      const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : String(previousMetadata.avatar_url ?? '')
      const nextMetadata = { ...previousMetadata, nickname, avatar_url: avatarUrl }
      if (fullName !== undefined) Object.assign(nextMetadata, { display_name: fullName, full_name: fullName })
      const { error: authUpdateError } = await actor.supabase.auth.admin.updateUserById(actor.actorId, { user_metadata: nextMetadata })
      if (authUpdateError) {
        console.error('Workspace profile auth update failed:', authUpdateError.message)
        throw new AdminApiError('Não foi possível atualizar os dados da conta.', 503)
      }
    }

    const memberUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (fullName !== undefined) memberUpdates.full_name = fullName
    if (hasContactUpdates) {
      memberUpdates.phone_e164 = phone
      memberUpdates.whatsapp_enabled = body.whatsappEnabled
    }
    if (Object.keys(memberUpdates).length > 1) {
      const { error: memberUpdateError } = await actor.supabase.from('team_members').update(memberUpdates).eq('id', actor.memberId)
      if (memberUpdateError) {
        if (hasIdentityUpdates) {
          const { error: rollbackError } = await actor.supabase.auth.admin.updateUserById(actor.actorId, { user_metadata: previousMetadata })
          if (rollbackError) console.error('Workspace profile auth rollback failed:', rollbackError.message)
        }
        if (hasContactUpdates && isMissingContactSchemaError(memberUpdateError)) {
          return NextResponse.json({ error: 'A estrutura de contato ainda não foi aplicada no banco. Aplique o arquivo SQL manual fornecido.' }, { status: 503 })
        }
        console.error('Workspace profile member update failed:', memberUpdateError.message)
        throw new AdminApiError('Não foi possível salvar os dados do perfil.', 503)
      }
    }

    return NextResponse.json({ ...(fullName !== undefined ? { fullName } : {}), ...(hasContactUpdates ? { phone, whatsappEnabled: body.whatsappEnabled } : {}) })
  } catch (error) {
    return fail(error)
  }
}
