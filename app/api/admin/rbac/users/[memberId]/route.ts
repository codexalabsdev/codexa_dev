import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type MemberUpdate = { roleName?: unknown; status?: unknown; fullName?: unknown; email?: unknown }

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Team member update failed:', error)
  return NextResponse.json({ error: 'Não foi possível atualizar o usuário.' }, { status: 500 })
}

export async function PATCH(request: Request, context: { params: Promise<{ memberId: string }> }) {
  let body: MemberUpdate
  try {
    body = await request.json() as MemberUpdate
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }
  if ((body.roleName !== undefined && (typeof body.roleName !== 'string' || !body.roleName.trim()))
    || (body.status !== undefined && (typeof body.status !== 'string' || !['Ativo', 'Inativo'].includes(body.status)))
    || (body.fullName !== undefined && (typeof body.fullName !== 'string' || body.fullName.trim().length < 2 || body.fullName.trim().length > 200))
    || (body.email !== undefined && (typeof body.email !== 'string' || !emailPattern.test(body.email.trim())))
    || (body.roleName === undefined && body.status === undefined && body.fullName === undefined && body.email === undefined)) {
    return NextResponse.json({ error: 'Nome, e-mail, cargo ou status inválido.' }, { status: 400 })
  }

  try {
    const actor = await requireWorkspacePermission('users', 'manage_users')
    const { memberId } = await context.params
    if (!uuidPattern.test(memberId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })

    const { data: currentMember, error: memberError } = await actor.supabase
      .from('team_members')
      .select('id,user_id,full_name,email,role_name,status')
      .eq('id', memberId)
      .maybeSingle()
    if (memberError) throw memberError
    if (!currentMember) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : currentMember.full_name
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : currentMember.email
    const profileChanged = fullName !== currentMember.full_name || email !== currentMember.email
    if (profileChanged && currentMember.user_id === actor.actorId) {
      return NextResponse.json({ error: 'Não é possível editar os dados da própria conta por este painel.' }, { status: 403 })
    }

    if (email !== currentMember.email) {
      const { data: duplicates, error: duplicateError } = await actor.supabase
        .from('team_members').select('id').ilike('email', email).neq('id', memberId).limit(1)
      if (duplicateError) throw duplicateError
      if (duplicates?.length) return NextResponse.json({ error: 'Já existe um usuário da equipe com este e-mail.' }, { status: 409 })
    }

    let previousAuthUser: { email?: string; user_metadata: Record<string, unknown> } | null = null
    if (profileChanged && currentMember.user_id) {
      const { data: authResult, error: authLookupError } = await actor.supabase.auth.admin.getUserById(currentMember.user_id)
      if (authLookupError || !authResult.user) {
        console.error('Team auth user lookup failed:', authLookupError?.message ?? 'User not found')
        throw new AdminApiError('Não foi possível localizar a conta de autenticação do usuário.', 503)
      }
      previousAuthUser = { email: authResult.user.email, user_metadata: authResult.user.user_metadata ?? {} }
      const { error: authUpdateError } = await actor.supabase.auth.admin.updateUserById(currentMember.user_id, {
        ...(email !== currentMember.email ? { email, email_confirm: true } : {}),
        user_metadata: { ...previousAuthUser.user_metadata, full_name: fullName },
      })
      if (authUpdateError) {
        console.error('Team auth user update failed:', authUpdateError.message)
        return NextResponse.json({ error: 'Não foi possível atualizar os dados da conta de autenticação.' }, { status: 502 })
      }
    }

    let profileUpdated = false
    if (profileChanged) {
      const { error: profileError } = await actor.supabase.from('team_members')
        .update({ full_name: fullName, email, updated_at: new Date().toISOString() })
        .eq('id', memberId)
      if (profileError) {
        if (currentMember.user_id && previousAuthUser) {
          const { error: rollbackError } = await actor.supabase.auth.admin.updateUserById(currentMember.user_id, {
            ...(previousAuthUser.email ? { email: previousAuthUser.email, email_confirm: true } : {}),
            user_metadata: previousAuthUser.user_metadata,
          })
          if (rollbackError) console.error('Team auth update rollback failed:', rollbackError.message)
        }
        console.error('Team profile update failed:', profileError.message)
        return NextResponse.json({ error: 'Não foi possível salvar os dados do usuário.' }, { status: 503 })
      }
      profileUpdated = true
    }

    let roleStatusUpdated: Record<string, unknown> | null = null
    if (body.roleName !== undefined || body.status !== undefined) {
      const { data: updated, error: updateError } = await actor.supabase.rpc('update_workspace_member', {
        p_actor_id: actor.actorId,
        p_member_id: memberId,
        p_role_name: typeof body.roleName === 'string' ? body.roleName : null,
        p_status: typeof body.status === 'string' ? body.status : null,
      })
      if (updateError || !updated) {
        if (profileUpdated) {
          const { error: rollbackError } = await actor.supabase.from('team_members')
            .update({ full_name: currentMember.full_name, email: currentMember.email })
            .eq('id', memberId)
          if (rollbackError) console.error('Team profile rollback failed:', rollbackError.message)
          if (currentMember.user_id && previousAuthUser) {
            const { error: authRollbackError } = await actor.supabase.auth.admin.updateUserById(currentMember.user_id, {
              ...(previousAuthUser.email ? { email: previousAuthUser.email, email_confirm: true } : {}),
              user_metadata: previousAuthUser.user_metadata,
            })
            if (authRollbackError) console.error('Team auth update rollback failed:', authRollbackError.message)
          }
        }
        if (updateError?.code === '42501') return NextResponse.json({ error: 'Operação não autorizada.' }, { status: 403 })
        if (updateError?.code === '22023') return NextResponse.json({ error: 'Cargo ou status inválido.' }, { status: 400 })
        if (updateError?.code === 'P0002') return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
        if (updateError?.code === '23514') return NextResponse.json({ error: 'Não é possível desativar ou rebaixar o último administrador ativo.' }, { status: 409 })
        if (updateError) {
          console.error('Atomic team member update failed:', updateError.message)
          throw new AdminApiError('Não foi possível atualizar o usuário.', 503)
        }
        throw new AdminApiError('O banco não confirmou a atualização do usuário.', 503)
      }
      roleStatusUpdated = updated as Record<string, unknown>
    }

    let auditWarning: string | null = null
    if (profileUpdated) {
      const { error: auditError } = await actor.supabase.from('admin_audit_events').insert({
        actor_id: actor.actorId,
        action_name: 'team.profile_updated',
        entity_type: 'team_member',
        entity_id: memberId,
        previous_data: { full_name: currentMember.full_name, email: currentMember.email },
        new_data: { full_name: fullName, email },
        result: 'success',
      })
      if (auditError) {
        console.error('Team profile audit failed:', auditError.message)
        auditWarning = 'Os dados foram atualizados, mas a auditoria não pôde ser salva.'
      }
    }

    if (roleStatusUpdated) return NextResponse.json({ member: roleStatusUpdated, warning: auditWarning })
    const { data: updatedMember, error: updatedMemberError } = await actor.supabase.from('team_members')
      .select('id,user_id,full_name,email,role_name,status,created_at,updated_at')
      .eq('id', memberId)
      .single()
    if (updatedMemberError) throw updatedMemberError
    return NextResponse.json({ member: updatedMember, warning: auditWarning })
  } catch (error) {
    return fail(error)
  }
}
