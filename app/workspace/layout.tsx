import { AccessDenied } from '@/components/access-denied'
import { DashboardShell } from '@/components/dashboard-shell'
import { WorkspaceUnavailable } from '@/components/workspace-unavailable'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceAccessSnapshot } from '@/lib/supabase/workspace-auth'

export const dynamic = 'force-dynamic'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  try {
    const access = await getWorkspaceAccessSnapshot()
    return <DashboardShell permissions={access.permissions} profileName={access.fullName}>{children}</DashboardShell>
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return <DashboardShell>{children}</DashboardShell>
    if (error instanceof AdminApiError && error.status === 403) return <DashboardShell page={<AccessDenied />} />
    if (error instanceof AdminApiError && error.status === 503) return <WorkspaceUnavailable />
    throw error
  }
}
