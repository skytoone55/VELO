'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Loader2, Search, Filter, Building2, MapPin, Send, Mail, ExternalLink, Copy, Check, RefreshCw, Plus, Pencil, Trash2, MoreHorizontal, Navigation, Eye, Phone } from 'lucide-react'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Client } from '@/lib/types/database'
import { toast } from 'sonner'

const statutOptions = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'formulaire_envoye', label: 'Formulaire envoyé' },
  { value: 'formulaire_complete', label: 'Formulaire complété' },
  { value: 'valide', label: 'Validé' },
]

const agenceOptions = [
  { value: 'all', label: 'Toutes les agences' },
  { value: 'reunion', label: 'La Réunion' },
  { value: 'martinique', label: 'Martinique' },
  { value: 'guadeloupe', label: 'Guadeloupe' },
  { value: 'guyane', label: 'Guyane' },
  { value: 'france_metro', label: 'France Métropolitaine' },
]

const agenceLabels: Record<string, string> = {
  reunion: 'La Réunion',
  martinique: 'Martinique',
  guadeloupe: 'Guadeloupe',
  guyane: 'Guyane',
  france_metro: 'France Métro',
}

const statutColors: Record<string, string> = {
  en_attente: 'bg-gray-100 text-gray-800',
  formulaire_envoye: 'bg-yellow-100 text-yellow-800',
  formulaire_complete: 'bg-blue-100 text-blue-800',
  valide: 'bg-green-100 text-green-800',
}

const statutLabels: Record<string, string> = {
  en_attente: 'En attente',
  formulaire_envoye: 'Formulaire envoyé',
  formulaire_complete: 'Formulaire complété',
  valide: 'Validé',
}

// Déterminer l'agence à partir du code postal
function getAgenceFromCodePostal(codePostal: string): string {
  const prefix = codePostal.substring(0, 3)
  switch (prefix) {
    case '974': return 'reunion'
    case '972': return 'martinique'
    case '971': return 'guadeloupe'
    case '973': return 'guyane'
    default: return 'france_metro'
  }
}

export default function AdminClientsPage() {
  const user = useAdminUser()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [agenceFilter, setAgenceFilter] = useState('all')

  // Dialog states
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)

  // New client dialog
  const [showNewClientDialog, setShowNewClientDialog] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClient, setNewClient] = useState({
    raison_sociale: '',
    siret: '',
    email: '',
    telephone: '',
    contact_nom: '',
    contact_prenom: '',
    adresse_societe_ligne1: '',
    adresse_societe_cp: '',
    adresse_societe_ville: '',
    departement: user.territoire || '974',
    agence: getAgenceFromCodePostal(user.territoire || '974'),
    velo_devis: 1,
  })

  // Edit client dialog
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [savingClient, setSavingClient] = useState(false)

  // Delete client dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null)
  const [deletingClient, setDeletingClient] = useState(false)

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/admin/clients')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors du chargement')
      }

      setClients(result.clients || [])
    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error('Erreur lors du chargement des clients')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClients()
  }, [])

  const handleSendForm = async (client: Client) => {
    setSendingEmail(true)

    try {
      const response = await fetch('/api/clients/send-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de l\'envoi')
      }

      toast.success(`Email envoyé à ${client.email}`)

      // Rafraîchir la liste
      await fetchClients()

      // Afficher le lien généré
      setGeneratedLink(result.formulaireUrl)
      setShowLinkDialog(true)

    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors de l\'envoi de l\'email')
    } finally {
      setSendingEmail(false)
      setSelectedClient(null)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    toast.success('Lien copié !')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCreateClient = async () => {
    setCreatingClient(true)

    try {
      const response = await fetch('/api/admin/clients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la création')
      }

      toast.success('Client créé avec succès')
      setShowNewClientDialog(false)
      setNewClient({
        raison_sociale: '',
        siret: '',
        email: '',
        telephone: '',
        contact_nom: '',
        contact_prenom: '',
        adresse_societe_ligne1: '',
        adresse_societe_cp: '',
        adresse_societe_ville: '',
        departement: user.territoire || '974',
        agence: getAgenceFromCodePostal(user.territoire || '974'),
        velo_devis: 1,
      })
      fetchClients()
    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors de la création du client')
    } finally {
      setCreatingClient(false)
    }
  }

  const handleEditClient = (client: Client) => {
    setEditingClient({ ...client })
    setShowEditDialog(true)
  }

  const handleSaveClient = async () => {
    if (!editingClient) return
    setSavingClient(true)

    try {
      const response = await fetch(`/api/admin/clients/${editingClient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingClient),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la modification')
      }

      toast.success('Client modifié avec succès')
      setShowEditDialog(false)
      setEditingClient(null)
      fetchClients()
    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors de la modification')
    } finally {
      setSavingClient(false)
    }
  }

  const handleDeleteClient = async () => {
    if (!clientToDelete) return
    setDeletingClient(true)

    try {
      const response = await fetch(`/api/admin/clients/${clientToDelete.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la suppression')
      }

      toast.success('Client supprimé')
      setShowDeleteDialog(false)
      setClientToDelete(null)
      fetchClients()
    } catch (error: any) {
      console.error('Erreur:', error)
      toast.error(error.message || 'Erreur lors de la suppression')
    } finally {
      setDeletingClient(false)
    }
  }

  const filteredClients = clients.filter(client => {
    const matchesSearch =
      !searchQuery ||
      client.raison_sociale?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.siret?.includes(searchQuery) ||
      client.email?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatut =
      statutFilter === 'all' || client.statut_formulaire === statutFilter

    const matchesDepartement =
      agenceFilter === 'all' || client.agence === agenceFilter

    return matchesSearch && matchesStatut && matchesDepartement
  })

  // Stats
  const stats = {
    total: clients.length,
    enAttente: clients.filter(c => c.statut_formulaire === 'en_attente').length,
    envoyes: clients.filter(c => c.statut_formulaire === 'formulaire_envoye').length,
    completes: clients.filter(c => c.statut_formulaire === 'formulaire_complete').length,
    valides: clients.filter(c => c.statut_formulaire === 'valide').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground">
            Gérez les dossiers clients et envoyez les formulaires
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchClients}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
          <Button onClick={() => setShowNewClientDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau client
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total clients</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-gray-600">{stats.enAttente}</div>
            <div className="text-sm text-muted-foreground">En attente</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.envoyes}</div>
            <div className="text-sm text-muted-foreground">Form. envoyés</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-blue-600">{stats.completes}</div>
            <div className="text-sm text-muted-foreground">Complétés</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-600">{stats.valides}</div>
            <div className="text-sm text-muted-foreground">Validés</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, SIRET ou email..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="w-full lg:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                {statutOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {user?.role === 'admin_general' && (
              <Select value={agenceFilter} onValueChange={setAgenceFilter}>
                <SelectTrigger className="w-full lg:w-56">
                  <MapPin className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Département" />
                </SelectTrigger>
                <SelectContent>
                  {agenceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucun client</h3>
              <p className="text-muted-foreground text-sm">
                {searchQuery || statutFilter !== 'all' || agenceFilter !== 'all'
                  ? 'Aucun client ne correspond à vos critères'
                  : 'Les clients apparaîtront ici après synchronisation avec Monday'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Société</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Agence</TableHead>
                  <TableHead>Vélos</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{client.raison_sociale}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {client.siret}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{client.contact_prenom} {client.contact_nom}</div>
                        <div className="text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {client.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.telephone ? (
                        <div className="text-sm flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {client.telephone}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {client.agence}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">{client.velo_valide || 0}</span>
                        <span className="text-muted-foreground"> / {client.velo_devis}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statutColors[client.statut_formulaire || 'en_attente']}>
                        {statutLabels[client.statut_formulaire || 'en_attente']}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {client.statut_formulaire === 'en_attente' && (
                          <Button
                            size="sm"
                            onClick={() => setSelectedClient(client)}
                            disabled={sendingEmail}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Envoyer formulaire
                          </Button>
                        )}
                        {client.statut_formulaire === 'formulaire_envoye' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedClient(client)}
                            disabled={sendingEmail}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Renvoyer
                          </Button>
                        )}
                        {client.token_formulaire && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const url = `${window.location.origin}/formulaire?token=${client.token_formulaire}`
                              setGeneratedLink(url)
                              setShowLinkDialog(true)
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Icônes d'accès rapide */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.location.href = `/admin/clients/${client.id}`}
                          title="Voir la fiche"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClient(client)}
                          title="Modifier"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => window.location.href = `/admin/clients/${client.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              Voir la fiche
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditClient(client)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            {user.role === 'admin_general' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setClientToDelete(client)
                                    setShowDeleteDialog(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Supprimer
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedClient && !showLinkDialog} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Envoyer le formulaire</DialogTitle>
            <DialogDescription>
              Un email avec le lien du formulaire sera envoyé à :
            </DialogDescription>
          </DialogHeader>

          {selectedClient && (
            <div className="py-4">
              <div className="font-medium">{selectedClient.raison_sociale}</div>
              <div className="text-sm text-muted-foreground">
                {selectedClient.contact_prenom} {selectedClient.contact_nom}
              </div>
              <div className="text-sm text-primary">{selectedClient.email}</div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedClient(null)}>
              Annuler
            </Button>
            <Button
              onClick={() => selectedClient && handleSendForm(selectedClient)}
              disabled={sendingEmail}
            >
              {sendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Envoyer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien du formulaire</DialogTitle>
            <DialogDescription>
              Vous pouvez aussi copier ce lien et l&apos;envoyer manuellement au client.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex gap-2">
              <Input
                value={generatedLink}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowLinkDialog(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Client Dialog */}
      <Dialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Nouveau client</DialogTitle>
            <DialogDescription>
              Créez un nouveau dossier client pour lui envoyer le formulaire.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="raison_sociale">Raison sociale *</Label>
                <Input
                  id="raison_sociale"
                  value={newClient.raison_sociale}
                  onChange={(e) => setNewClient({ ...newClient, raison_sociale: e.target.value })}
                  placeholder="Nom de l'entreprise"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="siret">SIRET *</Label>
                <Input
                  id="siret"
                  value={newClient.siret}
                  onChange={(e) => setNewClient({ ...newClient, siret: e.target.value })}
                  placeholder="12345678901234"
                  maxLength={14}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  placeholder="contact@entreprise.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telephone">Téléphone</Label>
                <Input
                  id="telephone"
                  value={newClient.telephone}
                  onChange={(e) => setNewClient({ ...newClient, telephone: e.target.value })}
                  placeholder="0690123456"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_prenom">Prénom du contact</Label>
                <Input
                  id="contact_prenom"
                  value={newClient.contact_prenom}
                  onChange={(e) => setNewClient({ ...newClient, contact_prenom: e.target.value })}
                  placeholder="Jean"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_nom">Nom du contact</Label>
                <Input
                  id="contact_nom"
                  value={newClient.contact_nom}
                  onChange={(e) => setNewClient({ ...newClient, contact_nom: e.target.value })}
                  placeholder="Dupont"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adresse">Adresse</Label>
              <AddressAutocomplete
                value={newClient.adresse_societe_ligne1}
                onChange={(value) => setNewClient({ ...newClient, adresse_societe_ligne1: value })}
                onSelect={(address) => {
                  const agence = getAgenceFromCodePostal(address.codePostal)
                  setNewClient({
                    ...newClient,
                    adresse_societe_ligne1: address.ligne1,
                    adresse_societe_cp: address.codePostal,
                    adresse_societe_ville: address.ville,
                    agence: agence,
                  })
                }}
                placeholder="Commencez à taper l'adresse..."
              />
              {newClient.adresse_societe_ligne1 && newClient.adresse_societe_cp && newClient.adresse_societe_ville && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Navigation className="h-4 w-4" />
                  Adresse remplie automatiquement
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cp">Code postal</Label>
                <Input
                  id="cp"
                  value={newClient.adresse_societe_cp}
                  onChange={(e) => setNewClient({ ...newClient, adresse_societe_cp: e.target.value })}
                  placeholder="97400"
                  maxLength={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ville">Ville</Label>
                <Input
                  id="ville"
                  value={newClient.adresse_societe_ville}
                  onChange={(e) => setNewClient({ ...newClient, adresse_societe_ville: e.target.value })}
                  placeholder="Saint-Denis"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agence">Agence *</Label>
                <Select
                  value={newClient.agence}
                  onValueChange={(value) => setNewClient({ ...newClient, agence: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reunion">La Réunion</SelectItem>
                    <SelectItem value="martinique">Martinique</SelectItem>
                    <SelectItem value="guadeloupe">Guadeloupe</SelectItem>
                    <SelectItem value="guyane">Guyane</SelectItem>
                    <SelectItem value="france_metro">France Métro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="velo_devis">Nb vélos *</Label>
                <Input
                  id="velo_devis"
                  type="number"
                  min={1}
                  value={newClient.velo_devis === 0 ? '' : newClient.velo_devis}
                  onChange={(e) => {
                    const val = e.target.value
                    setNewClient({ ...newClient, velo_devis: val === '' ? 0 : parseInt(val) || 0 })
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      setNewClient({ ...newClient, velo_devis: 1 })
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClientDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={creatingClient || !newClient.raison_sociale || !newClient.siret || !newClient.email}
            >
              {creatingClient ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer le client
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Modifier le client</DialogTitle>
            <DialogDescription>
              Modifiez les informations du client.
            </DialogDescription>
          </DialogHeader>

          {editingClient && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_raison_sociale">Raison sociale *</Label>
                  <Input
                    id="edit_raison_sociale"
                    value={editingClient.raison_sociale || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, raison_sociale: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_siret">SIRET *</Label>
                  <Input
                    id="edit_siret"
                    value={editingClient.siret || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, siret: e.target.value })}
                    maxLength={14}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email *</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editingClient.email || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_telephone">Téléphone</Label>
                  <Input
                    id="edit_telephone"
                    value={editingClient.telephone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, telephone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_contact_prenom">Prénom du contact</Label>
                  <Input
                    id="edit_contact_prenom"
                    value={editingClient.contact_prenom || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, contact_prenom: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_contact_nom">Nom du contact</Label>
                  <Input
                    id="edit_contact_nom"
                    value={editingClient.contact_nom || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, contact_nom: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_adresse">Adresse</Label>
                <AddressAutocomplete
                  value={editingClient.adresse_societe_ligne1 || ''}
                  onChange={(value) => setEditingClient({ ...editingClient, adresse_societe_ligne1: value })}
                  onSelect={(address) => {
                    const agence = getAgenceFromCodePostal(address.codePostal)
                    setEditingClient({
                      ...editingClient,
                      adresse_societe_ligne1: address.ligne1,
                      adresse_societe_cp: address.codePostal,
                      adresse_societe_ville: address.ville,
                      agence: agence,
                    })
                  }}
                  placeholder="Commencez à taper l'adresse..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_cp">Code postal</Label>
                  <Input
                    id="edit_cp"
                    value={editingClient.adresse_societe_cp || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, adresse_societe_cp: e.target.value })}
                    maxLength={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_ville">Ville</Label>
                  <Input
                    id="edit_ville"
                    value={editingClient.adresse_societe_ville || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, adresse_societe_ville: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_agence">Agence *</Label>
                  <Select
                    value={editingClient.agence || ''}
                    onValueChange={(value) => setEditingClient({ ...editingClient, agence: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reunion">La Réunion</SelectItem>
                      <SelectItem value="martinique">Martinique</SelectItem>
                      <SelectItem value="guadeloupe">Guadeloupe</SelectItem>
                      <SelectItem value="guyane">Guyane</SelectItem>
                      <SelectItem value="france_metro">France Métro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_velo_devis">Nb vélos *</Label>
                  <Input
                    id="edit_velo_devis"
                    type="number"
                    min={1}
                    value={editingClient.velo_devis === 0 ? '' : (editingClient.velo_devis || '')}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditingClient({ ...editingClient, velo_devis: val === '' ? 0 : parseInt(val) || 0 })
                    }}
                    onBlur={(e) => {
                      if (!e.target.value || parseInt(e.target.value) < 1) {
                        setEditingClient({ ...editingClient, velo_devis: 1 })
                      }
                    }}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit_statut">Statut</Label>
                  <Select
                    value={editingClient.statut_formulaire || 'en_attente'}
                    onValueChange={(value) => setEditingClient({ ...editingClient, statut_formulaire: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en_attente">En attente</SelectItem>
                      <SelectItem value="formulaire_envoye">Formulaire envoyé</SelectItem>
                      <SelectItem value="formulaire_complete">Formulaire complété</SelectItem>
                      <SelectItem value="valide">Validé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveClient}
              disabled={savingClient || !editingClient?.raison_sociale || !editingClient?.siret || !editingClient?.email}
            >
              {savingClient ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le client &quot;{clientToDelete?.raison_sociale}&quot; sera définitivement supprimé ainsi que toutes ses données associées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              disabled={deletingClient}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingClient ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
