import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceAccessSnapshot } from '@/lib/supabase/workspace-auth'

export async function GET() {
  try {
    const access = await getWorkspaceAccessSnapshot()
    return NextResponse.json(access, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Workspace access snapshot failed:', error)
    return NextResponse.json({ error: 'Não foi possível carregar o acesso do usuário.' }, { status: 500 })
  }
}
