'use client'

import { AuthScreen } from '@/components/auth-screen'

export default function AdminLoginPage() {
  return <AuthScreen onAuthenticated={() => { window.location.href = '/workspace' }} />
}
