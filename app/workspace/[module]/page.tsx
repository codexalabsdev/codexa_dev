import { notFound } from 'next/navigation'
import { AccessDenied } from '@/components/access-denied'
import { WorkspaceUnavailable } from '@/components/workspace-unavailable'
import { WorkspacePageRouter } from '@/components/workspace-page-router'
import { hasWorkspaceAccess } from '@/lib/workspace-access'
import { isWorkspaceModule } from '@/lib/workspace-modules'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceAccessSnapshot } from '@/lib/supabase/workspace-auth'

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params
  if (!isWorkspaceModule(module) || module === 'dashboard') notFound()
  try {
    const access = await getWorkspaceAccessSnapshot()
    if (!hasWorkspaceAccess(access.permissions, module)) return <AccessDenied />
    return <WorkspacePageRouter module={module} permissions={access.permissions} profileName={access.fullName} />
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return null
    if (error instanceof AdminApiError && error.status === 403) return <AccessDenied />
    if (error instanceof AdminApiError && error.status === 503) return <WorkspaceUnavailable />
    throw error
  }
}
