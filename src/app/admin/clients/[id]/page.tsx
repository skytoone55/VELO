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
  CalendarCheck,
  Bike,
  Shield,
  Clock,
  CloudUpload,
  Info,
  FileText,
  Pencil,
  Check,
  X,
  Trash2,
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
  const [docRequestOpen, setDocRequestOpen] = useState(false)
  const [docRequestLoading, setDocRequestLoading] = useState(false)
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [docToDelete, setDocToDelete] = useState<{ type: 'client' | 'livraison'; field: string; label: string } | null>(null)
  const [docDeleting, setDocDeleting] = useState(false)

  // Mail livraison / formulaire retrait / mail planning
  const [mailLivraisonLoading, setMailLivraisonLoading] = useState(false)
  const [formulaireRetraitLoading, setFormulaireRetraitLoading] = useState(false)
  const [mailPlanningLoading, setMailPlanningLoading] = useState(false)

  // Client HS
  const [hsDialogOpen, setHsDialogOpen] = useState(false)
  const [hsConfirmOpen, setHsConfirmOpen] = useState(false)
  const [hsComment, setHsComment] = useState('')
  const [hsLoading, setHsLoading] = useState(false)

  // Inline edit — préférences & complément
  const [editingPreferences, setEditingPreferences] = useState(false)
  const [editPreferencesValue, setEditPreferencesValue] = useState('')
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [editingComplement, setEditingComplement] = useState(false)
  const [editComplementValue, setEditComplementValue] = useState('')
  const [savingComplement, setSavingComplement] = useState(false)

  // FNUCI (PPE only)
  const [fnuciRecords, setFnuciRecords] = useState<Array<{ id: string; numero: number; reference: string; statut: string; attribue_at: string | null }>>([])
  const [livreurNom, setLivreurNom] = useState<string | null>(null)
  const [enematHistory, setEnematHistory] = useState<any[]>([])
  const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'ecovolt'

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

        // Fetch FNUCI records
        if (data.client?.id) {
          try {
            const supabase = createClient()
            const { data: fnuci } = await supabase
              .from('fnuci')
              .select('id, numero, reference, statut, attribue_at')
              .eq('client_id', data.client.id)
              .order('numero', { ascending: true })
            if (fnuci) setFnuciRecords(fnuci)
          } catch {
            // Non-blocking
          }
        }

        // Fetch livreur name from livraison
        const livraisonLivree = (data.livraisons || []).find((l: any) => l.livreur_id)
        if (livraisonLivree?.livreur_id) {
          try {
            const supabase = createClient()
            const { data: livreur } = await supabase
              .from('users_profile')
              .select('nom, prenom')
              .eq('id', livraisonLivree.livreur_id)
              .single()
            if (livreur) setLivreurNom(`${livreur.prenom || ''} ${livreur.nom || ''}`.trim())
          } catch {
            // Non-blocking
          }
        }

        // Fetch ENEMAT history (toujours, même si le client n'est plus dans ENEMAT)
        if (data.client?.id) {
          try {
            const supabase = createClient()
            const { data: history } = await supabase
              .from('enemat_history')
              .select('id, statut_avant, statut_apres, changed_by, changed_at, notes')
              .eq('client_id', data.client.id)
              .order('changed_at', { ascending: false })
              .limit(20)

            if (history && history.length > 0) {
              // Fetch user names for changed_by
              const userIds = [...new Set(history.filter(h => h.changed_by).map(h => h.changed_by!))]
              let userNames: Record<string, string> = {}
              if (userIds.length > 0) {
                const { data: users } = await supabase
                  .from('users_profile')
                  .select('id, nom, prenom')
                  .in('id', userIds)
                if (users) {
                  userNames = Object.fromEntries(users.map(u => [u.id, `${u.prenom || ''} ${u.nom || ''}`.trim()]))
                }
              }
              setEnematHistory(history.map(h => ({
                ...h,
                changed_by_name: h.changed_by ? userNames[h.changed_by] || null : null,
              })))
            }
          } catch {
            // Non-blocking
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

  const handleClientHS = async () => {
    if (!client || !hsComment.trim()) return
    setHsLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const now = new Date().toISOString()
      const logEntry = `[HS ${new Date().toLocaleDateString('fr-FR')} par ${user?.nom || user?.email || 'Admin'}] ${hsComment.trim()}`
      const existingNotes = client.notes_internes ? client.notes_internes + '\n' : ''
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut_commercial: 'client_hs',
          date_statut: now,
          notes_internes: existingNotes + logEntry,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur')
      }
      setClient({ ...client, statut_commercial: 'client_hs', notes_internes: existingNotes + logEntry, date_statut: now })
      setSuccess('Client passé en HS')
      setHsDialogOpen(false)
      setHsConfirmOpen(false)
      setHsComment('')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setHsLoading(false)
    }
  }

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

    // Ecovolt → redirection vers le module externe de l'associe
    const tenantId = process.env.NEXT_PUBLIC_TENANT_ID
    if (tenantId === 'ecovolt') {
      const baseUrl = process.env.NEXT_PUBLIC_ECOVOLT_RETRAIT_URL || 'https://ecovolt-retrait.vercel.app'
      const mondayId = client.monday_item_id || ''
      const livId = livraisons[0]?.id || ''
      window.open(`${baseUrl}?monday_id=${mondayId}&livraison_id=${livId}`, '_blank')
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

  const handleDeleteDocument = async () => {
    if (!client || !docToDelete) return
    setDocDeleting(true)
    try {
      if (docToDelete.type === 'client') {
        // Passer par l'API admin (bypass RLS, guard agent depot_ids)
        const res = await fetch(`/api/admin/clients/${client.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [docToDelete.field]: null }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Erreur suppression')
        }
        setClient({ ...client, [docToDelete.field]: null } as any)
      } else if (docToDelete.type === 'livraison' && livraison) {
        // Pour les livraisons, utiliser le client admin via une API dédiée
        const supabase = createClient()
        const { error } = await supabase
          .from('livraisons')
          .update({ [docToDelete.field]: null, updated_at: new Date().toISOString() })
          .eq('id', livraison.id)
        if (error) throw error
        setLivraisons(prev => prev.map(l => l.id === livraison.id ? { ...l, [docToDelete.field]: null } as any : l))
      }
      setSuccess(`${docToDelete.label} supprimé`)
      setDocToDelete(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur suppression'
      setError(message)
    } finally {
      setDocDeleting(false)
    }
  }

  const handleSendMailLivraison = async () => {
    if (!client) return
    setMailLivraisonLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/livraisons/send-mail-livraison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur envoi')
      setSuccess('Mail livraison envoyé')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(message)
    } finally {
      setMailLivraisonLoading(false)
    }
  }


  const handleSendFormulaireRetrait = async () => {
    if (!client) return
    setFormulaireRetraitLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/clients/send-formulaire-livraison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur envoi')
      setSuccess('Formulaire de retrait envoyé')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(message)
    } finally {
      setFormulaireRetraitLoading(false)
    }
  }

  const handleSavePreferences = async () => {
    if (!client) return
    setSavingPreferences(true)
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences_livraison: editPreferencesValue || null }),
      })
      if (!res.ok) throw new Error('Erreur sauvegarde')
      setClient({ ...client, preferences_livraison: editPreferencesValue || null })
      setEditingPreferences(false)
      setSuccess('Préférences mises à jour')
    } catch {
      setError('Erreur lors de la sauvegarde des préférences')
    } finally {
      setSavingPreferences(false)
    }
  }

  const handleSaveComplement = async () => {
    if (!livraisons[0]) return
    setSavingComplement(true)
    try {
      const res = await fetch(`/api/admin/livraisons/${livraisons[0].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complement_adresse: editComplementValue || null }),
      })
      if (!res.ok) throw new Error('Erreur sauvegarde')
      setLivraisons(prev => prev.map((l, i) => i === 0 ? { ...l, complement_adresse: editComplementValue || null } : l))
      setEditingComplement(false)
      setSuccess('Complément d\'adresse mis à jour')
    } catch {
      setError('Erreur lors de la sauvegarde du complément')
    } finally {
      setSavingComplement(false)
    }
  }

  const handleSendMailPlanning = async () => {
    if (!client || !livraisons[0]) return
    setMailPlanningLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/livraisons/send-mail-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livraisonIds: [livraisons[0].id] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur envoi')
      setSuccess('Mail planning envoyé')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(message)
    } finally {
      setMailPlanningLoading(false)
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
  const LIVRAISON_STATUTS = ['formulaire_valide', 'a_livrer', 'en_livraison', 'retrait_planifie', 'livre', 'controle_valide', 'probleme_livraison', 'a_relivrer']
  const backUrl = LIVRAISON_STATUTS.includes(client.statut_commercial || '') ? '/admin/livraisons' : '/admin/clients'
  const codePpeSaisi = client.code_enemat_saisi || livraison?.code_enemat_saisi
  const formulaireComplete = ['formulaire_valide', 'a_livrer', 'en_livraison', 'livre', 'probleme_livraison', 'a_relivrer', 'retractation', 'anomalie'].includes(client.statut_commercial || '')

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-8">
      {/* Header amélioré avec gradient */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          {/* Gauche — retour + nom société */}
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(backUrl)}
              className="text-white hover:bg-white/20 shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{client.raison_sociale}</h1>
              <p className="text-slate-300 mt-1">{getDepartementLabel(client.departement || '')}</p>
            </div>
          </div>

          {/* Centre — boutons Planifier + Livrer + mails livraison */}
          <div className="flex items-center justify-center gap-2 flex-1 flex-wrap">
            {client.statut_commercial !== 'livre' && client.statut_commercial === 'a_livrer' && !livraisons[0]?.creneau_date && (
              <Button
                size="sm"
                asChild
                className="bg-blue-500 hover:bg-blue-600 text-white border-0 px-4 font-semibold"
              >
                <Link href={`/admin/planning${client.depot_retrait_id ? `?depot_id=${client.depot_retrait_id}` : client.depot_logistique_id ? `?depot_id=${client.depot_logistique_id}` : ''}`}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Planifier
                </Link>
              </Button>
            )}

            {client.statut_commercial !== 'livre' && ['a_livrer', 'en_livraison'].includes(client.statut_commercial || '') && (
              <Button
                size="sm"
                onClick={handleOpenDelivery}
                className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 px-4 font-semibold"
              >
                <Truck className="mr-2 h-4 w-4" />
                Livraison
              </Button>
            )}

            {client.statut_commercial !== 'livre' && ['a_livrer', 'en_livraison', 'retrait_planifie'].includes(client.statut_commercial || '') && !client.depot_retrait_id && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSendMailLivraison}
                disabled={mailLivraisonLoading}
                className="text-white hover:bg-white/20 px-3"
              >
                {mailLivraisonLoading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-1.5" />
                )}
                Mail livraison
              </Button>
            )}


            {client.statut_commercial !== 'livre' && ['a_livrer', 'en_livraison', 'retrait_planifie'].includes(client.statut_commercial || '') && client.depot_retrait_id && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSendFormulaireRetrait}
                disabled={formulaireRetraitLoading}
                className="text-white hover:bg-white/20 px-3"
              >
                {formulaireRetraitLoading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-1.5" />
                )}
                Formulaire retrait
              </Button>
            )}

            {livraisons[0]?.statut === 'en_livraison' && client.statut_commercial !== 'livre' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSendMailPlanning}
                disabled={mailPlanningLoading}
                className="text-white hover:bg-white/20 px-3"
              >
                {mailPlanningLoading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <CalendarCheck className="h-4 w-4 mr-1.5" />
                )}
                Mail planning
              </Button>
            )}
          </div>

          {/* Droite — actions secondaires + badges statut */}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {/* Envoyer formulaire — visible si controle_valide ou formulaire_envoye + NAF OUI */}
            {['controle_valide', 'formulaire_envoye'].includes(client.statut_commercial || '') && ['OUI', 'ok', 'oui'].includes(client.validation_naf || '') && (
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

            {/* Bouton Client HS — admin et super_admin uniquement */}
            {(user?.role === 'super_admin' || user?.role === 'admin') && client.statut_commercial !== 'client_hs' && (
              <Dialog open={hsDialogOpen} onOpenChange={setHsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="bg-red-600 hover:bg-red-700">
                    <X className="mr-2 h-4 w-4" />
                    Client HS
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Passer le client en HS</DialogTitle>
                    <DialogDescription>
                      Cette action marquera le client comme annulé (HS). Veuillez indiquer la raison.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-3">
                    <label className="text-sm font-medium mb-2 block">Raison de l&apos;annulation *</label>
                    <textarea
                      className="w-full border rounded-md p-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Ex: Client ne répond plus, entreprise fermée, rétractation..."
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
            )}

            {/* Séparateur avant badges statut */}
            <div className="h-6 w-px bg-white/20 mx-1" />

            {/* Controle qualite badge */}
            {livraisons.some((l: any) => l.cq_valide) && (
              <Badge className="bg-emerald-500/20 text-emerald-200 text-sm px-3 py-1">
                ✓ Contrôle validé
              </Badge>
            )}

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
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-6 pt-4 border-t border-white/20">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Bike className="h-3.5 w-3.5" />
              Vélos
            </div>
            <div className="text-xl font-bold">{client.velo_valide || 0}<span className="text-slate-400">/{client.velo_devis}</span></div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <KeyRound className="h-3.5 w-3.5" />
              REF ENEMAT
            </div>
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm font-mono font-bold truncate">
                {(client as any).reference_retina || '—'}
              </span>
              {(client as any).reference_retina && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText((client as any).reference_retina)
                    setSuccess('Référence copiée')
                  }}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                  title="Copier la référence"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Shield className="h-3.5 w-3.5" />
              NAF
            </div>
            <div className="text-sm font-semibold">
              {['OUI', 'ok', 'oui'].includes(client.validation_naf || '') ? (
                <span className="text-emerald-400 flex items-center justify-center gap-1">
                  <CheckCircle className="h-4 w-4" /> Éligible
                </span>
              ) : client.validation_naf === 'NON' ? (
                <span className="text-red-400 flex items-center justify-center gap-1">
                  <AlertCircle className="h-4 w-4" /> Non éligible
                </span>
              ) : (
                <span className="text-slate-400">À vérifier</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-slate-300 text-xs uppercase tracking-wide mb-1">
              <Truck className="h-3.5 w-3.5" />
              Livraison
            </div>
            <div className="text-sm font-semibold">
              {modeLivraison === 'retrait' ? 'Point relais' : 'Domicile'}
            </div>
          </div>
          <div className="text-center">
            {client.statut_commercial === 'livre' && livraisons[0]?.date_livraison_effective ? (
              <>
                <div className="flex items-center justify-center gap-1 text-emerald-400 text-xs uppercase tracking-wide mb-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Livré le
                </div>
                <div className="text-sm font-semibold">
                  {new Date(livraisons[0].date_livraison_effective).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-1 text-slate-300 text-xs uppercase tracking-wide mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Programmé
                </div>
                <div className="text-sm font-semibold">
                  {livraisons[0]?.creneau_date ? (
                    <>
                      {(() => {
                        const [y, m, d] = livraisons[0].creneau_date!.split('-').map(Number)
                        return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
                      })()}
                      {livraisons[0].creneau_heure_debut && (
                        <span className="text-xs text-slate-400 ml-1">
                          {livraisons[0].creneau_heure_debut.slice(0, 5)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              </>
            )}
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
              <InfoRow label="Code NAF" value={client.code_ape} mono />
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
              <InfoRow label="Nom" value={(client.contact_prenom || client.contact_nom || client.prenom_contact || client.nom_contact) ? `${client.contact_prenom || client.prenom_contact || ''} ${client.contact_nom || client.nom_contact || ''}`.trim() : null} />
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

            {/* Complément d'adresse — éditable */}
            <div className="mt-3">
              <div className="p-3 bg-muted/30 rounded-lg border">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Complément d&apos;adresse</p>
                  {!editingComplement && livraisons[0] && (
                    <button onClick={() => { setEditComplementValue(livraisons[0]?.complement_adresse || ''); setEditingComplement(true) }} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {editingComplement ? (
                  <div className="flex gap-2">
                    <textarea value={editComplementValue} onChange={e => setEditComplementValue(e.target.value)} className="flex-1 text-sm border rounded px-2 py-1 resize-none" rows={2} placeholder="Ex: Bâtiment B, 3ème étage..." />
                    <div className="flex flex-col gap-1">
                      <button onClick={handleSaveComplement} disabled={savingComplement} className="text-green-600 hover:text-green-700 disabled:opacity-50">
                        {savingComplement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button onClick={() => setEditingComplement(false)} className="text-red-500 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-medium">{livraisons[0]?.complement_adresse || <span className="text-muted-foreground italic">Non renseigné</span>}</p>
                )}
              </div>
            </div>

            {/* Préférences de livraison — éditable */}
            <div className="mt-3">
              <div className={`p-3 rounded-lg border ${client.preferences_livraison ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-muted/30 border-dashed'}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className={`text-xs flex items-center gap-1 ${client.preferences_livraison ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}>
                    <Info className="h-3 w-3" />
                    Préférences du client
                  </p>
                  {!editingPreferences && (
                    <button onClick={() => { setEditPreferencesValue(client.preferences_livraison || ''); setEditingPreferences(true) }} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {editingPreferences ? (
                  <div className="flex gap-2">
                    <textarea value={editPreferencesValue} onChange={e => setEditPreferencesValue(e.target.value)} className="flex-1 text-sm border rounded px-2 py-1 resize-none" rows={2} placeholder="Préférences de livraison..." />
                    <div className="flex flex-col gap-1">
                      <button onClick={handleSavePreferences} disabled={savingPreferences} className="text-green-600 hover:text-green-700 disabled:opacity-50">
                        {savingPreferences ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button onClick={() => setEditingPreferences(false)} className="text-red-500 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  client.preferences_livraison
                    ? <p className="text-sm font-medium">{client.preferences_livraison}</p>
                    : <p className="text-sm text-muted-foreground italic">Non renseigné</p>
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
                    <Button variant="ghost" size="sm" title="Télécharger" onClick={async () => {
                      const prefix = client.reference_retina || client.raison_sociale || 'document'
                      if (livraison?.document_identite_url) {
                        const url = livraison.document_identite_url
                        const filename = livraison?.document_identite_nom_fichier || `${prefix}-PI.pdf`
                        const downloadUrl = url.includes('?') ? `${url}&download=${encodeURIComponent(filename)}` : `${url}?download=${encodeURIComponent(filename)}`
                        window.open(downloadUrl, '_blank')
                      } else {
                        // Base64 → download programmatique
                        const b64 = (livraison as any)?.photos_livraison?.photo_identite
                        if (b64) {
                          const a = document.createElement('a')
                          a.href = b64
                          a.download = `${prefix}-PI.jpg`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                        }
                      }
                    }}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Supprimer" className="text-destructive hover:text-destructive" onClick={() => setDocToDelete({ type: 'livraison', field: 'document_identite_url', label: "Pièce d'identité" })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Slot 2 — PDF de livraison (attestation complète) */}
              <div className="p-3 bg-muted/30 rounded-lg border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${(livraison as any)?.attestation_pdf_url || (livraison as any)?.photos_livraison?.attestation_pdf ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-sm">PDF de livraison</p>
                    <p className="text-xs text-muted-foreground">
                      {(livraison as any)?.attestation_pdf_url || (livraison as any)?.photos_livraison?.attestation_pdf
                        ? 'Généré après livraison'
                        : 'Sera généré automatiquement après livraison'}
                    </p>
                  </div>
                </div>
                {((livraison as any)?.attestation_pdf_url || (livraison as any)?.photos_livraison?.attestation_pdf) && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => {
                      if ((livraison as any)?.attestation_pdf_url) {
                        window.open((livraison as any).attestation_pdf_url, '_blank')
                      } else {
                        const pdfData = (livraison as any).photos_livraison.attestation_pdf
                        const w = window.open('', '_blank')
                        if (w) w.document.write(`<iframe src="${pdfData}" style="width:100%;height:100vh;border:none"></iframe>`)
                      }
                    }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Télécharger" onClick={async () => {
                      const url = (livraison as any)?.attestation_pdf_url || (livraison as any)?.photos_livraison?.attestation_pdf
                      const prefix = client.reference_retina || client.raison_sociale || 'document'
                      const filename = `${prefix}-BL.pdf`
                      const downloadUrl = url.includes('?') ? `${url}&download=${encodeURIComponent(filename)}` : `${url}?download=${encodeURIComponent(filename)}`
                      window.open(downloadUrl, '_blank')
                    }}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Supprimer" className="text-destructive hover:text-destructive" onClick={() => setDocToDelete({ type: 'livraison', field: 'attestation_pdf_url', label: 'PDF de livraison' })}>
                      <Trash2 className="h-4 w-4" />
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
                    <Button variant="ghost" size="sm" title="Télécharger" onClick={async () => {
                      const url = (client as any).attestation_urssaf_url
                      const prefix = client.reference_retina || client.raison_sociale || 'document'
                      const filename = `${prefix}-URSSAF.pdf`
                      const downloadUrl = url.includes('?') ? `${url}&download=${encodeURIComponent(filename)}` : `${url}?download=${encodeURIComponent(filename)}`
                      window.open(downloadUrl, '_blank')
                    }}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Supprimer" className="text-destructive hover:text-destructive" onClick={() => setDocToDelete({ type: 'client', field: 'attestation_urssaf_url', label: 'Attestation URSSAF' })}>
                      <Trash2 className="h-4 w-4" />
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
                    <Button variant="ghost" size="sm" title="Télécharger" onClick={async () => {
                      const url = (client as any).attestation_dsn_url
                      const prefix = client.reference_retina || client.raison_sociale || 'document'
                      const filename = `${prefix}-DSN.pdf`
                      const downloadUrl = url.includes('?') ? `${url}&download=${encodeURIComponent(filename)}` : `${url}?download=${encodeURIComponent(filename)}`
                      window.open(downloadUrl, '_blank')
                    }}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Supprimer" className="text-destructive hover:text-destructive" onClick={() => setDocToDelete({ type: 'client', field: 'attestation_dsn_url', label: 'Attestation DSN' })}>
                      <Trash2 className="h-4 w-4" />
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
                    <Button variant="ghost" size="sm" title="Télécharger" onClick={async () => {
                      const url = (client as any).declaration_benevoles_url
                      const prefix = client.reference_retina || client.raison_sociale || 'document'
                      const filename = `${prefix}-BENEVOLES.pdf`
                      const downloadUrl = url.includes('?') ? `${url}&download=${encodeURIComponent(filename)}` : `${url}?download=${encodeURIComponent(filename)}`
                      window.open(downloadUrl, '_blank')
                    }}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Supprimer" className="text-destructive hover:text-destructive" onClick={() => setDocToDelete({ type: 'client', field: 'declaration_benevoles_url', label: 'Déclaration Bénévoles' })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* FNUCI attribués — inside Documents */}
              {fnuciRecords.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bike className="h-4 w-4 text-muted-foreground" />
                      <h4 className="font-semibold text-sm text-foreground">FNUCI attribués ({fnuciRecords.length})</h4>
                    </div>
                    {livreurNom && (
                      <span className="text-xs text-muted-foreground">
                        Livré par <span className="font-medium text-foreground">{livreurNom}</span>
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {fnuciRecords.map((f) => (
                      <div key={f.id} className="p-2 bg-muted/30 rounded-lg border flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <Badge variant={f.statut === 'attribue' ? 'default' : f.statut === 'bloque' ? 'destructive' : 'secondary'} className="text-xs">
                            {f.statut}
                          </Badge>
                          <span className="font-mono font-medium">{f.reference}</span>
                          <span className="text-muted-foreground">N°{f.numero}</span>
                        </div>
                        {f.attribue_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(f.attribue_at).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              {livraisons[0]?.date_livraison_effective && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Livré le</span>
                  <span className="font-medium">{new Date(livraisons[0].date_livraison_effective).toLocaleDateString('fr-FR')}</span>
                  {(livraisons[0] as any).livreur_nom && (
                    <span className="text-muted-foreground">par <span className="font-medium text-foreground">{(livraisons[0] as any).livreur_nom}</span></span>
                  )}
                </div>
              )}
              {livraisons.some((l: any) => l.cq_valide_at) && (() => {
                const livCq = livraisons.find((l: any) => l.cq_valide_at) as any
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-medium">Contrôle validé</span>
                    <span className="font-medium">{new Date(livCq.cq_valide_at).toLocaleDateString('fr-FR')}</span>
                    {livCq.controleur_nom && (
                      <span className="text-muted-foreground">par <span className="font-medium text-foreground">{livCq.controleur_nom}</span></span>
                    )}
                  </div>
                )
              })()}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Modifié le</span>
                <span className="font-medium">{new Date(client.updated_at).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>
            {/* Notes internes / logs (HS, etc.) */}
            {client.notes_internes && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Notes & logs</p>
                <div className="space-y-1">
                  {client.notes_internes.split('\n').filter(Boolean).map((line: string, i: number) => (
                    <div key={i} className={`text-xs ${line.startsWith('[HS') ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ENEMAT — visible si in_enemat ou si historique ENEMAT existe */}
        {(client.in_enemat || enematHistory.length > 0) && (
          <Card className="lg:col-span-2 shadow-sm border-2 border-violet-200">
            <CardContent className="px-4 py-3">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="h-5 w-5 text-violet-600" />
                <h3 className="font-semibold text-foreground">ENEMAT</h3>
                <Badge className={
                  client.statut_enemat === 'a_deposer_enemat' ? 'bg-amber-100 text-amber-800' :
                  client.statut_enemat === 'depose_enemat' ? 'bg-blue-100 text-blue-800' :
                  client.statut_enemat === 'apf_enemat' ? 'bg-indigo-100 text-indigo-800' :
                  client.statut_enemat === 'paye_enemat' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-600'
                }>
                  {client.statut_enemat === 'a_deposer_enemat' ? 'A deposer' :
                   client.statut_enemat === 'depose_enemat' ? 'Depose' :
                   client.statut_enemat === 'apf_enemat' ? 'APF' :
                   client.statut_enemat === 'paye_enemat' ? 'Paye' :
                   client.statut_enemat || '-'}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                {client.date_entree_enemat && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Entree ENEMAT</span>
                    <span className="font-medium">{new Date(client.date_entree_enemat).toLocaleDateString('fr-FR')}</span>
                  </div>
                )}
                {client.date_depot_enemat && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Depot</span>
                    <span className="font-medium">{new Date(client.date_depot_enemat).toLocaleDateString('fr-FR')}</span>
                  </div>
                )}
                {client.date_apf_enemat && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">APF</span>
                    <span className="font-medium">{new Date(client.date_apf_enemat).toLocaleDateString('fr-FR')}</span>
                  </div>
                )}
                {client.date_paye_enemat && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Paye</span>
                    <span className="font-medium">{new Date(client.date_paye_enemat).toLocaleDateString('fr-FR')}</span>
                  </div>
                )}
              </div>
              {/* Historique ENEMAT */}
              {enematHistory.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Historique des changements</p>
                  <div className="space-y-1">
                    {enematHistory.map((h: any) => (
                      <div key={h.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(h.changed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-foreground font-medium">
                          {h.statut_avant || '(nouveau)'} &rarr; {h.statut_apres}
                        </span>
                        {h.changed_by_name && (
                          <span>par {h.changed_by_name}</span>
                        )}
                        {h.notes && <span className="italic">{h.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog double confirmation Client HS */}
      <AlertDialog open={hsConfirmOpen} onOpenChange={setHsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le passage en HS</AlertDialogTitle>
            <AlertDialogDescription>
              Le client <strong>{client?.raison_sociale}</strong> sera marqué comme HS (annulé).<br />
              Raison : &quot;{hsComment}&quot;<br /><br />
              Cette action est enregistrée avec votre nom et la date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hsLoading} onClick={() => { setHsConfirmOpen(false); setHsDialogOpen(true) }}>Retour</AlertDialogCancel>
            <AlertDialogAction
              disabled={hsLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleClientHS}
            >
              {hsLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Oui, passer en HS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation suppression document */}
      <AlertDialog open={!!docToDelete} onOpenChange={(open) => { if (!open) setDocToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {docToDelete?.label} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le document sera définitivement supprimé de la fiche client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={docDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={docDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteDocument}
            >
              {docDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
