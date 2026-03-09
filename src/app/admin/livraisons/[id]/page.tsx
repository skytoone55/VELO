'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAdminUser, AdminUser } from '@/components/admin/admin-user-provider'
import { UserRole } from '@/lib/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  MapPin,
  Truck,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  User,
  Clock,
  Edit,
  Package,
} from 'lucide-react'
import { Livraison, Client, Depot, UsersProfile } from '@/lib/types/database'

interface LivraisonDetail extends Livraison {
  client: Client | null
  depot: Depot | null
}

const statutColors: Record<string, string> = {
  en_attente: 'bg-yellow-100 text-yellow-800',
  en_livraison: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-purple-100 text-purple-800',
  livree: 'bg-green-100 text-green-800',
  annulee: 'bg-red-100 text-red-800',
}

const statutLabels: Record<string, string> = {
  en_attente: 'En attente',
  en_livraison: 'En livraison',
  en_cours: 'En cours',
  livree: 'Livree',
  annulee: 'Annulee',
}

export default function LivraisonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const user = useAdminUser()
  const [livraison, setLivraison] = useState<LivraisonDetail | null>(null)
  const [livreurs, setLivreurs] = useState<UsersProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Dialogs
  const [programmerOpen, setProgrammerOpen] = useState(false)
  const [dateProgrammation, setDateProgrammation] = useState('')
  const [creneauDebut, setCreneauDebut] = useState('')
  const [creneauFin, setCreneauFin] = useState('')
  const [selectedLivreur, setSelectedLivreur] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const fetchLivraison = async () => {
      const supabase = createClient()

      const { data: livraisonData, error: livraisonError } = await supabase
        .from('livraisons')
        .select(`
          *,
          client:clients(*),
          depot:depots(*)
        `)
        .eq('id', resolvedParams.id)
        .single()

      if (livraisonError) {
        setError('Livraison introuvable')
        setLoading(false)
        return
      }

      setLivraison(livraisonData as LivraisonDetail)

      // Pre-fill dialog fields if already programmed
      if (livraisonData.date_programmation) {
        setDateProgrammation(livraisonData.date_programmation.split('T')[0])
      }
      if (livraisonData.creneau_debut) {
        setCreneauDebut(livraisonData.creneau_debut)
      }
      if (livraisonData.creneau_fin) {
        setCreneauFin(livraisonData.creneau_fin)
      }
      if (livraisonData.livreur_id) {
        setSelectedLivreur(livraisonData.livreur_id)
      }
      if (livraisonData.notes_internes) {
        setNotes(livraisonData.notes_internes)
      }

      // Charger les livreurs disponibles
      const { data: livreursData } = await supabase
        .from('users_profile')
        .select('*')
        .eq('role', 'livreur')
        .eq('actif', true)

      setLivreurs(livreursData || [])
      setLoading(false)
    }

    fetchLivraison()
  }, [resolvedParams.id])

  const handleProgrammer = async () => {
    if (!livraison || !dateProgrammation) {
      setError('Veuillez saisir une date de programmation')
      return
    }

    setActionLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const updateData: Record<string, any> = {
        statut: 'en_livraison',
        date_programmation: dateProgrammation,
        creneau_debut: creneauDebut || null,
        creneau_fin: creneauFin || null,
        livreur_id: selectedLivreur || null,
        notes_internes: notes || null,
        updated_at: new Date().toISOString(),
      }

      const { error: updateError } = await supabase
        .from('livraisons')
        .update(updateData)
        .eq('id', livraison.id)

      if (updateError) throw updateError

      // Logger la transition
      await supabase.from('workflow_transitions').insert({
        entity_type: 'livraison',
        entity_id: livraison.id,
        statut_avant: livraison.statut,
        statut_apres: 'en_livraison',
        effectue_par: user?.id,
        raison: `Programmation pour le ${dateProgrammation}`,
      })

      setSuccess('Livraison planifiée avec succès')
      setLivraison({
        ...livraison,
        statut: 'en_livraison',
        date_programmation: dateProgrammation,
        creneau_debut: creneauDebut,
        creneau_fin: creneauFin,
        livreur_id: selectedLivreur,
        notes_internes: notes,
      })
      setProgrammerOpen(false)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la programmation')
    } finally {
      setActionLoading(false)
    }
  }

  const handleChangeStatut = async (newStatut: string) => {
    if (!livraison) return

    setActionLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const updateData: Record<string, any> = {
        statut: newStatut,
        updated_at: new Date().toISOString(),
      }

      // Si livree, ajouter date_livraison
      if (newStatut === 'livree') {
        updateData.date_livraison = new Date().toISOString()

        // Incrementer le nombre de velos valides pour le client
        if (livraison.client_id) {
          const { data: client } = await supabase
            .from('clients')
            .select('velo_valide')
            .eq('id', livraison.client_id)
            .single()

          if (client) {
            await supabase
              .from('clients')
              .update({ velo_valide: (client.velo_valide || 0) + 1 })
              .eq('id', livraison.client_id)
          }
        }
      }

      const { error: updateError } = await supabase
        .from('livraisons')
        .update(updateData)
        .eq('id', livraison.id)

      if (updateError) throw updateError

      await supabase.from('workflow_transitions').insert({
        entity_type: 'livraison',
        entity_id: livraison.id,
        statut_avant: livraison.statut,
        statut_apres: newStatut,
        effectue_par: user?.id,
        raison: `Changement de statut vers ${newStatut}`,
      })

      setSuccess(`Statut mis a jour: ${statutLabels[newStatut]}`)
      setLivraison({ ...livraison, statut: newStatut })
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la mise a jour')
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

  if (!livraison) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
        <h2 className="text-xl font-bold mb-2">Livraison introuvable</h2>
        <Button onClick={() => router.push('/admin/livraisons')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour a la liste
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" onClick={() => router.push('/admin/livraisons')} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <h1 className="text-2xl font-bold">
            Livraison #{livraison.id.slice(0, 8)}
          </h1>
          <p className="text-muted-foreground">
            {livraison.client?.raison_sociale || 'Client inconnu'}
          </p>
        </div>
        <Badge className={`${statutColors[livraison.statut || 'en_attente']} text-sm px-3 py-1`}>
          {statutLabels[livraison.statut || 'en_attente']}
        </Badge>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {livraison.statut === 'en_attente' && (
            <Dialog open={programmerOpen} onOpenChange={setProgrammerOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Calendar className="mr-2 h-4 w-4" />
                  Programmer la livraison
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Programmer la livraison</DialogTitle>
                  <DialogDescription>
                    Definissez la date, le creneau et le livreur assigne.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date de livraison *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={dateProgrammation}
                      onChange={(e) => setDateProgrammation(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="debut">Heure debut</Label>
                      <Input
                        id="debut"
                        type="time"
                        value={creneauDebut}
                        onChange={(e) => setCreneauDebut(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fin">Heure fin</Label>
                      <Input
                        id="fin"
                        type="time"
                        value={creneauFin}
                        onChange={(e) => setCreneauFin(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Livreur assigne</Label>
                    <Select value={selectedLivreur} onValueChange={setSelectedLivreur}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectionner un livreur..." />
                      </SelectTrigger>
                      <SelectContent>
                        {livreurs.map((livreur) => (
                          <SelectItem key={livreur.id} value={livreur.id}>
                            {livreur.prenom} {livreur.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes internes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Instructions speciales..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setProgrammerOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleProgrammer} disabled={actionLoading || !dateProgrammation}>
                    {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Programmer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {livraison.statut === 'en_livraison' && (
            <>
              <Button onClick={() => handleChangeStatut('en_cours')} disabled={actionLoading}>
                <Truck className="mr-2 h-4 w-4" />
                Demarrer la livraison
              </Button>
              <Button variant="outline" onClick={() => setProgrammerOpen(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Modifier
              </Button>
            </>
          )}

          {livraison.statut === 'en_cours' && (
            <Button
              onClick={() => handleChangeStatut('livree')}
              disabled={actionLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Marquer comme livree
            </Button>
          )}

          {(livraison.statut === 'en_attente' || livraison.statut === 'en_livraison') && (
            <Button
              variant="outline"
              onClick={() => handleChangeStatut('annulee')}
              disabled={actionLoading}
              className="text-destructive border-destructive hover:bg-destructive/10"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Annuler
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Informations client */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {livraison.client ? (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Societe</p>
                  <p className="font-medium">{livraison.client.raison_sociale}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">SIRET</p>
                  <p className="font-mono">{livraison.client.siret}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contact</p>
                  <p>
                    {livraison.client.prenom_contact} {livraison.client.nom_contact}
                  </p>
                  <p className="text-sm text-muted-foreground">{livraison.client.email}</p>
                  <p className="text-sm text-muted-foreground">{livraison.client.telephone}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/admin/clients/${livraison.client?.id}`)}
                >
                  Voir le dossier client
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">Client non trouve</p>
            )}
          </CardContent>
        </Card>

        {/* Adresse de livraison */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {livraison.mode_livraison === 'domicile' ? (
                <Truck className="h-5 w-5" />
              ) : (
                <MapPin className="h-5 w-5" />
              )}
              Livraison
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Mode</p>
              <p className="font-medium">
                {livraison.mode_livraison === 'domicile' ? 'Livraison a domicile' : 'Retrait en point relais'}
              </p>
            </div>
            {livraison.mode_livraison === 'domicile' ? (
              <div>
                <p className="text-sm text-muted-foreground">Adresse</p>
                <p>
                  {livraison.adresse_livraison_ligne1}
                  {livraison.adresse_livraison_ligne2 && (
                    <>
                      <br />
                      {livraison.adresse_livraison_ligne2}
                    </>
                  )}
                  <br />
                  {livraison.adresse_livraison_cp} {livraison.adresse_livraison_ville}
                </p>
              </div>
            ) : livraison.depot ? (
              <div>
                <p className="text-sm text-muted-foreground">Point de retrait</p>
                <p className="font-medium">{livraison.depot.nom}</p>
                <p>
                  {livraison.depot.adresse}
                  <br />
                  {livraison.depot.code_postal} {livraison.depot.ville}
                </p>
                {livraison.depot.telephone && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Tel: {livraison.depot.telephone}
                  </p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Programmation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Programmation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {livraison.date_programmation ? (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {new Date(livraison.date_programmation).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                {(livraison.creneau_debut || livraison.creneau_fin) && (
                  <div>
                    <p className="text-sm text-muted-foreground">Creneau horaire</p>
                    <p>
                      {livraison.creneau_debut || '--:--'} - {livraison.creneau_fin || '--:--'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Non planifiée</p>
            )}
            {livraison.date_livraison && (
              <div>
                <p className="text-sm text-muted-foreground">Date de livraison effective</p>
                <p className="font-medium text-green-600">
                  {new Date(livraison.date_livraison).toLocaleDateString('fr-FR')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document d'identite */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document d'identite
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {livraison.document_identite_type ? (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium capitalize">
                    {livraison.document_identite_type.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fichier</p>
                  <p>{livraison.document_identite_nom_fichier || 'Non specifie'}</p>
                </div>
                {livraison.document_identite_url && livraison.document_identite_url !== 'pending-setup' && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={livraison.document_identite_url} target="_blank" rel="noopener noreferrer">
                      Voir le document
                    </a>
                  </Button>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Aucun document fourni</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes internes */}
      {livraison.notes_internes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes internes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{livraison.notes_internes}</p>
          </CardContent>
        </Card>
      )}

      {/* Historique */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Historique
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Creee le</span>
            <span>{new Date(livraison.created_at).toLocaleDateString('fr-FR')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Derniere modification</span>
            <span>{new Date(livraison.updated_at).toLocaleDateString('fr-FR')}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
