import { redirect } from 'next/navigation'

// Self-registration disabled — only admins can create users
export default function RegisterPage() {
  redirect('/auth/login')
}
