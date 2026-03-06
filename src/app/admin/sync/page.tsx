'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'

export default function SyncPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Synchronisation Monday</h1>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Le sync automatique Monday → Supabase a été désactivé.
          Supabase est maintenant la source de vérité.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Architecture actuelle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p><strong>Supabase → Monday</strong> : automatique aux étapes clés (envoi formulaire, changement statut)</p>
          <p><strong>Monday → Supabase</strong> : désactivé. Les mises à jour manuelles passent par JARVIS.</p>
          <p>Pour configurer les mappings Supabase → Monday, allez dans <a href="/admin/settings/monday" className="text-primary underline">Paramètres Monday</a>.</p>
        </CardContent>
      </Card>
    </div>
  )
}
