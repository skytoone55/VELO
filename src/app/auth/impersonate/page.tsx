'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ImpersonateContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState('Connexion en cours...')

  useEffect(() => {
    const token = searchParams.get('token')
    const email = searchParams.get('email')

    if (!token || !email) {
      setStatus('Lien invalide')
      return
    }

    const impersonate = async () => {
      const supabase = createClient()

      // Sign out current session first
      await supabase.auth.signOut()

      // Sign in as target user with OTP token
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'magiclink',
      })

      if (error) {
        console.error('Impersonate error:', error)
        setStatus(`Erreur : ${error.message}`)
        return
      }

      // Redirect to admin dashboard
      router.push('/admin/dashboard')
      router.refresh()
    }

    impersonate()
  }, [searchParams, router])

  return (
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
      <p className="text-muted-foreground">{status}</p>
    </div>
  )
}

export default function ImpersonatePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Suspense fallback={
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      }>
        <ImpersonateContent />
      </Suspense>
    </div>
  )
}
