'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Loader2, Search, Filter, Building2, Plus, MapPin, Check, X, AlertCircle, CheckCircle, MoreHorizontal, Pencil, Trash2, Navigation } from 'lucide-react'
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
import { toast } from 'sonner'
import { Depot } from '@/lib/types/database'
import { getTenantId } from '@/lib/tenants'
const typeOptions = [
  { value: 'all', label: 'Tous les types' },
  { value: 'retrait', label: 'Point de retrait' },
  { value: 'logistique', label: 'Dépôt logistique' },
]

function getAgenceOptionsDepots(tid: string) {
  return tid === 'ppe'
    ? [
        { value: 'all', label: 'Toutes les agences' },
        { value: 'france_metro', label: 'France Métropolitaine' },
      ]
    : [
        { value: 'all', label: 'Toutes les agences' },
        { value: 'reunion', label: 'La Réunion' },
        { value: 'martinique', label: 'Martinique' },
        { value: 'guadeloupe', label: 'Guadeloupe' },
        { value: 'guyane', label: 'Guyane' },
        { value: 'france_metro', label: 'France Métropolitaine' },
      ]
}

// Convertir un code département en agence
function getAgenceFromTerritoire(territoire: string): string {
  const prefix = territoire.substring(0, 3)
  switch (prefix) {
    case '974': return 'reunion'
    case '972': return 'martinique'
    case '971': return 'guadeloupe'
    case '973': return 'guyane'
    default: return 'france_metro'
  }
}

const typeColors: Record<string, string> = {
  retrait: 'bg-blue-100 text-blue-800',
  logistique: 'bg-orange-100 text-orange-800',
}

interface DepotForm {
  nom: string
  type: 'retrait' | 'logistique'
  adresse: string
  code_postal: string
  ville: string
  agence: string
  latitude: number
  longitude: number
  rayon_couverture_km: number
  rayon_livraison_payant_km: number
  prix_livraison_payante: number
  telephone: string
  email: string
  actif: boolean
}

function getInitialForm(tid: string): DepotForm {
  return {
    nom: '',
    type: 'retrait',
    adresse: '',
    code_postal: '',
    ville: '',
    agence: tid === 'ppe' ? 'france_metro' : 'reunion',
    latitude: tid === 'ppe' ? 46.603354 : -21.1151,
    longitude: tid === 'ppe' ? 1.888334 : 55.5364,
    rayon_couverture_km: 30,
    rayon_livraison_payant_km: 50,
    prix_livraison_payante: 0,
    telephone: '',
    email: '',
    actif: true,
  }
}

export default function AdminDepotsPage() {
  const tenantId = getTenantId()
  const agenceOptions = useMemo(() => getAgenceOptionsDepots(tenantId), [tenantId])
  const initialForm = useMemo(() => getInitialForm(tenantId), [tenantId])

  const user = useAdminUser()
  const [depots, setDepots] = useState<Depot[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [agenceFilter, setAgenceFilter] = useState('all')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDepot, setEditingDepot] = useState<Depot | null>(null)
  const [form, setForm] = useState<DepotForm>(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Pre-fill depuis URL (depuis simulation carte)
  const searchParams = useSearchParams()
  const prefillDone = useRef(false)
  useEffect(() => {
    if (prefillDone.current) return
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const rayon = searchParams.get('rayon')
    if (lat && lng) {
      prefillDone.current = true
      setForm(prev => ({
        ...prev,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        rayon_couverture_km: rayon ? parseInt(rayon) : prev.rayon_couverture_km,
        type: 'logistique',
      }))
      setDialogOpen(true)
    }
  }, [searchParams])

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [depotToDelete, setDepotToDelete] = useState<Depot | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const fetchDepots = async () => {
      const supabase = createClient()

      let query = supabase
        .from('depots')
        .select('*')
        .order('nom', { ascending: true })

      // Filtrer par agence pour admin régional
      if (user?.role === 'admin_regional' && user.territoire) {
        const agence = getAgenceFromTerritoire(user.territoire)
        query = query.eq('agence', agence)
      }

      const { data, error } = await query

      if (error) {
        console.error('Erreur:', error)
        setLoading(false)
        return
      }

      setDepots(data || [])
      setLoading(false)
    }

    fetchDepots()
  }, [])

  const filteredDepots = depots.filter(depot => {
    const matchesSearch =
      !searchQuery ||
      depot.nom?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      depot.ville?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      depot.adresse?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesType = typeFilter === 'all' || depot.type === typeFilter

    const matchesAgence =
      agenceFilter === 'all' || depot.agence === agenceFilter

    return matchesSearch && matchesType && matchesAgence
  })

  const openCreateDialog = () => {
    setEditingDepot(null)
    setForm(initialForm)
    setError(null)
    setDialogOpen(true)
  }

  const openEditDialog = (depot: Depot) => {
    setEditingDepot(depot)
    setForm({
      nom: depot.nom,
      type: depot.type as 'retrait' | 'logistique',
      adresse: depot.adresse,
      code_postal: depot.code_postal,
      ville: depot.ville,
      agence: depot.agence,
      latitude: depot.latitude,
      longitude: depot.longitude,
      rayon_couverture_km: depot.rayon_couverture_km,
      rayon_livraison_payant_km: depot.rayon_livraison_payant_km || 50,
      prix_livraison_payante: depot.prix_livraison_payante || 0,
      telephone: depot.telephone || '',
      email: depot.email || '',
      actif: depot.actif ?? true,
    })
    setError(null)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.nom || !form.adresse || !form.code_postal || !form.ville) {
      setError('Veuillez remplir tous les champs obligatoires')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()

      const depotData = {
        nom: form.nom,
        type: form.type,
        adresse: form.adresse,
        code_postal: form.code_postal,
        ville: form.ville,
        agence: form.agence,
        latitude: form.latitude,
        longitude: form.longitude,
        rayon_couverture_km: form.rayon_couverture_km,
        rayon_livraison_payant_km: form.rayon_livraison_payant_km,
        prix_livraison_payante: form.prix_livraison_payante,
        telephone: form.telephone || null,
        email: form.email || null,
        actif: form.actif,
        updated_at: new Date().toISOString(),
      }

      if (editingDepot) {
        const { error: updateError } = await supabase
          .from('depots')
          .update(depotData)
          .eq('id', editingDepot.id)

        if (updateError) throw updateError

        setDepots(depots.map(d => d.id === editingDepot.id ? { ...d, ...depotData } : d))
        setSuccess('Depot mis a jour avec succes')

        // Lancer la réassignation des clients (force=true car le dépôt a changé)
        try {
          const reassignResponse = await fetch('/api/admin/depots/reassign-clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true }),
          })
          const reassignData = await reassignResponse.json()
          if (reassignData.reassigned > 0) {
            setSuccess(`Depot mis a jour. ${reassignData.reassigned} client(s) réassigné(s), ${reassignData.horsZone || 0} hors zone.`)
          }
        } catch (reassignErr) {
          console.error('Erreur réassignation:', reassignErr)
        }
      } else {
        const { data: newDepot, error: insertError } = await supabase
          .from('depots')
          .insert(depotData)
          .select()
          .single()

        if (insertError) throw insertError

        setDepots([...depots, newDepot])
        setSuccess('Depot cree avec succes')

        // Lancer la réassignation des clients (le nouveau dépôt peut absorber des clients)
        try {
          const reassignResponse = await fetch('/api/admin/depots/reassign-clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true }),
          })
          const reassignData = await reassignResponse.json()
          if (reassignData.reassigned > 0) {
            setSuccess(`Depot cree. ${reassignData.reassigned} client(s) assigné(s), ${reassignData.horsZone || 0} hors zone.`)
          }
        } catch (reassignErr) {
          console.error('Erreur réassignation:', reassignErr)
        }
      }

      setDialogOpen(false)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const toggleActif = async (depot: Depot) => {
    const supabase = createClient()
    const newActif = !depot.actif

    const { error: updateError } = await supabase
      .from('depots')
      .update({ actif: newActif })
      .eq('id', depot.id)

    if (!updateError) {
      setDepots(depots.map(d => d.id === depot.id ? { ...d, actif: newActif } : d))

      // Réassigner les clients (le changement d'état affecte la couverture)
      try {
        await fetch('/api/admin/depots/reassign-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true }),
        })
      } catch (reassignErr) {
        console.error('Erreur réassignation après toggle:', reassignErr)
      }
    }
  }

  const handleDeleteDepot = async () => {
    if (!depotToDelete) return
    setDeleting(true)

    try {
      const supabase = createClient()

      // Vérifier si le dépôt est utilisé par des livraisons
      const { data: livraisons } = await supabase
        .from('livraisons')
        .select('id')
        .eq('depot_id', depotToDelete.id)
        .limit(1)

      if (livraisons && livraisons.length > 0) {
        toast.error('Ce dépôt est lié à des livraisons et ne peut pas être supprimé. Désactivez-le plutôt.')
        setShowDeleteDialog(false)
        setDepotToDelete(null)
        return
      }

      const { error: deleteError } = await supabase
        .from('depots')
        .delete()
        .eq('id', depotToDelete.id)

      if (deleteError) throw deleteError

      setDepots(depots.filter(d => d.id !== depotToDelete.id))
      toast.success('Dépôt supprimé avec succès')
      setShowDeleteDialog(false)
      setDepotToDelete(null)

      // Réassigner les clients qui étaient sur ce dépôt
      try {
        const reassignResponse = await fetch('/api/admin/depots/reassign-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true }),
        })
        const reassignData = await reassignResponse.json()
        if (reassignData.reassigned > 0) {
          toast.success(`${reassignData.reassigned} client(s) réassigné(s) à un autre dépôt`)
        }
      } catch (reassignErr) {
        console.error('Erreur réassignation après suppression:', reassignErr)
      }
    } catch (err: any) {
      console.error('Erreur suppression:', err)
      toast.error(err.message || 'Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
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
          <h1 className="text-2xl font-bold">Dépôts</h1>
          <p className="text-muted-foreground">
            Gérez les points de retrait et dépôts logistiques
          </p>
        </div>
        {user?.role === 'admin_general' && (
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau depot
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, ville ou adresse..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full lg:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((option) => (
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
          {filteredDepots.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucun dépôt</h3>
              <p className="text-muted-foreground text-sm">
                {searchQuery || typeFilter !== 'all' || agenceFilter !== 'all'
                  ? 'Aucun dépôt ne correspond à vos critères'
                  : 'Les dépôts apparaîtront ici'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Adresse</TableHead>
                  <TableHead>Département</TableHead>
                  <TableHead className="text-center">Zone gratuite (km)</TableHead>
                  <TableHead className="text-center">Zone payante (km)</TableHead>
                  <TableHead className="text-center">Prix livraison (€)</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDepots.map((depot) => (
                  <TableRow key={depot.id}>
                    <TableCell>
                      <div className="font-medium">{depot.nom}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={typeColors[depot.type]}>
                        {depot.type === 'retrait' ? 'Point de retrait' : 'Logistique'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {depot.adresse}
                        <div className="text-muted-foreground">
                          {depot.code_postal} {depot.ville}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{depot.agence}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {depot.rayon_couverture_km} km
                    </TableCell>
                    <TableCell className="text-center">
                      {depot.rayon_livraison_payant_km || '-'} km
                    </TableCell>
                    <TableCell className="text-center">
                      {depot.prix_livraison_payante ? `${depot.prix_livraison_payante} €` : '-'}
                    </TableCell>
                    <TableCell>
                      {depot.actif ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(depot)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          {user?.role === 'admin_general' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setDepotToDelete(depot)
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Success message */}
      {success && (
        <Alert className="fixed bottom-4 right-4 w-auto bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[690px]">
          <DialogHeader>
            <DialogTitle>
              {editingDepot ? 'Modifier le depot' : 'Nouveau depot'}
            </DialogTitle>
            <DialogDescription>
              {editingDepot
                ? 'Modifiez les informations du depot'
                : 'Creez un nouveau point de retrait ou depot logistique'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nom">Nom du depot *</Label>
                <Input
                  id="nom"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  placeholder="Ex: Depot Saint-Denis"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm({ ...form, type: value as 'retrait' | 'logistique' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retrait">Point de retrait (visible clients)</SelectItem>
                    <SelectItem value="logistique">Depot logistique (interne)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adresse">Adresse *</Label>
              <AddressAutocomplete
                value={form.adresse}
                onChange={(value) => setForm({ ...form, adresse: value })}
                onSelect={(address) => {
                  setForm({
                    ...form,
                    adresse: address.ligne1,
                    code_postal: address.codePostal,
                    ville: address.ville,
                    latitude: address.latitude,
                    longitude: address.longitude,
                  })
                }}
                placeholder="Commencez a taper l'adresse..."
              />
              {form.latitude !== 0 && form.longitude !== 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Navigation className="h-4 w-4" />
                  Coordonnees detectees automatiquement
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cp">Code postal *</Label>
                <Input
                  id="cp"
                  value={form.code_postal}
                  onChange={(e) => setForm({ ...form, code_postal: e.target.value })}
                  placeholder="97400"
                  maxLength={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ville">Ville *</Label>
                <Input
                  id="ville"
                  value={form.ville}
                  onChange={(e) => setForm({ ...form, ville: e.target.value })}
                  placeholder="Saint-Denis"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agence">Agence *</Label>
                <Select
                  value={form.agence}
                  onValueChange={(value) => setForm({ ...form, agence: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une agence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reunion">La Réunion</SelectItem>
                    <SelectItem value="martinique">Martinique</SelectItem>
                    <SelectItem value="guadeloupe">Guadeloupe</SelectItem>
                    <SelectItem value="guyane">Guyane</SelectItem>
                    <SelectItem value="france_metro">France Métropolitaine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude (auto)</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="0.0001"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: parseFloat(e.target.value) || 0 })}
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude (auto)</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="0.0001"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: parseFloat(e.target.value) || 0 })}
                  className="bg-muted/50"
                />
              </div>
            </div>

            {/* Périmètres de livraison */}
            <div className="border-t pt-4 mt-2">
              <Label className="text-sm font-medium mb-3 block">Zones de couverture</Label>
              {form.type === 'retrait' ? (
                <p className="text-xs text-muted-foreground mb-3">
                  <strong>Point de retrait :</strong> 0→zone gratuite = retrait gratuit | zone gratuite→zone payante = livraison payante ou retrait | au-delà = hors zone
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mb-3">
                  <strong>Dépôt logistique :</strong> 0→zone gratuite = livraison gratuite | zone gratuite→zone payante = livraison payante | au-delà = hors zone
                </p>
              )}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rayon" className="text-xs text-muted-foreground">
                    {form.type === 'retrait' ? 'Rayon retrait gratuit (km)' : 'Rayon livraison gratuite (km)'}
                  </Label>
                  <Input
                    id="rayon"
                    type="number"
                    value={form.rayon_couverture_km}
                    onChange={(e) => setForm({ ...form, rayon_couverture_km: parseInt(e.target.value) || 30 })}
                    placeholder="30"
                  />
                  <p className="text-xs text-muted-foreground">
                    {form.type === 'retrait' ? 'Zone où seul le retrait est disponible' : 'Zone de livraison gratuite'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rayon_payant" className="text-xs text-muted-foreground">Rayon max. livraison payante (km)</Label>
                  <Input
                    id="rayon_payant"
                    type="number"
                    value={form.rayon_livraison_payant_km}
                    onChange={(e) => setForm({ ...form, rayon_livraison_payant_km: parseInt(e.target.value) || 50 })}
                    placeholder="50"
                  />
                  <p className="text-xs text-muted-foreground">Au-delà = hors zone</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prix_livraison" className="text-xs text-muted-foreground">Prix livraison payante (€)</Label>
                  <Input
                    id="prix_livraison"
                    type="number"
                    step="0.01"
                    value={form.prix_livraison_payante}
                    onChange={(e) => setForm({ ...form, prix_livraison_payante: parseFloat(e.target.value) || 0 })}
                    placeholder="50"
                  />
                  <p className="text-xs text-muted-foreground">Frais facturés au client</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telephone">Telephone</Label>
                <Input
                  id="telephone"
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  placeholder="06 12 34 56 78"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="depot@example.com"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="actif"
                checked={form.actif}
                onCheckedChange={(checked) => setForm({ ...form, actif: checked as boolean })}
              />
              <Label htmlFor="actif" className="cursor-pointer">Depot actif</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingDepot ? 'Mettre a jour' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce dépôt ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le dépôt "{depotToDelete?.nom}" sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDepot}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
