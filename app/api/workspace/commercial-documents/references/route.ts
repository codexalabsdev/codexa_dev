import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor, getWorkspacePermissions } from '@/lib/supabase/workspace-auth'

export async function GET() {
  try {
    const actor = await getWorkspaceActor()
    const permissions = await getWorkspacePermissions(actor)
    const [clients, projects] = await Promise.all([
      permissions.has('*') || permissions.has('clients:view')
        ? actor.sessionSupabase.from('clients').select('id,legal_name,trade_name').order('legal_name').limit(300)
        : Promise.resolve({ data: [], error: null }),
      permissions.has('*') || permissions.has('projects:view')
        ? actor.sessionSupabase.from('projects').select('id,name,client_id').order('created_at', { ascending: false }).limit(300)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (clients.error || projects.error) throw new AdminApiError('Não foi possível carregar os registros disponíveis para vínculo.', 503)
    return NextResponse.json({ clients: clients.data ?? [], projects: projects.data ?? [] })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Commercial document references failed:', error)
    return NextResponse.json({ error: 'Não foi possível carregar as referências.' }, { status: 500 })
  }
}
