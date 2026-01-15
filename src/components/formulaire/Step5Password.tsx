'use client'

import { useState } from 'react'
import { useFormulaireStore } from '@/lib/formulaire/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  Check,
  X,
} from 'lucide-react'

interface PasswordRequirement {
  label: string
  test: (password: string) => boolean
}

const passwordRequirements: PasswordRequirement[] = [
  { label: 'Au moins 8 caractères', test: (p) => p.length >= 8 },
  { label: 'Au moins une majuscule', test: (p) => /[A-Z]/.test(p) },
  { label: 'Au moins une minuscule', test: (p) => /[a-z]/.test(p) },
  { label: 'Au moins un chiffre', test: (p) => /[0-9]/.test(p) },
]

export function Step5Password() {
  const { data, updateData, nextStep, prevStep } = useFormulaireStore()

  const [password, setPassword] = useState(data.password || '')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allRequirementsMet = passwordRequirements.every((req) => req.test(password))
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  const handleSubmit = () => {
    setError(null)

    if (!allRequirementsMet) {
      setError('Le mot de passe ne respecte pas tous les critères')
      return
    }

    if (!passwordsMatch) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    // Sauvegarder le mot de passe
    updateData({ password })
    nextStep()
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <CardTitle>Créez votre compte client</CardTitle>
        <CardDescription>
          Choisissez un mot de passe sécurisé pour accéder à votre espace client
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Votre identifiant de connexion sera : <strong>{data.email}</strong>
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Entrez votre mot de passe"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre mot de passe"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Password requirements */}
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium mb-3">Critères du mot de passe :</p>
            {passwordRequirements.map((req, index) => {
              const isMet = req.test(password)
              return (
                <div key={index} className="flex items-center gap-2 text-sm">
                  {isMet ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={isMet ? 'text-green-600' : 'text-muted-foreground'}>
                    {req.label}
                  </span>
                </div>
              )
            })}
            <div className="flex items-center gap-2 text-sm pt-2 border-t mt-2">
              {passwordsMatch ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <X className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={passwordsMatch ? 'text-green-600' : 'text-muted-foreground'}>
                Les mots de passe correspondent
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Button variant="outline" onClick={prevStep} className="flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1"
            disabled={!allRequirementsMet || !passwordsMatch}
          >
            Continuer
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
