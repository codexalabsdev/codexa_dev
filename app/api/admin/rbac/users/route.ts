import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspacePermissions, requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Team administration failed:', error)
  return NextResponse.json({ error: 'Não foi possível concluir a operação de equipe.' }, { status: 500 })
}

export async function GET() {
  try {
    const { supabase } = await requireWorkspacePermission('users', 'manage_users')
    const [{ data: members, error: membersError }, { data: roles, error: rolesError }] = await Promise.all([
      supabase.from('team_members')
        .select('id,user_id,full_name,email,job_title,department,joined_on,role_name,status,created_at,updated_at')
        .order('full_name')
        .limit(2000),
      supabase.from('access_roles').select('name,is_active').eq('is_active', true).order('name'),
    ])
    if (membersError || rolesError) {
      console.error('Team list load failed:', membersError?.message ?? rolesError?.message)
      return NextResponse.json({ error: 'Não foi possível carregar usuários e cargos.' }, { status: 503 })
    }
    const uniqueMembers = new Map<string, (typeof members)[number]>()
    for (const member of members ?? []) {
      const key = member.user_id ?? member.email.trim().toLowerCase()
      const previous = uniqueMembers.get(key)
      if (!previous || (!previous.user_id && member.user_id)) uniqueMembers.set(key, member)
    }
    return NextResponse.json({ members: [...uniqueMembers.values()], roles: roles ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  let body: { email?: unknown; fullName?: unknown; roleName?: unknown; password?: unknown }
  try {
    body = await request.json() as { email?: unknown; fullName?: unknown; roleName?: unknown; password?: unknown }
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }
  if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    || typeof body.fullName !== 'string' || body.fullName.trim().length < 2 || body.fullName.trim().length > 200
    || typeof body.roleName !== 'string') {
    return NextResponse.json({ error: 'Nome, e-mail ou cargo inválido.' }, { status: 400 })
  }

  try {
    const actor = await requireWorkspacePermission('users', 'manage_users')
    const email = body.email.trim().toLowerCase()
    const fullName = body.fullName.trim()
    const { data: role, error: roleError } = await actor.supabase
      .from('access_roles').select('id,name,is_active').eq('name', body.roleName).maybeSingle()
    if (roleError) throw roleError
    if (!role || !role.is_active) return NextResponse.json({ error: 'O cargo selecionado está inativo ou não existe.' }, { status: 400 })
    const actorPermissions = await getWorkspacePermissions(actor)
    if (role.name.trim().toLowerCase() === 'admin' && !actorPermissions.has('*')) {
      return NextResponse.json({ error: 'Seu cargo não permite criar administradores.' }, { status: 403 })
    }
    if (role.name.trim().toLowerCase() !== 'admin' && !actorPermissions.has('*')) {
      const { data: grants, error: grantsError } = await actor.supabase
        .from('role_permissions').select('permission_id').eq('role_id', role.id)
      if (grantsError) throw grantsError
      const ids = (grants ?? []).map((grant) => grant.permission_id)
      const { data: permissions, error: permissionsError } = ids.length
        ? await actor.supabase.from('access_permissions').select('module_name,action_name').in('id', ids)
        : { data: [], error: null }
      if (permissionsError) throw permissionsError
      if ((permissions ?? []).some((permission) => !actorPermissions.has(`${permission.module_name}:${permission.action_name}`))) {
        return NextResponse.json({ error: 'Não é possível convidar um usuário com privilégios superiores aos seus.' }, { status: 403 })
      }
    }

    const { data: existingMember, error: existingError } = await actor.supabase
      .from('team_members').select('id,user_id').ilike('email', email).maybeSingle()
    if (existingError) throw existingError
    if (existingMember?.user_id) return NextResponse.json({ error: 'Já existe um cadastro da equipe para este e-mail.' }, { status: 409 })

    let authUser: { id: string } | null = null
    let createdAuthUser = false
    let linkedExistingAuthUser = false
    for (let page = 1; !authUser; page += 1) {
      const { data, error } = await actor.supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) {
        console.error('Team account lookup failed:', error.message)
        throw new AdminApiError('Não foi possível verificar a conta de autenticação.', 503)
      }
      const found = data.users.find((user) => user.email?.trim().toLowerCase() === email)
      if (found) {
        authUser = { id: found.id }
        linkedExistingAuthUser = true
        break
      }
      if (data.users.length < 1000) break
    }

    if (!authUser) {
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
        return NextResponse.json({ error: 'Informe uma senha inicial de 8 a 128 caracteres para criar a conta.' }, { status: 400 })
      }
      // Keep the Auth insert minimal. Some projects have legacy auth.users triggers
      // that fail when optional user metadata is present; metadata is synced after
      // the team membership is safely persisted below.
      const { data, error } = await actor.supabase.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
      })
      if (error || !data.user) {
        const authCode = error?.code ?? ''
        console.error('Team account creation failed:', { code: authCode, message: error?.message ?? 'Creation returned no user' })
        if (authCode === 'email_exists' || authCode === 'user_already_exists') {
          return NextResponse.json({ error: 'Já existe uma conta de autenticação para este e-mail. Use a opção de vincular a conta existente.' }, { status: 409 })
        }
        if (authCode === 'weak_password' || authCode === 'password_too_short') {
          return NextResponse.json({ error: 'A senha inicial não atende à política de segurança do Supabase.' }, { status: 400 })
        }
        if (authCode === 'unexpected_failure' || error?.message?.toLowerCase().includes('database error')) {
          return NextResponse.json({ error: 'O Supabase recusou a criação da conta por uma falha interna. Verifique os gatilhos de criação de usuário antes de tentar novamente.' }, { status: 502 })
        }
        return NextResponse.json({ error: 'Não foi possível criar a conta de autenticação. Verifique se a chave administrativa do Supabase está configurada.' }, { status: 502 })
      }
      authUser = { id: data.user.id }
      createdAuthUser = true
    } else if (linkedExistingAuthUser) {
      const { error: authUpdateError } = await actor.supabase.auth.admin.updateUserById(authUser.id, {
        email_confirm: true,
        ...(typeof body.password === 'string' && body.password.length >= 8 && body.password.length <= 128
          ? { password: body.password }
          : {}),
      })
      if (authUpdateError) {
        console.error('Existing team account confirmation failed:', authUpdateError.message)
        return NextResponse.json({ error: 'A conta existe, mas não foi possível habilitar o login.' }, { status: 502 })
      }
    }

    const { data: existingAuthMemberships, error: authMembershipError } = await actor.supabase
      .from('team_members').select('id').eq('user_id', authUser.id).limit(1)
    if (authMembershipError) throw authMembershipError
    if (existingAuthMemberships?.length) {
      if (createdAuthUser) {
        const { error: cleanupError } = await actor.supabase.auth.admin.deleteUser(authUser.id)
        if (cleanupError) console.error('Orphaned team account cleanup failed:', cleanupError.message)
      }
      return NextResponse.json({ error: 'Esta conta já está vinculada a um membro da equipe.' }, { status: 409 })
    }

    const memberQuery = existingMember
      ? actor.supabase.from('team_members').update({
        user_id: authUser.id,
        full_name: fullName,
        email,
        role_name: role.name,
        status: 'Ativo',
        updated_at: new Date().toISOString(),
      }).eq('id', existingMember.id)
      : actor.supabase.from('team_members').insert({
        id: crypto.randomUUID(),
        user_id: authUser.id,
        full_name: fullName,
        email,
        role_name: role.name,
        status: 'Ativo',
        joined_on: new Date().toISOString().slice(0, 10),
      })
    let { data: member, error: memberError } = await memberQuery
      .select('id,user_id,full_name,email,job_title,department,joined_on,role_name,status,created_at,updated_at').single()
    if (memberError || !member) {
      console.error('Team account membership creation failed:', memberError?.message ?? 'Membership returned no row')
      if (createdAuthUser) {
        const { error: cleanupError } = await actor.supabase.auth.admin.deleteUser(authUser.id)
        if (cleanupError) console.error('Orphaned team account cleanup failed:', cleanupError.message)
      }
      return NextResponse.json({ error: 'A conta foi localizada/criada, mas o vínculo com a equipe não foi salvo. Verifique a lista antes de tentar novamente.' }, { status: 503 })
    }

    // Enforce the invariant at the API boundary even if an older nullable schema or trigger drops user_id.
    if (member.user_id !== authUser.id) {
      const { data: repairedMember, error: repairError } = await actor.supabase
        .from('team_members')
        .update({ user_id: authUser.id, updated_at: new Date().toISOString() })
        .eq('id', member.id)
        .select('id,user_id,full_name,email,job_title,department,joined_on,role_name,status,created_at,updated_at')
        .single()
      if (repairError || repairedMember?.user_id !== authUser.id) {
        console.error('Team account link invariant failed:', repairError?.message ?? 'user_id was not persisted')
        if (createdAuthUser) {
          const { error: cleanupError } = await actor.supabase.auth.admin.deleteUser(authUser.id)
          if (cleanupError) console.error('Orphaned team account cleanup failed:', cleanupError.message)
        }
        return NextResponse.json({ error: 'A conta de autenticação foi criada, mas o vínculo não pôde ser confirmado. Nenhum usuário foi salvo parcialmente.' }, { status: 503 })
      }
      member = repairedMember
    }

    if (createdAuthUser) {
      const { error: metadataError } = await actor.supabase.auth.admin.updateUserById(authUser.id, {
        user_metadata: { full_name: fullName },
      })
      if (metadataError) console.error('New team account metadata sync failed:', metadataError.message)
    }

    const { error: auditError } = await actor.supabase.from('admin_audit_events').insert({
      actor_id: actor.actorId,
      action_name: createdAuthUser ? 'team.created' : 'team.linked',
      entity_type: 'team_member',
      entity_id: member.id,
      new_data: { email: member.email, role_name: role.name, status: member.status },
      result: 'success',
    })
    if (auditError) console.error('Team account audit failed:', auditError.message)
    return NextResponse.json({
      member,
      warning: auditError ? 'Usuário associado, mas a auditoria não pôde ser salva.' : null,
      accountCreated: createdAuthUser,
    }, { status: 201 })
  } catch (error) {
    return fail(error)
  }
}
