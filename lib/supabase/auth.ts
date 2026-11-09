import { createClient } from '@/lib/supabase/client'

export async function signInWithPassword(email: string, password: string) {
  return createClient().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
}
