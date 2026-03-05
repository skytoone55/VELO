'use client'

import { useState, useCallback } from 'react'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, KeyRound, AlertCircle, CheckCircle, Info, MailIcon } from 'lucide-react'
import { getTenantConfig } from '@/lib/tenants'

export function Step1CodeEnemat() {
  const tenant = getTenantConfig()
  const { clientId, data, updateData, nextStep } = useFormulaireStore()
  const [code, setCode] = useState(data.codeEnemat || '')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [tentativesRestantes, setTentativesRestantes] = useState<number | null>(null)
  const [bloque, setBloque] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const handleResendCode = useCallback(async () => {
    if (!clientId || resending || resendCooldown > 0) return

    setResending(true)
    setResendSuccess(false)
    setLocalError(null)

    try {
      const response = await fetch('/api/formulaire/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })

      const result = await response.json()

      if (response.status === 429) {
        // Cooldown actif
        setResendCooldown(result.cooldown || 120)
        const timer = setInterval(() => {
          setResendCooldown(prev => {
            if (prev <= 1) { clearInterval(timer); return 0 }
            return prev - 1
          })
        }, 1000)
        setLocalError(result.error)
      } else if (result.success) {
        setResendSuccess(true)
        setBloque(false)
        setTentativesRestantes(null)
        // Cooldown de 120s après envoi réussi
        setResendCooldown(120)
        const timer = setInterval(() => {
          setResendCooldown(prev => {
            if (prev <= 1) { clearInterval(timer); return 0 }
            return prev - 1
          })
        }, 1000)
      } else {
        setLocalError(result.error || 'Erreur lors du renvoi')
      }
    } catch {
      setLocalError('Erreur réseau. Réessayez.')
    } finally {
      setResending(false)
    }
  }, [clientId, resending, resendCooldown])

  const handleValidate = async () => {
    if (!code.trim()) {
      setLocalError('Veuillez saisir votre code')
      return
    }

    if (!clientId) {
      setLocalError('Session invalide. Veuillez recharger la page.')
      return
    }

    setLoading(true)
    setLocalError(null)

    try {
      const response = await fetch('/api/formulaire/validate-enemat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, code: code.trim() }),
      })

      const result = await response.json()

      if (result.valid) {
        updateData({ codeEnemat: code, codeValide: true })
        setLoading(false)
        nextStep()
        return
      }

      // Code invalide ou bloqué
      if (result.blocked) {
        setBloque(true)
        setLocalError(result.message)
      } else {
        setTentativesRestantes(result.tentativesRestantes)
        setLocalError(result.message)
      }
      setLoading(false)
    } catch (err) {
      console.error('Erreur validation ENEMAT:', err)
      setLocalError('Une erreur est survenue. Réessayez.')
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <KeyRound className="w-8 h-8 text-foreground" />
        </div>
        <CardTitle>Code de validation</CardTitle>
        <CardDescription>
          Saisissez le code que vous avez reçu par email de {tenant.name}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Ce code vous a été envoyé par email depuis <span className="font-semibold">{tenant.email}</span> — vous disposez de 3 tentatives pour le valider.
          </AlertDescription>
        </Alert>

        {localError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{localError}</AlertDescription>
          </Alert>
        )}

        {data.codeValide && (
          <Alert className="bg-green-50 text-green-800 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>Code validé avec succès !</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="code">Code de validation</Label>
          <Input
            id="code"
            type="text"
            placeholder="Entrez votre code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={bloque || loading}
            className="text-center text-lg font-mono tracking-widest"
            maxLength={10}
          />
          {tentativesRestantes !== null && tentativesRestantes > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              {tentativesRestantes} tentative(s) restante(s)
            </p>
          )}
        </div>

        <Button
          className="w-full bg-green-600 hover:bg-green-700"
          onClick={handleValidate}
          disabled={loading || bloque || !code.trim()}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Vérification...
            </>
          ) : (
            'Valider le code'
          )}
        </Button>

        {resendSuccess && (
          <Alert className="bg-green-50 text-green-800 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              Un nouveau code a été envoyé à votre adresse email. Vérifiez aussi vos spams.
            </AlertDescription>
          </Alert>
        )}

        <div className="text-center space-y-2 pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            Code perdu ou email supprimé ?
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResendCode}
            disabled={resending || resendCooldown > 0}
          >
            {resending ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Envoi en cours...
              </>
            ) : resendCooldown > 0 ? (
              `Renvoyer le code (${resendCooldown}s)`
            ) : (
              <>
                <MailIcon className="mr-2 h-3 w-3" />
                Renvoyer mon code par email
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Besoin d'aide ?{' '}
            <a href={`tel:${tenant.phone}`} className="text-foreground font-medium hover:underline">
              {tenant.phoneFormatted}
            </a>
            {' '}ou{' '}
            <a href={`mailto:${tenant.email}`} className="text-foreground font-medium hover:underline">
              {tenant.email}
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
