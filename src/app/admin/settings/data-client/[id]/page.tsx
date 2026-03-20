'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Loader2,
  ArrowLeft,
  Building2,
  CheckCircle,
  AlertCircle,
  Mail,
  Phone,
  User,
  MapPin,
  Bike,
  Shield,
  Pencil,
  Check,
  X,
  Upload,
  Ban,
} from 'lucide-react'
import dynamic from 'next/dynamic'

const MiniMap = dynamic(() => import('@/components/ui/mini-map').then(m => ({ default: m.MiniMap })), {
  ssr: false,
  loading: () => <div className="h-[200px] w-full bg-muted/30 rounded animate-pulse" />,
})

// Statuts data_client
const DATA_STATUTS: Record<string, string> = {
  'CONTROL VALIDE': 'Control validé',
  'CONTROLE VALIDE': 'Contrôle validé',
  'DEVIS SIGNE': 'Devis signé',
  'ATTENTE DOCUMENT': 'Attente document',
  'CONTROLE A REGULARISER': 'Contrôle à régulariser',
  'DOSSIER COMPLET': 'Dossier complet',
  'CONTROLE A JOUR': 'Contrôle à jour',
  'CLIENT INJOIGNABLE': 'Client injoignable',
  'CLIENT HS': 'Client HS',
  'LIVRE': 'Livré',
  'FORMULAIRE ENVOYE': 'Formulaire envoyé',
  'HS': 'HS',
  'retour_client': 'Retour client',
  'en_attente': 'En attente',
}

const DATA_STATUT_COLORS: Record<string, string> = {
  'CONTROL VALIDE': 'bg-green-100 text-green-800',
  'CONTROLE VALIDE': 'bg-green-100 text-green-800',
  'DEVIS SIGNE': 'bg-blue-100 text-blue-800',
  'ATTENTE DOCUMENT': 'bg-yellow-100 text-yellow-800',
  'CONTROLE A REGULARISER': 'bg-orange-100 text-orange-800',
  'DOSSIER COMPLET': 'bg-emerald-100 text-emerald-800',
  'CONTROLE A JOUR': 'bg-emerald-100 text-emerald-800',
  'CLIENT INJOIGNABLE': 'bg-red-100 text-red-800',
  'CLIENT HS': 'bg-red-100 text-red-800',
  'LIVRE': 'bg-purple-100 text-purple-800',
  'FORMULAIRE ENVOYE': 'bg-cyan-100 text-cyan-800',
  'HS': 'bg-red-100 text-red-800',
  'retour_client': 'bg-blue-100 text-blue-800',
  'en_attente': 'bg-gray-100 text-gray-800',
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={`font-medium text-foreground text-sm ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

const getDepartementLabel = (dept: string) => {
  const labels: Record<string, string> = { '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'La Réunion' }
  return labels[dept] || dept
}

export default function DataClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const user = useAdminUser()
  const [dc, setDc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // HS dialog
  const [hsDialogOpen, setHsDialogOpen] = useState(false)
  const [hsConfirmOpen, setHsConfirmOpen] = useState(false)
  const [hsComment, setHsComment] = useState('')
  const [hsLoading, setHsLoading] = useState(false)

  // Import confirm
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)

  // Edition velo_valide
  const [editingVelos, setEditingVelos] = useState(false)
  const [editVelosValue, setEditVelosValue] = useState(0)
  const [velosConfirmOpen, setVelosConfirmOpen] = useState(false)
  const [savingVelos, setSavingVelos] = useState(false)

  // Notes internes
  const [editingNotes, setEditingNotes] = useState(false)
  const [editNotesValue, setEditNotesValue] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Accès
  if (user && user.role !== 'super_admin' && user.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
        <h2 className="text-xl font-bold">Accès refusé</h2>
      </div>
    )
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/admin/data-clients/${resolvedParams.id}`)
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || 'Client introuvable')
          setLoading(false)
          return
        }
        const data = await res.json()
        setDc(data)
      } catch {
        setError('Erreur lors du chargement')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [resolvedParams.id])

  // --- Handlers ---

  const handleImport = async () => {
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/data-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [resolvedParams.id] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur import')
      setSuccess('Client importé avec succès')
      setImportConfirmOpen(false)
      setTimeout(() => router.push('/admin/clients'), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleHS = async () => {
    if (!hsComment.trim()) return
    setHsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/data-clients/${resolvedParams.id}/hs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: hsComment.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setSuccess(data.message || 'Client passé en HS')
      setHsDialogOpen(false)
      setHsConfirmOpen(false)
      setHsComment('')
      setTimeout(() => router.push('/admin/settings/data-client'), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setHsLoading(false)
    }
  }

  const handleSaveVelos = async () => {
    setSavingVelos(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/data-clients/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ velo_valide: editVelosValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setDc({ ...dc, velo_valide: editVelosValue })
      setEditingVelos(false)
      setVelosConfirmOpen(false)
      setSuccess('Nombre de vélos mis à jour')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingVelos(false)
    }
  }

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/data-clients/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes_internes: editNotesValue || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      setDc({ ...dc, notes_internes: editNotesValue || null })
      setEditingNotes(false)
      setSuccess('Notes mises à jour')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingNotes(false)
    }
  }

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!dc) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
        <h2 className="text-xl font-bold mb-2">Client introuvable</h2>
        <Button onClick={() => router.push('/admin/settings/data-client')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour à la liste
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-8">
      {/* Header avec gradient */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          {/* Gauche */}
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/admin/settings/data-client')}
              className="text-white hover:bg-white/20 shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{dc.raison_sociale}</h1>
              <p className="text-slate-300 mt-1">{getDepartementLabel(dc.departement || '')}</p>
            </div>
          </div>

          {/* Droite — actions + badge */}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {/* Importer vers Client */}
            <AlertDialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                onClick={() => setImportConfirmOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Importer vers Client
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Importer ce data_client ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {dc.raison_sociale} sera transféré dans l&apos;espace Clients actifs avec le statut &quot;contrôle validé&quot;.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleImport} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
                    {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmer l&apos;import
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Passer en HS */}
            <Dialog open={hsDialogOpen} onOpenChange={setHsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="destructive" className="bg-red-600 hover:bg-red-700">
                  <Ban className="mr-2 h-4 w-4" />
                  Passer en HS
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Passer en HS</DialogTitle>
                  <DialogDescription>
                    Ce data_client sera transféré vers Clients avec le statut HS. Indiquez la raison.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-3">
                  <label className="text-sm font-medium mb-2 block">Raison *</label>
                  <textarea
                    className="w-full border rounded-md p-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="Ex: Entreprise fermée, SIRET invalide, doublon..."
                    value={hsComment}
                    onChange={(e) => setHsComment(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setHsDialogOpen(false); setHsComment('') }}>Annuler</Button>
                  <Button
                    variant="destructive"
                    disabled={!hsComment.trim()}
                    onClick={() => { setHsDialogOpen(false); setHsConfirmOpen(true) }}
                  >
                    Confirmer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* AlertDialog double confirm HS */}
            <AlertDialog open={hsConfirmOpen} onOpenChange={setHsConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmation HS</AlertDialogTitle>
                  <AlertDialogDescription>
                    Êtes-vous sûr de passer {dc.raison_sociale} en HS ? Cette action est définitive.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setHsConfirmOpen(false)}>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleHS} disabled={hsLoading} className="bg-red-600 hover:bg-red-700">
                    {hsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Oui, passer en HS
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="h-6 w-px bg-white/20 mx-1" />

            {/* Badge statut */}
            <Badge className={`${DATA_STATUT_COLORS[dc.statut_data || 'en_attente']} text-sm px-3 py-1`}>
              {DATA_STATUTS[dc.statut_data || 'en_attente'] || dc.statut_data || 'En attente'}
            </Badge>
          </div>
        </div>

        {/* Métriques rapides */}
        <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-white/20">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Bike className="h-3.5 w-3.5" />
              Vélos
              {!editingVelos && (
                <button
                  onClick={() => { setEditVelosValue(dc.velo_valide || 0); setEditingVelos(true) }}
                  className="ml-1 text-slate-400 hover:text-white transition-colors"
                  title="Modifier"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
            {editingVelos ? (
              <div className="flex items-center justify-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={dc.velo_devis || 99}
                  value={editVelosValue}
                  onChange={(e) => setEditVelosValue(Math.min(parseInt(e.target.value) || 0, dc.velo_devis || 99))}
                  className="w-12 text-center text-lg font-bold bg-white/10 border border-white/30 rounded px-1 py-0 text-white"
                />
                <span className="text-slate-400">/{dc.velo_devis}</span>
                <button onClick={() => { if (editVelosValue > (dc.velo_devis || 99)) { return } setVelosConfirmOpen(true) }} className="text-green-400 hover:text-green-300 ml-1"><Check className="h-4 w-4" /></button>
                <button onClick={() => setEditingVelos(false)} className="text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="text-xl font-bold">{dc.velo_valide || 0}<span className="text-slate-400">/{dc.velo_devis}</span></div>
            )}
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Shield className="h-3.5 w-3.5" />
              NAF
            </div>
            <div className="text-sm font-semibold">
              {['OUI', 'ok', 'oui'].includes(dc.validation_naf || '') ? (
                <span className="text-emerald-400 flex items-center justify-center gap-1">
                  <CheckCircle className="h-4 w-4" /> Éligible
                </span>
              ) : dc.validation_naf === 'NON' ? (
                <span className="text-red-400 flex items-center justify-center gap-1">
                  <AlertCircle className="h-4 w-4" /> Non éligible
                </span>
              ) : (
                <span className="text-slate-400">À vérifier</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-slate-300 text-xs uppercase tracking-wide mb-1">Ref. ENEMAT</div>
            <div className="text-sm font-mono font-bold">{dc.reference_retina || '—'}</div>
          </div>
        </div>
      </div>

      {/* AlertDialog vélos */}
      <AlertDialog open={velosConfirmOpen} onOpenChange={setVelosConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier le nombre de vélos</AlertDialogTitle>
            <AlertDialogDescription>
              Passer velo_valide de {dc.velo_valide || 0} à {editVelosValue} ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveVelos} disabled={savingVelos}>
              {savingVelos && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alertes */}
      {error && (
        <Alert variant="destructive" className="shadow-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-emerald-50 border-emerald-200 shadow-sm">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Contenu — 2 colonnes */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Société */}
        <Card className="shadow-sm">
          <CardContent className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Société</h3>
            </div>
            <div className="space-y-0">
              <InfoRow label="Raison sociale" value={dc.raison_sociale} />
              <InfoRow label="SIRET" value={dc.siret} mono />
              <InfoRow label="Code NAF" value={dc.code_ape} mono />
              <InfoRow label="Validation NAF" value={dc.validation_naf} />
            </div>
            <Separator className="my-1.5" />
            <div className="text-sm">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Adresse
              </p>
              <p className="font-medium text-sm">{dc.adresse_societe_ligne1}</p>
              {dc.adresse_societe_ligne2 && <p className="text-muted-foreground text-sm">{dc.adresse_societe_ligne2}</p>}
              <p className="font-semibold text-sm">{dc.adresse_societe_cp} {dc.adresse_societe_ville}</p>
              {dc.departement && <p className="text-xs text-muted-foreground mt-1">Dépt. {getDepartementLabel(dc.departement)}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card className="shadow-sm">
          <CardContent className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <User className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Contact</h3>
            </div>
            <div className="space-y-0">
              <InfoRow
                label="Nom"
                value={
                  (dc.contact_prenom || dc.contact_nom)
                    ? `${dc.contact_prenom || ''} ${dc.contact_nom || ''}`.trim()
                    : null
                }
              />
              <InfoRow
                label="Email"
                value={dc.email_beneficiaire ? (
                  <a href={`mailto:${dc.email_beneficiaire}`} className="hover:underline text-sm">
                    {dc.email_beneficiaire}
                  </a>
                ) : null}
              />
              <InfoRow
                label="Téléphone"
                value={dc.telephone ? (
                  <a href={`tel:${dc.telephone}`} className="hover:underline">
                    {dc.telephone}
                  </a>
                ) : null}
              />
              <InfoRow label="Commercial" value={dc.commercial_assigne} />
            </div>
          </CardContent>
        </Card>

        {/* Notes internes */}
        <Card className="shadow-sm lg:col-span-2">
          <CardContent className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="font-semibold text-sm">Notes internes</h3>
              {!editingNotes && (
                <button
                  onClick={() => { setEditNotesValue(dc.notes_internes || ''); setEditingNotes(true) }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Modifier"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  className="w-full border rounded-md p-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary"
                  value={editNotesValue}
                  onChange={(e) => setEditNotesValue(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)}>
                    <X className="mr-1 h-3.5 w-3.5" /> Annuler
                  </Button>
                  <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                    Enregistrer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {dc.notes_internes ? (
                  dc.notes_internes.split('\n').filter(Boolean).map((line: string, i: number) => {
                    // Parser les logs structurés : [TYPE DATE par USER] commentaire
                    const match = line.match(/^\[(\w+(?:\s\w+)?)\s+(\d{2}\/\d{2}\/\d{4})\s+par\s+(.+?)\]\s*(.*)$/)
                    if (match) {
                      const [, type, date, user, comment] = match
                      const isHS = type.includes('HS')
                      const isRetour = type.includes('Retour')
                      return (
                        <div key={i} className={`flex items-start gap-3 p-2 rounded-md text-sm ${isHS ? 'bg-red-50 border border-red-200' : isRetour ? 'bg-orange-50 border border-orange-200' : 'bg-muted/50'}`}>
                          <div className="shrink-0">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${isHS ? 'bg-red-100 text-red-700' : isRetour ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                              {type}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground">{comment}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Par <span className="font-medium">{user}</span> le {date}
                            </p>
                          </div>
                        </div>
                      )
                    }
                    return <p key={i} className="text-sm text-muted-foreground">{line}</p>
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune note</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
