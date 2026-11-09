import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

type Attachment = {
  id: string
  entity_type: string
  entity_id: string
  storage_path: string
  file_name: string
  mime_type: string
}

function isActive(status: string | null | undefined) {
  return ['active', 'ativo', 'enabled', 'habilitado'].includes(
    String(status ?? '').replace(/["']/g, '').trim().toLowerCase(),
  )
}

async function canReadAttachment(
  actor: Awaited<ReturnType<typeof requireWorkspacePermission>>,
  attachment: Attachment,
) {
  if (actor.roleName.trim().toLowerCase() === 'admin') return true

  const { data: projectId, error: taskError } = attachment.entity_type === 'task'
    ? await actor.supabase.from('project_tasks').select('project_id,responsible_id,participants,received_from_user_id').eq('id', attachment.entity_id).maybeSingle()
    : { data: null, error: null }
  if (taskError) throw new AdminApiError('Não foi possível verificar o acesso à tarefa.', 503)

  if (attachment.entity_type === 'project' || (attachment.entity_type === 'task' && projectId?.project_id)) {
    const projectEntityId = attachment.entity_type === 'project' ? attachment.entity_id : projectId?.project_id
    const { data: project, error: projectError } = await actor.supabase
      .from('projects')
      .select('id,created_by')
      .eq('id', projectEntityId)
      .maybeSingle()
    if (projectError) throw new AdminApiError('Não foi possível verificar o acesso ao projeto.', 503)
    if (!project) return false
    if (project.created_by === actor.actorId) return true

    const { data: membership, error: membershipError } = await actor.supabase
      .from('project_members')
      .select('is_active')
      .eq('project_id', project.id)
      .eq('user_id', actor.actorId)
      .maybeSingle()
    if (membershipError) throw new AdminApiError('Não foi possível verificar o compartilhamento do projeto.', 503)
    if (membership) return membership.is_active
    if (attachment.entity_type === 'project') return false
  } else if (attachment.entity_type !== 'task') {
    return false
  }

  const task = projectId
  if (!task) return false
  const { data: revokedMembership, error: revokedError } = task.project_id
    ? await actor.supabase
        .from('project_members')
        .select('id')
        .eq('project_id', task.project_id)
        .eq('user_id', actor.actorId)
        .eq('is_active', false)
        .maybeSingle()
    : { data: null, error: null }
  if (revokedError) throw new AdminApiError('Não foi possível verificar a revogação de acesso.', 503)
  if (revokedMembership) return false

  const participants = Array.isArray(task.participants) ? task.participants.map(String) : []
  return task.responsible_id === actor.actorId
    || task.responsible_id === actor.memberId
    || task.received_from_user_id === actor.actorId
    || participants.includes(actor.actorId)
}

export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    const actor = await requireWorkspacePermission('attachments', 'download')
    const { attachmentId } = await context.params
    const { data: attachment, error } = await actor.supabase
      .from('entity_attachments')
      .select('id,entity_type,entity_id,storage_path,file_name,mime_type')
      .eq('id', attachmentId)
      .maybeSingle()
    if (error) throw new AdminApiError('Não foi possível carregar os dados do anexo.', 503)
    if (!attachment || !await canReadAttachment(actor, attachment as Attachment)) {
      return NextResponse.json({ error: 'Anexo não encontrado ou acesso revogado.' }, { status: 404 })
    }

    const { data: file, error: downloadError } = await actor.supabase.storage
      .from('private-documents')
      .download(attachment.storage_path)
    if (downloadError || !file) throw new AdminApiError('Não foi possível baixar o arquivo.', 503)

    const fileName = String(attachment.file_name ?? 'arquivo').replace(/[\r\n"]/g, '_')
    const safeInlineType = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/i.test(attachment.mime_type)
    const forceDownload = new URL(request.url).searchParams.get('download') === '1'
    return new NextResponse(await file.arrayBuffer(), {
      headers: {
        'Content-Type': safeInlineType ? attachment.mime_type : 'application/octet-stream',
        'Content-Disposition': `${safeInlineType && !forceDownload ? 'inline' : 'attachment'}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Project attachment download failed:', error)
    return NextResponse.json({ error: 'Não foi possível baixar o anexo.' }, { status: 500 })
  }
}