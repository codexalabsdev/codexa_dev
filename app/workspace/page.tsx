import { AccessDenied } from '@/components/access-denied'
import { WorkspaceUnavailable } from '@/components/workspace-unavailable'
import { hasWorkspaceAccess } from '@/lib/workspace-access'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceAccessSnapshot } from '@/lib/supabase/workspace-auth'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  try {
    const access = await getWorkspaceAccessSnapshot()
    return hasWorkspaceAccess(access.permissions, 'dashboard') ? null : <AccessDenied />
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return null
    if (error instanceof AdminApiError && error.status === 403) return <AccessDenied />
    if (error instanceof AdminApiError && error.status === 503) return <WorkspaceUnavailable />
    throw error
  }
}
