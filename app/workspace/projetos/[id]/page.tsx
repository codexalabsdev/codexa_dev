import { AccessDenied } from '@/components/access-denied'
import { ProjectWorkspace } from '@/components/project-workspace'
import { hasWorkspaceAccess } from '@/lib/workspace-access'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceAccessSnapshot } from '@/lib/supabase/workspace-auth'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const access = await getWorkspaceAccessSnapshot()
    if (!hasWorkspaceAccess(access.permissions, 'projetos')) return <AccessDenied />
    return <ProjectWorkspace projectId={id} permissions={access.permissions} />
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return null
    if (error instanceof AdminApiError && error.status === 403) return <AccessDenied />
    throw error
  }
}
