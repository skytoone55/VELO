'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, Upload, FileText, Loader2, AlertCircle } from 'lucide-react'

const DOC_LABELS: Record<string, string> = {
  urssaf: 'Attestation URSSAF à jour de moins de 3 mois',
  dsn: 'Attestation DSN au format EDI',
  benevoles: 'Attestation de déclaration de Bénévoles',
}

export default function DocumentsUploadPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [requiredDocs, setRequiredDocs] = useState<string[]>([])
  const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<string | null>(null)
  const [allDone, setAllDone] = useState(false)

  const validateToken = useCallback(async () => {
    if (!token) {
      setError('Lien invalide — aucun token fourni.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/documents/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Token invalide')
        setLoading(false)
        return
      }

      setClientName(data.raisonSociale)
      setRequiredDocs(data.documentsRequis)
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    validateToken()
  }, [validateToken])

  const handleUpload = async (docType: string, file: File) => {
    setUploading(docType)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('token', token!)
      formData.append('docType', docType)
      formData.append('file', file)

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Erreur upload')

      const newUploaded = new Set(uploadedDocs)
      newUploaded.add(docType)
      setUploadedDocs(newUploaded)

      // Vérifier si tout est uploadé
      if (newUploaded.size === requiredDocs.length) {
        setAllDone(true)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur upload'
      setError(message)
    } finally {
      setUploading(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error && !requiredDocs.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (allDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Documents envoyés !</h2>
            <p className="text-muted-foreground">
              Merci, tous vos documents ont bien été reçus. Vous pouvez fermer cette page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle>Envoi de documents</CardTitle>
            <CardDescription>
              {clientName && <span className="font-medium">{clientName}</span>}
              {clientName && <br />}
              Veuillez téléverser les documents demandés ci-dessous.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {requiredDocs.map((docType) => {
              const isUploaded = uploadedDocs.has(docType)
              const isUploading = uploading === docType

              return (
                <div
                  key={docType}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    isUploaded
                      ? 'bg-green-50 border-green-200'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      {isUploaded ? (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{DOC_LABELS[docType] || docType}</p>
                        {isUploaded && (
                          <p className="text-xs text-green-600 mt-0.5">Document reçu</p>
                        )}
                      </div>
                    </div>

                    {!isUploaded && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleUpload(docType, file)
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isUploading}
                          asChild
                        >
                          <span>
                            {isUploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-1" />
                                Envoyer
                              </>
                            )}
                          </span>
                        </Button>
                      </label>
                    )}
                  </div>
                </div>
              )
            })}

            <p className="text-xs text-muted-foreground text-center mt-4">
              Formats acceptés : PDF, JPG, PNG, DOC. Taille max : 10 Mo.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
