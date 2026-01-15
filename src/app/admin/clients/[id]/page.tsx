'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  ArrowLeft,
  Building2,
  Truck,
  FileText,
  CheckCircle,
  AlertCircle,
  Mail,
  Phone,
  User,
  Send,
  Eye,
  Download,
  KeyRound,
  MapPin,
  Warehouse,
  RotateCcw,
  Copy,
  RefreshCw,
  Calendar,
  Bike,
  Shield,
  Clock,
} from 'lucide-react'
import { Client, Livraison, Depot } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'
import { MiniMap } from '@/components/ui/mini-map'

// Composant pour les titres de section - design épuré
function SectionTitle({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ElementType
  title: string
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 text-primary" />
        <h3 className="font-semibold text-xl text-foreground">{title}</h3>
      </div>
      {badge}
    </div>
  )
}

// Composant pour afficher une ligne d'information
function InfoRow({
  label,
  value,
  mono = false,
  large = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  large?: boolean
}) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-foreground ${mono ? 'font-mono' : ''} ${large ? 'text-lg' : ''}`}>{value}</span>
    </div>
  )
}

const statutColors: Record<string, string> = {
  en_attente: 'bg-slate-100 text-slate-700',
  formulaire_envoye: 'bg-amber-100 text-amber-800',
  formulaire_complete: 'bg-blue-100 text-blue-800',
  formulaire_bloque: 'bg-red-100 text-red-800',
  valide: 'bg-emerald-100 text-emerald-800',
}

const statutLabels: Record<string, string> = {
  en_attente: 'En attente',
  formulaire_envoye: 'Formulaire envoyé',
  formulaire_complete: 'Formulaire complété',
  formulaire_bloque: 'Bloqué',
  valide: 'Validé',
}

const getDepartementLabel = (dept: string) => {
  const labels: Record<string, string> = {
    '971': 'Guadeloupe',
    '972': 'Martinique',
    '973': 'Guyane',
    '974': 'La Réunion',
  }
  return labels[dept] || dept
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const user = useAdminUser()
  const [client, setClient] = useState<Client | null>(null)
  const [livraisons, setLivraisons] = useState<Livraison[]>([])
  const [depotRetrait, setDepotRetrait] = useState<Depot | null>(null)
  const [depotLogistique, setDepotLogistique] = useState<Depot | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Dialogs
  const [sendEmailOpen, setSendEmailOpen] = useState(false)
  const [changeStatutOpen, setChangeStatutOpen] = useState(false)
  const [resetFormOpen, setResetFormOpen] = useState(false)
  const [resendCodeOpen, setResendCodeOpen] = useState(false)
  const [newStatut, setNewStatut] = useState('')
  const [commentaire, setCommentaire] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/admin/clients/${resolvedParams.id}`)
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Client introuvable')
          setLoading(false)
          return
        }

        setClient(data.client)
        setLivraisons(data.livraisons || [])

        // Récupérer les dépôts associés
        const supabase = createClient()
        if (data.client.depot_retrait_id) {
          const { data: depot } = await supabase
            .from('depots')
            .select('*')
            .eq('id', data.client.depot_retrait_id)
            .single()
          setDepotRetrait(depot)
        }
        if (data.client.depot_logistique_id) {
          const { data: depot } = await supabase
            .from('depots')
            .select('*')
            .eq('id', data.client.depot_logistique_id)
            .single()
          setDepotLogistique(depot)
        }

        // Récupérer la distance depuis le cache
        const depotId = data.client.depot_retrait_id || data.client.depot_logistique_id
        if (depotId) {
          const { data: distanceData } = await supabase
            .from('distances_cache')
            .select('distance_km')
            .eq('client_id', data.client.id)
            .eq('depot_id', depotId)
            .single()
          if (distanceData) {
            setDistanceKm(distanceData.distance_km)
          }
        }
      } catch (err) {
        setError('Erreur lors du chargement')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [resolvedParams.id])

  const handleSendFormulaire = async () => {
    if (!client) return
    setActionLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const token = crypto.randomUUID()

      const { error: updateError } = await supabase
        .from('clients')
        .update({
          token_formulaire: token,
          statut_formulaire: 'formulaire_envoye',
          date_envoi_formulaire: new Date().toISOString(),
        })
        .eq('id', client.id)

      if (updateError) throw updateError

      await supabase.from('workflow_transitions').insert({
        entity_type: 'client',
        entity_id: client.id,
        statut_avant: client.statut_formulaire,
        statut_apres: 'formulaire_envoye',
        effectue_par: user?.id,
        raison: 'Envoi du formulaire par admin',
      })

      setSuccess(`Formulaire envoyé ! Lien: /formulaire?token=${token}`)
      setClient({ ...client, statut_formulaire: 'formulaire_envoye', token_formulaire: token })
      setSendEmailOpen(false)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi')
    } finally {
      setActionLoading(false)
    }
  }

  const handleChangeStatut = async () => {
    if (!client || !newStatut) return
    setActionLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { error: updateError } = await supabase
        .from('clients')
        .update({
          statut_formulaire: newStatut,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id)

      if (updateError) throw updateError

      await supabase.from('workflow_transitions').insert({
        entity_type: 'client',
        entity_id: client.id,
        statut_avant: client.statut_formulaire,
        statut_apres: newStatut,
        effectue_par: user?.id,
        raison: commentaire || 'Changement manuel de statut',
      })

      setSuccess('Statut mis à jour')
      setClient({ ...client, statut_formulaire: newStatut })
      setChangeStatutOpen(false)
      setCommentaire('')
    } catch (err: any) {
      setError(err.message || 'Erreur')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnblockCode = async () => {
    if (!client) return
    setActionLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { error: updateError } = await supabase
        .from('clients')
        .update({
          code_enemat_bloque: false,
          code_enemat_tentatives: 0,
          statut_formulaire: 'formulaire_envoye',
        })
        .eq('id', client.id)

      if (updateError) throw updateError

      setSuccess('Code débloqué')
      setClient({
        ...client,
        code_enemat_bloque: false,
        code_enemat_tentatives: 0,
        statut_formulaire: 'formulaire_envoye',
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetForm = async () => {
    if (!client) return
    setActionLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Générer un nouveau token
      const token = crypto.randomUUID()

      const { error: updateError } = await supabase
        .from('clients')
        .update({
          statut_formulaire: 'formulaire_envoye',
          token_formulaire: token,
          code_enemat_valide: false,
          code_enemat_tentatives: 0,
          code_enemat_bloque: false,
          code_enemat_saisi: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id)

      if (updateError) throw updateError

      await supabase.from('workflow_transitions').insert({
        entity_type: 'client',
        entity_id: client.id,
        statut_avant: client.statut_formulaire,
        statut_apres: 'formulaire_envoye',
        effectue_par: user?.id,
        raison: 'Réinitialisation du formulaire par admin',
      })

      setSuccess('Formulaire réinitialisé. Le client peut recommencer.')
      setClient({
        ...client,
        statut_formulaire: 'formulaire_envoye',
        token_formulaire: token,
        code_enemat_valide: false,
        code_enemat_tentatives: 0,
        code_enemat_bloque: false,
        code_enemat_saisi: null,
      })
      setResetFormOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (!client) return
    setActionLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/clients/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setSuccess('Code de validation renvoyé par email')
      setResendCodeOpen(false)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
        <h2 className="text-xl font-bold mb-2">Client introuvable</h2>
        <Button onClick={() => router.push('/admin/clients')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour à la liste
        </Button>
      </div>
    )
  }

  // Récupérer infos de livraison
  const livraison = livraisons[0]
  const modeLivraison = livraison?.mode_livraison || (client.depot_retrait_id ? 'retrait' : 'domicile')
  const codeEnematSaisi = client.code_enemat_saisi || livraison?.code_enemat_saisi
  const formulaireComplete = client.statut_formulaire === 'formulaire_complete' || client.statut_formulaire === 'valide'

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-8">
      {/* Header amélioré avec gradient */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/admin/clients')}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{client.raison_sociale}</h1>
              <p className="text-slate-300 mt-1">{getDepartementLabel(client.departement)}</p>
            </div>
          </div>

          {/* Actions rapides dans le header */}
          <div className="flex flex-wrap items-center gap-2">
            {client.statut_formulaire === 'en_attente' && (
              <Dialog open={sendEmailOpen} onOpenChange={setSendEmailOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0">
                    <Send className="mr-2 h-4 w-4" />
                    Envoyer formulaire
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Envoyer le formulaire</DialogTitle>
                    <DialogDescription>Email: {client.email}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSendEmailOpen(false)}>Annuler</Button>
                    <Button onClick={handleSendFormulaire} disabled={actionLoading}>
                      {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Envoyer
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {client.token_formulaire && !formulaireComplete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/formulaire?token=${client.token_formulaire}`)
                  setSuccess('Lien copié')
                }}
                className="text-white hover:bg-white/20"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copier lien
              </Button>
            )}

            <Dialog open={resendCodeOpen} onOpenChange={setResendCodeOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Renvoyer code
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Renvoyer le code de validation</DialogTitle>
                  <DialogDescription>
                    Un nouveau code sera généré et envoyé à {client.email}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setResendCodeOpen(false)}>Annuler</Button>
                  <Button onClick={handleResendCode} disabled={actionLoading}>
                    {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Envoyer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {formulaireComplete && (
              <Dialog open={resetFormOpen} onOpenChange={setResetFormOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-orange-300 hover:bg-orange-500/20">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Réinitialiser
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Réinitialiser le formulaire</DialogTitle>
                    <DialogDescription>
                      Le client pourra recommencer le formulaire depuis le début. L'ancien code sera invalidé.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setResetFormOpen(false)}>Annuler</Button>
                    <Button variant="destructive" onClick={handleResetForm} disabled={actionLoading}>
                      {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Réinitialiser
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {client.code_enemat_bloque && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUnblockCode}
                disabled={actionLoading}
                className="text-red-300 hover:bg-red-500/20"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Débloquer
              </Button>
            )}

            <Dialog open={changeStatutOpen} onOpenChange={setChangeStatutOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                  Changer statut
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Changer le statut</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <Select value={newStatut} onValueChange={setNewStatut}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en_attente">En attente</SelectItem>
                      <SelectItem value="formulaire_envoye">Formulaire envoyé</SelectItem>
                      <SelectItem value="formulaire_complete">Formulaire complété</SelectItem>
                      <SelectItem value="valide">Validé</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    placeholder="Raison (optionnel)..."
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setChangeStatutOpen(false)}>Annuler</Button>
                  <Button onClick={handleChangeStatut} disabled={actionLoading || !newStatut}>
                    {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Badge className={`${statutColors[client.statut_formulaire || 'en_attente']} text-sm px-3 py-1 ml-2`}>
              {statutLabels[client.statut_formulaire || 'en_attente']}
            </Badge>
          </div>
        </div>

        {/* Métriques rapides */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-white/20">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Bike className="h-4 w-4" />
              Vélos
            </div>
            <div className="text-2xl font-bold">{client.velo_valide || 0}<span className="text-slate-400">/{client.velo_devis}</span></div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Truck className="h-4 w-4" />
              Livraison
            </div>
            <div className="text-lg font-semibold">
              {modeLivraison === 'retrait' ? 'Point relais' : 'Domicile'}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <KeyRound className="h-4 w-4" />
              Code ENEMAT
            </div>
            <div className="text-lg font-mono font-bold">
              {codeEnematSaisi || '------'}
              {client.code_enemat_valide && <CheckCircle className="inline ml-2 h-4 w-4 text-emerald-400" />}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Calendar className="h-4 w-4" />
              Créé le
            </div>
            <div className="text-lg font-semibold">
              {new Date(client.created_at).toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>
      </div>

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

      {/* Contenu principal - 3 colonnes */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Colonne 1 - Société */}
        <Card className="shadow-sm border-2">
          <CardContent className="px-5 py-3.5">
            <SectionTitle icon={Building2} title="Société" />
            <div className="space-y-1">
              <InfoRow label="Raison sociale" value={client.raison_sociale} />
              <InfoRow label="SIRET" value={client.siret} mono />
              {client.format_juridique && (
                <InfoRow label="Forme juridique" value={client.format_juridique} />
              )}
            </div>
            <Separator className="my-4" />
            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                Adresse du siège
              </p>
              <p className="font-medium">{client.adresse_societe_ligne1}</p>
              {client.adresse_societe_ligne2 && <p className="text-muted-foreground">{client.adresse_societe_ligne2}</p>}
              <p className="font-semibold">{client.adresse_societe_cp} {client.adresse_societe_ville}</p>
            </div>
          </CardContent>
        </Card>

        {/* Colonne 2 - Contact */}
        <Card className="shadow-sm border-2">
          <CardContent className="px-5 py-3.5">
            <SectionTitle icon={User} title="Contact" />
            <div className="space-y-3">
              {(client.prenom_contact || client.nom_contact) && (
                <div>
                  <p className="text-sm text-muted-foreground">Nom</p>
                  <p className="font-medium text-lg">{client.prenom_contact} {client.nom_contact}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </p>
                <a href={`mailto:${client.email}`} className="font-medium hover:underline">
                  {client.email}
                </a>
              </div>
              {client.telephone && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    Téléphone
                  </p>
                  <a href={`tel:${client.telephone}`} className="font-medium text-lg hover:underline">
                    {client.telephone}
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Colonne 3 - Code ENEMAT */}
        <Card className={`shadow-sm border-2 ${client.code_enemat_bloque ? 'border-red-300' : client.code_enemat_valide ? 'border-emerald-300' : ''}`}>
          <CardContent className="px-5 py-3.5">
            <SectionTitle
              icon={KeyRound}
              title="Code ENEMAT"
              badge={
                client.code_enemat_valide ? (
                  <Badge className="bg-emerald-500">Validé</Badge>
                ) : client.code_enemat_bloque ? (
                  <Badge variant="destructive">Bloqué</Badge>
                ) : (
                  <Badge variant="outline">En attente</Badge>
                )
              }
            />
            {codeEnematSaisi ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-1">Code saisi</p>
                <p className="font-mono font-bold text-4xl tracking-widest">{codeEnematSaisi}</p>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">Pas encore saisi</p>
            )}
            <div className="flex justify-between text-sm mt-4">
              <span className="text-muted-foreground">Tentatives</span>
              <span className="font-semibold">{client.code_enemat_tentatives || 0}/3</span>
            </div>
            {client.date_validation_code && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Validé le</span>
                <span className="font-semibold">{new Date(client.date_validation_code).toLocaleDateString('fr-FR')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ligne 2 - Livraison (pleine largeur) */}
        <Card className="lg:col-span-2 shadow-sm border-2">
          <CardContent className="px-5 py-3.5">
            <SectionTitle
              icon={Truck}
              title="Livraison"
              badge={
                <Badge variant="outline">
                  {modeLivraison === 'retrait' ? 'Point relais' : 'À domicile'}
                </Badge>
              }
            />
            <div className="grid md:grid-cols-2 gap-4">
              {/* Adresse de livraison */}
              <div className="p-4 bg-muted/30 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  Adresse de livraison
                </p>
                {(client.adresse_livraison_ligne1 || livraison?.adresse_livraison_ligne1) ? (
                  <>
                    <p className="font-medium">{livraison?.adresse_livraison_ligne1 || client.adresse_livraison_ligne1}</p>
                    <p className="font-semibold">
                      {livraison?.adresse_livraison_cp || client.adresse_livraison_cp}{' '}
                      {livraison?.adresse_livraison_ville || client.adresse_livraison_ville}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground italic">Non définie</p>
                )}
              </div>

              {/* Dépôt assigné (retrait ou logistique) */}
              <div className="p-4 bg-muted/30 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <Warehouse className="h-4 w-4" />
                  {depotRetrait ? 'Point de retrait' : 'Dépôt logistique'}
                </p>
                {depotRetrait ? (
                  <>
                    <p className="font-semibold text-lg">{depotRetrait.nom}</p>
                    <p>{depotRetrait.adresse}</p>
                    <p className="font-medium">{depotRetrait.code_postal} {depotRetrait.ville}</p>
                  </>
                ) : depotLogistique ? (
                  <>
                    <p className="font-semibold text-lg">{depotLogistique.nom}</p>
                    <p>{depotLogistique.adresse}</p>
                    <p className="font-medium">{depotLogistique.code_postal} {depotLogistique.ville}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground italic">Aucun dépôt assigné</p>
                )}
                {distanceKm && (
                  <p className="text-sm text-muted-foreground mt-2 font-medium">{distanceKm.toFixed(1)} km (vol d'oiseau)</p>
                )}
              </div>
            </div>

            {/* Mini carte client/dépôt */}
            {client.latitude && client.longitude && (
              <div className="mt-4">
                <MiniMap
                  clientLat={client.latitude}
                  clientLng={client.longitude}
                  clientName={client.raison_sociale}
                  depotLat={depotRetrait?.latitude || depotLogistique?.latitude}
                  depotLng={depotRetrait?.longitude || depotLogistique?.longitude}
                  depotName={depotRetrait?.nom || depotLogistique?.nom}
                  depotType={depotRetrait ? 'retrait' : 'logistique'}
                  distanceKm={distanceKm || undefined}
                  height="300px"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents */}
        {livraison?.document_identite_url && (
          <Card className="shadow-sm border-2">
            <CardContent className="px-5 py-3.5">
              <SectionTitle icon={Shield} title="Documents" />
              <div className="p-4 bg-muted/30 rounded-lg border flex items-center justify-between">
                <div>
                  <p className="font-semibold capitalize">{livraison.document_identite_type || 'Document'}</p>
                  <p className="text-sm text-muted-foreground">{livraison.document_identite_nom_fichier}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(livraison.document_identite_url!, '_blank')}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Voir
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={livraison.document_identite_url!} download>
                      <Download className="h-4 w-4 mr-1" />
                      Télécharger
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historique - pleine largeur en bas */}
        <Card className="lg:col-span-3 shadow-sm border-2">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Historique</h3>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Créé le</span>
                <span className="font-medium">{new Date(client.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              {client.date_envoi_formulaire && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Formulaire envoyé</span>
                  <span className="font-medium">{new Date(client.date_envoi_formulaire).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
              {client.date_validation_code && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Code validé</span>
                  <span className="font-medium">{new Date(client.date_validation_code).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Modifié le</span>
                <span className="font-medium">{new Date(client.updated_at).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
