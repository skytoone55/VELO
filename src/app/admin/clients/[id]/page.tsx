'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Loader2,
  ArrowLeft,
  Building2,
  Truck,
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
  Calendar,
  Bike,
  Shield,
  Clock,
  CloudUpload,
  Info,
  FileText,
} from 'lucide-react'
import { Client, Livraison, Depot } from '@/lib/types/database'
import { PROCESS_STATUTS, STATUT_COLORS, STATUT_TRANSITIONS, type ProcessStatut } from '@/lib/constants'
import { getCommercialName } from '@/lib/tenants/commercial'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const MiniMap = dynamic(() => import('@/components/ui/mini-map').then(m => ({ default: m.MiniMap })), {
  ssr: false,
  loading: () => <div className="h-[200px] w-full bg-muted/30 rounded animate-pulse" />,
})


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
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-base text-foreground">{title}</h3>
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
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={`font-medium text-foreground text-sm ${mono ? 'font-mono' : ''} ${large ? 'text-lg' : ''}`}>{value}</span>
    </div>
  )
}

// Statuts commerciaux (pré-process) — les statuts process utilisent STATUT_COLORS
const statutCommercialColors: Record<string, string> = {
  devis_cree: 'bg-sky-100 text-sky-800',
  devis_signe: 'bg-blue-100 text-blue-800',
  client_contacte: 'bg-amber-100 text-amber-800',
  client_injoignable: 'bg-orange-100 text-orange-800',
  client_hs: 'bg-red-100 text-red-800',
  dossier_complet: 'bg-emerald-100 text-emerald-800',
  code_envoye: 'bg-cyan-100 text-cyan-800',
  controle_a_regulariser: 'bg-yellow-100 text-yellow-800',
  controle_a_jour: 'bg-teal-100 text-teal-800',
  ah_signee: 'bg-indigo-100 text-indigo-800',
  doublon: 'bg-slate-100 text-slate-600',
  franck: 'bg-pink-100 text-pink-800',
  inconnu: 'bg-gray-100 text-gray-600',
  // Process statuts — délégués à STATUT_COLORS
  ...STATUT_COLORS,
}

const statutCommercialLabels: Record<string, string> = {
  devis_cree: 'Devis créé',
  devis_signe: 'Devis signé',
  client_contacte: 'Client contacté',
  client_injoignable: 'Client injoignable',
  client_hs: 'Client HS',
  dossier_complet: 'Dossier complet',
  code_envoye: 'Code envoyé',
  controle_a_regulariser: 'Contrôle à régulariser',
  controle_a_jour: 'Contrôle à jour',
  ah_signee: 'AH signée',
  doublon: 'Doublon',
  franck: 'Franck',
  inconnu: 'Inconnu',
  // Process statuts — délégués à PROCESS_STATUTS
  ...PROCESS_STATUTS,
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
  const [resetFormOpen, setResetFormOpen] = useState(false)
  const [docRequestOpen, setDocRequestOpen] = useState(false)
  const [docRequestLoading, setDocRequestLoading] = useState(false)
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])

  // Zone calculée à partir de la distance au dépôt
  const computedZone = (() => {
    if (!distanceKm) return null
    const depot = depotRetrait || depotLogistique
    if (!depot) return null
    const rayon = (depot as any).rayon_couverture_km || 30
    return distanceKm <= rayon ? 'dans_la_zone' : 'hors_zone'
  })()

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
        if (data.depotRetrait) setDepotRetrait(data.depotRetrait)
        if (data.depotLogistique) setDepotLogistique(data.depotLogistique)
        if (data.distanceKm) setDistanceKm(data.distanceKm)
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
      const response = await fetch('/api/admin/clients/send-formulaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      if (data.emailErrors?.length > 0) {
        setError(`Envoyé avec erreurs email : ${data.emailErrors.join(', ')}`)
      } else {
        setSuccess('Code + formulaire envoyés par email')
      }
      setClient({ ...client, statut_commercial: 'formulaire_envoye' })
      setSendEmailOpen(false)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetForm = async () => {
    if (!client) return
    console.log('handleResetForm called for client:', client.id)
    setActionLoading(true)
    setError(null)

    try {
      console.log('Calling reset-formulaire API...')
      // Utiliser la nouvelle API de réinitialisation complète
      const response = await fetch('/api/admin/clients/reset-formulaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          sendNewCode: true  // Envoyer un nouveau code par email
        }),
      })

      console.log('API response status:', response.status)
      const data = await response.json()
      console.log('API response data:', data)
      if (!response.ok) throw new Error(data.error || 'Erreur API')

      // Logger la transition
      const supabase = createClient()
      await supabase.from('workflow_transitions').insert({
        entity_type: 'client',
        entity_id: client.id,
        statut_avant: client.statut_commercial,
        statut_apres: 'formulaire_envoye',
        effectue_par: user?.id,
        raison: 'Réinitialisation complète du formulaire par admin',
      })

      // Afficher le message approprié selon les erreurs d'email
      if (data.emailErrors && data.emailErrors.length > 0) {
        setError(`Client réinitialisé, mais erreur d'envoi email: ${data.emailErrors.join(', ')}`)
      } else {
        setSuccess('Client réinitialisé ! Un nouveau code et formulaire ont été envoyés par email.')
      }
      setResetFormOpen(false)

      // Recharger la page pour obtenir les données fraîches
      window.location.reload()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(message)
    } finally {
      setActionLoading(false)
    }
  }

  // Sync vers Monday
  const handleSyncToMonday = async () => {
    if (!client) return
    setActionLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/clients/${client.id}/sync-monday`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Sync tous les champs mappés
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setSuccess('Client synchronisé vers Monday')
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sync')
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenDelivery = async () => {
    if (!client) return

    // Ecovolt → redirection vers le module externe
    const tenantId = process.env.NEXT_PUBLIC_TENANT_ID
    if (tenantId === 'ecovolt') {
      window.open('https://ecovolt-retrait.vercel.app/', '_blank')
      return
    }

    // PPE → ouvrir le module de livraison dans un nouvel onglet
    let liv = livraisons[0]
    if (!liv) {
      // Auto-créer la livraison si elle n'existe pas
      try {
        const supabase = createClient()
        const { data: newLiv, error: createErr } = await supabase
          .from('livraisons')
          .insert({
            client_id: client.id,
            depot_id: client.depot_logistique_id || client.depot_retrait_id,
            mode_livraison: client.adresse_livraison_ligne1 ? 'domicile' : 'retrait',
            adresse_livraison_ligne1: client.adresse_livraison_ligne1 || client.adresse_societe_ligne1,
            adresse_livraison_cp: client.adresse_livraison_cp || client.adresse_societe_cp,
            adresse_livraison_ville: client.adresse_livraison_ville || client.adresse_societe_ville,
            statut: 'a_livrer',
          })
          .select('id')
          .single()
        if (createErr || !newLiv) {
          setError('Erreur création livraison: ' + (createErr?.message || 'inconnue'))
          return
        }
        liv = newLiv as any
      } catch {
        setError('Erreur création livraison')
        return
      }
    }
    window.open(`/admin/livraisons/deliver?id=${liv.id}`, '_blank')
  }

  const handleRequestDocuments = async () => {
    if (!client || !selectedDocs.length) return
    setDocRequestLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/clients/request-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, documents: selectedDocs }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur envoi demande')

      setSuccess(`Demande envoyée à ${data.email} (${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''})`)
      setDocRequestOpen(false)
      setSelectedDocs([])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(message)
    } finally {
      setDocRequestLoading(false)
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
  const codePpeSaisi = client.code_enemat_saisi || livraison?.code_enemat_saisi
  const formulaireComplete = ['formulaire_valide', 'a_livrer', 'en_livraison', 'livre', 'probleme_livraison', 'a_relivrer', 'retractation', 'anomalie'].includes(client.statut_commercial || '')

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
              <p className="text-slate-300 mt-1">{getDepartementLabel(client.departement || '')}</p>
            </div>
          </div>

          {/* Actions rapides dans le header */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Envoyer formulaire — visible seulement si controle_valide + NAF OUI */}
            {client.statut_commercial === 'controle_valide' && ['OUI', 'ok', 'oui'].includes(client.validation_naf || '') && (
              <Dialog open={sendEmailOpen} onOpenChange={setSendEmailOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0">
                    <Send className="mr-2 h-4 w-4" />
                    Envoyer formulaire
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Envoyer le code + formulaire</DialogTitle>
                    <DialogDescription>
                      Un code de validation et le lien du formulaire seront envoyés à {client.email_beneficiaire || client.email}
                    </DialogDescription>
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

            {/* Alerte si controle_valide mais NAF bloqué */}
            {client.statut_commercial === 'controle_valide' && !['OUI', 'ok', 'oui'].includes(client.validation_naf || '') && (
              <Badge className="bg-red-500/20 text-red-200 text-xs">NAF non validé</Badge>
            )}

            {/* Copier lien formulaire — visible si formulaire envoyé et pas encore complété */}
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

            {/* Réinitialiser — visible quand le process formulaire est en cours ET NAF validé */}
            {['formulaire_envoye', 'formulaire_valide', 'code_envoye'].includes(client.statut_commercial || '') && ['OUI', 'ok', 'oui'].includes(client.validation_naf || '') && (
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
                    <DialogDescription asChild>
                      <div>
                        <p>Cette action va :</p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Générer un nouveau code de validation</li>
                          <li>Renvoyer le code + formulaire par email</li>
                          <li>Réinitialiser toutes les étapes du formulaire</li>
                          <li>Effacer le choix de livraison/dépôt et l&apos;adresse</li>
                        </ul>
                      </div>
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

            {/* Boutons d'action principaux — centrés et espacés */}
            {client.statut_commercial === 'a_livrer' && !livraisons[0]?.creneau_date && (
              <Button
                size="sm"
                asChild
                className="bg-blue-500 hover:bg-blue-600 text-white border-0 px-6 font-semibold"
              >
                <Link href={`/admin/planning${client.depot_retrait_id ? `?depot_id=${client.depot_retrait_id}` : client.depot_logistique_id ? `?depot_id=${client.depot_logistique_id}` : ''}`}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Planifier
                </Link>
              </Button>
            )}

            {['a_livrer', 'en_livraison'].includes(client.statut_commercial || '') && (
              <Button
                size="sm"
                onClick={handleOpenDelivery}
                className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 px-6 font-semibold"
              >
                <Truck className="mr-2 h-4 w-4" />
                Livrer
              </Button>
            )}

            {/* Séparateur avant badges statut */}
            <div className="h-6 w-px bg-white/20 mx-3" />

            {/* Statut commercial */}
            <Badge className={`${statutCommercialColors[client.statut_commercial || 'inconnu']} text-sm px-3 py-1`}>
              {statutCommercialLabels[client.statut_commercial || 'inconnu']}
            </Badge>
            {(() => {
              const zone = client.type_de_zone || computedZone
              if (!zone) return null
              return (
                <Badge className={`text-sm px-3 py-1 ${
                  zone === 'dans_la_zone'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}>
                  {zone === 'dans_la_zone' ? 'Dans la zone' : 'Hors zone'}
                </Badge>
              )
            })()}
          </div>
        </div>

        {/* Métriques rapides */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-4 border-t border-white/20">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Bike className="h-4 w-4" />
              Vélos
            </div>
            <div className="text-2xl font-bold">{client.velo_valide || 0}<span className="text-slate-400">/{client.velo_devis}</span></div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <KeyRound className="h-4 w-4" />
              Code PPE
            </div>
            <div className="text-lg font-mono font-bold">
              {codePpeSaisi || '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Shield className="h-4 w-4" />
              Statut NAF
            </div>
            <div className="text-lg font-semibold">
              {['OUI', 'ok', 'oui'].includes(client.validation_naf || '') ? (
                <span className="text-emerald-400 flex items-center justify-center gap-1">
                  <CheckCircle className="h-5 w-5" /> Éligible
                </span>
              ) : client.validation_naf === 'NON' ? (
                <span className="text-red-400 flex items-center justify-center gap-1">
                  <AlertCircle className="h-5 w-5" /> Non éligible
                </span>
              ) : (
                <span className="text-slate-400">À vérifier</span>
              )}
            </div>
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
          {livraisons[0]?.creneau_date && (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-slate-300 text-xs uppercase tracking-wide mb-1">
                <Calendar className="h-4 w-4" />
                Programmé le
              </div>
              <div className="text-lg font-semibold">
                {(() => {
                  const [y, m, d] = livraisons[0].creneau_date!.split('-').map(Number)
                  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
                })()}
                {livraisons[0].creneau_heure_debut && (
                  <span className="text-sm text-slate-400 ml-1">
                    {livraisons[0].creneau_heure_debut.slice(0, 5)}
                  </span>
                )}
              </div>
            </div>
          )}
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

      {/* Contenu principal - 2 colonnes */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Colonne 1 - Société */}
        <Card className="shadow-sm">
          <CardContent className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Société</h3>
            </div>
            <div className="space-y-0">
              <InfoRow label="Raison sociale" value={client.raison_sociale} />
              <InfoRow label="SIRET" value={client.siret} mono />
              {client.format_juridique && (
                <InfoRow label="Forme juridique" value={client.format_juridique} />
              )}
            </div>
            <Separator className="my-1.5" />
            <div className="text-sm">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Siège
              </p>
              <p className="font-medium text-sm">{client.adresse_societe_ligne1}</p>
              {client.adresse_societe_ligne2 && <p className="text-muted-foreground text-sm">{client.adresse_societe_ligne2}</p>}
              <p className="font-semibold text-sm">{client.adresse_societe_cp} {client.adresse_societe_ville}</p>
            </div>
          </CardContent>
        </Card>

        {/* Colonne 2 - Contact */}
        <Card className="shadow-sm">
          <CardContent className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <User className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Contact</h3>
            </div>
            <div className="space-y-0">
              <InfoRow label="Nom" value={(client.prenom_contact || client.nom_contact) ? `${client.prenom_contact || ''} ${client.nom_contact || ''}`.trim() : null} />
              <InfoRow label="Email" value={client.email_beneficiaire ? (
                <a href={`mailto:${client.email_beneficiaire}`} className="hover:underline text-sm">
                  {client.email_beneficiaire}
                </a>
              ) : '-'} />
              <InfoRow label="Commercial" value={getCommercialName(client)} />
              <InfoRow label="Téléphone" value={client.telephone ? (
                <a href={`tel:${client.telephone}`} className="hover:underline">
                  {client.telephone}
                </a>
              ) : null} />
            </div>
          </CardContent>
        </Card>

        {/* Livraison */}
        <Card className="shadow-sm border-2">
          <CardContent className="px-5 py-3.5">
            <SectionTitle
              icon={Truck}
              title="Livraison"
              badge={
                <div className="flex gap-2">
                  <Badge variant="outline">
                    {modeLivraison === 'retrait' ? 'Point relais' : 'À domicile'}
                  </Badge>
                  {(() => {
                    const zone = client.type_de_zone || computedZone
                    if (!zone) return null
                    return zone === 'dans_la_zone'
                      ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Dans la zone</Badge>
                      : <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Hors zone</Badge>
                  })()}
                </div>
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
                    {(livraison?.adresse_livraison_ligne2 || client.adresse_livraison_ligne2) && (
                      <p className="text-muted-foreground">{livraison?.adresse_livraison_ligne2 || client.adresse_livraison_ligne2}</p>
                    )}
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

            {/* Complément d'adresse */}
            {livraison?.complement_adresse && (
              <div className="mt-3">
                <div className="p-3 bg-muted/30 rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-1">Complément d&apos;adresse</p>
                  <p className="text-sm font-medium">{livraison.complement_adresse}</p>
                </div>
              </div>
            )}

            {/* Préférences de livraison (saisies par le client dans le formulaire) */}
            {client.preferences_livraison && (
              <div className="mt-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Préférences du client (formulaire)
                  </p>
                  <p className="text-sm font-medium">{client.preferences_livraison}</p>
                </div>
              </div>
            )}

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

        {/* Documents — 5 slots distincts */}
        <Card className="shadow-sm border-2">
          <CardContent className="px-5 py-3.5">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle icon={Shield} title="Documents" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDocRequestOpen(!docRequestOpen)}
              >
                <FileText className="h-4 w-4 mr-1" />
                Demander des pièces
              </Button>
            </div>

            {/* Mini-formulaire de sélection des pièces à demander */}
            {docRequestOpen && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium mb-3">Sélectionnez les documents à demander :</p>
                <div className="space-y-2">
                  {[
                    { key: 'urssaf', label: 'Attestation URSSAF (< 3 mois)' },
                    { key: 'dsn', label: 'Attestation DSN format EDI' },
                    { key: 'benevoles', label: 'Déclaration de Bénévoles' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDocs.includes(key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDocs([...selectedDocs, key])
                          } else {
                            setSelectedDocs(selectedDocs.filter(d => d !== key))
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    disabled={!selectedDocs.length || docRequestLoading}
                    onClick={handleRequestDocuments}
                  >
                    {docRequestLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Envoyer la demande
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setDocRequestOpen(false); setSelectedDocs([]) }}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-3">
              {/* Slot 1 — Pièce d'identité (photo livreur lors livraison) */}
              <div className="p-3 bg-muted/30 rounded-lg border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${livraison?.document_identite_url || (livraison as any)?.photos_livraison?.photo_identite ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-sm">Pièce d&apos;identité</p>
                    <p className="text-xs text-muted-foreground">
                      {livraison?.document_identite_url || (livraison as any)?.photos_livraison?.photo_identite
                        ? livraison?.document_identite_nom_fichier || 'Reçu'
                        : 'Manquant — pris en photo lors de la livraison'}
                    </p>
                  </div>
                </div>
                {(livraison?.document_identite_url || (livraison as any)?.photos_livraison?.photo_identite) && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (livraison?.document_identite_url) {
                        window.open(livraison.document_identite_url, '_blank')
                      } else {
                        const w = window.open('', '_blank')
                        if (w) w.document.write(`<img src="${(livraison as any).photos_livraison.photo_identite}" style="max-width:100%"/>`)
                      }
                    }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Slot 2 — PDF de livraison (attestation complète) */}
              <div className="p-3 bg-muted/30 rounded-lg border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${(livraison as any)?.pdf_livraison_url ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-sm">PDF de livraison</p>
                    <p className="text-xs text-muted-foreground">
                      {(livraison as any)?.pdf_livraison_url
                        ? 'Généré après livraison'
                        : 'Sera généré automatiquement après livraison'}
                    </p>
                  </div>
                </div>
                {(livraison as any)?.pdf_livraison_url && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => {
                      window.open((livraison as any).pdf_livraison_url, '_blank')
                    }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Slot 3 — Attestation URSSAF */}
              <div className="p-3 bg-muted/30 rounded-lg border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${(client as any).attestation_urssaf_url ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-sm">Attestation URSSAF</p>
                    <p className="text-xs text-muted-foreground">
                      {(client as any).attestation_urssaf_url ? 'Reçu' : 'À jour de moins de 3 mois — sur demande'}
                    </p>
                  </div>
                </div>
                {(client as any).attestation_urssaf_url && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => window.open((client as any).attestation_urssaf_url, '_blank')}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Slot 4 — DSN format EDI */}
              <div className="p-3 bg-muted/30 rounded-lg border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${(client as any).attestation_dsn_url ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-sm">Attestation DSN (EDI)</p>
                    <p className="text-xs text-muted-foreground">
                      {(client as any).attestation_dsn_url ? 'Reçu' : 'Sur demande'}
                    </p>
                  </div>
                </div>
                {(client as any).attestation_dsn_url && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => window.open((client as any).attestation_dsn_url, '_blank')}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Slot 5 — Déclaration de Bénévoles */}
              <div className="p-3 bg-muted/30 rounded-lg border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${(client as any).declaration_benevoles_url ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-sm">Déclaration de Bénévoles</p>
                    <p className="text-xs text-muted-foreground">
                      {(client as any).declaration_benevoles_url ? 'Reçu' : 'Sur demande'}
                    </p>
                  </div>
                </div>
                {(client as any).declaration_benevoles_url && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => window.open((client as any).declaration_benevoles_url, '_blank')}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Historique - pleine largeur en bas */}
        <Card className="lg:col-span-2 shadow-sm border-2">
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
