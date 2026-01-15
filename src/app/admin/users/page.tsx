'use client'

import { useState, useEffect } from 'react'
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
import { Loader2, Search, Filter, Users, UserPlus, Check, X, AlertCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { UsersProfile, UserRole } from '@/lib/types/database'

const roleOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'Tous les rôles' },
  { value: 'admin_general', label: 'Admin Général' },
  { value: 'admin_regional', label: 'Admin Régional' },
  { value: 'agent_regional', label: 'Agent Régional' },
  { value: 'agent_depot', label: 'Agent Dépôt' },
  { value: 'livreur', label: 'Livreur' },
  { value: 'client', label: 'Client' },
]

const roleColors: Record<string, string> = {
  admin_general: 'bg-purple-100 text-purple-800',
  admin_regional: 'bg-indigo-100 text-indigo-800',
  agent_regional: 'bg-blue-100 text-blue-800',
  agent_depot: 'bg-cyan-100 text-cyan-800',
  livreur: 'bg-teal-100 text-teal-800',
  client: 'bg-gray-100 text-gray-800',
}

const roleLabels: Record<UserRole, string> = {
  admin_general: 'Admin Général',
  admin_regional: 'Admin Régional',
  agent_regional: 'Agent Régional',
  agent_depot: 'Agent Dépôt',
  livreur: 'Livreur',
  client: 'Client',
}

function getRoleLabel(role: UserRole): string {
  return roleLabels[role] || role
}

const territoireOptions = [
  { value: 'none', label: 'Aucun' },
  { value: 'FR', label: 'France métropolitaine' },
  { value: '971', label: '971 - Guadeloupe' },
  { value: '972', label: '972 - Martinique' },
  { value: '973', label: '973 - Guyane' },
  { value: '974', label: '974 - La Réunion' },
]

interface UserForm {
  email: string
  nom: string
  prenom: string
  role: UserRole
  territoire: string
  telephone: string
  actif: boolean
}

const initialForm: UserForm = {
  email: '',
  nom: '',
  prenom: '',
  role: 'agent_regional',
  territoire: '974',
  telephone: '',
  actif: true,
}

export default function AdminUsersPage() {
  const user = useAdminUser()
  const [users, setUsers] = useState<UsersProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UsersProfile | null>(null)
  const [form, setForm] = useState<UserForm>(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState<UsersProfile | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const fetchUsers = async () => {
      const supabase = createClient()

      let query = supabase
        .from('users_profile')
        .select('*')
        .order('created_at', { ascending: false })

      // Filtrer par territoire pour admin régional
      if (user?.role === 'admin_regional' && user.territoire) {
        query = query.eq('territoire', user.territoire)
      }

      const { data, error } = await query

      if (error) {
        console.error('Erreur:', error)
        setLoading(false)
        return
      }

      setUsers(data || [])
      setLoading(false)
    }

    fetchUsers()
  }, [])

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      !searchQuery ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.nom?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.prenom?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesRole = roleFilter === 'all' || u.role === roleFilter

    return matchesSearch && matchesRole
  })

  const openCreateDialog = () => {
    setEditingUser(null)
    setForm(initialForm)
    setError(null)
    setDialogOpen(true)
  }

  const openEditDialog = (userProfile: UsersProfile) => {
    setEditingUser(userProfile)
    setForm({
      email: userProfile.email,
      nom: userProfile.nom || '',
      prenom: userProfile.prenom || '',
      role: userProfile.role as UserRole,
      territoire: userProfile.territoire || 'none',
      telephone: userProfile.telephone || '',
      actif: userProfile.actif ?? true,
    })
    setError(null)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.nom || !form.prenom) {
      setError('Veuillez remplir le nom et le prénom')
      return
    }

    if (!editingUser && !form.email) {
      setError('Veuillez saisir une adresse email')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()

      // Convertir 'none' en null pour le territoire
      const territoireValue = form.territoire === 'none' ? null : form.territoire || null

      if (editingUser) {
        // Update existing user profile
        const { error: updateError } = await supabase
          .from('users_profile')
          .update({
            nom: form.nom,
            prenom: form.prenom,
            role: form.role,
            territoire: territoireValue,
            telephone: form.telephone || null,
            actif: form.actif,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingUser.id)

        if (updateError) throw updateError

        setUsers(users.map(u => u.id === editingUser.id ? {
          ...u,
          nom: form.nom,
          prenom: form.prenom,
          role: form.role,
          territoire: territoireValue,
          telephone: form.telephone || null,
          actif: form.actif,
        } : u))
        toast.success('Utilisateur mis à jour avec succès')
      } else {
        // Create new user - requires server-side API call
        const response = await fetch('/api/admin/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Erreur lors de la création')
        }

        setUsers([result.user, ...users])
        toast.success('Utilisateur créé avec succès')
      }

      setDialogOpen(false)
    } catch (err: any) {
      console.error('Erreur sauvegarde:', err)
      setError(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return
    setDeleting(true)

    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Erreur lors de la suppression')
      }

      setUsers(users.filter(u => u.id !== userToDelete.id))
      toast.success('Utilisateur supprimé avec succès')
      setShowDeleteDialog(false)
      setUserToDelete(null)
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
          <h1 className="text-2xl font-bold">Utilisateurs</h1>
          <p className="text-muted-foreground">
            Gérez les comptes utilisateurs et leurs rôles
          </p>
        </div>
        {user?.role === 'admin_general' && (
          <Button onClick={openCreateDialog}>
            <UserPlus className="h-4 w-4 mr-2" />
            Nouvel utilisateur
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou email..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrer par rôle" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-medium mb-1">Aucun utilisateur</h3>
              <p className="text-muted-foreground text-sm">
                {searchQuery || roleFilter !== 'all'
                  ? 'Aucun utilisateur ne correspond à vos critères'
                  : 'Les utilisateurs apparaîtront ici'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Territoire</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">
                        {u.prenom} {u.nom}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge className={roleColors[u.role]}>
                        {getRoleLabel(u.role as UserRole)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.territoire ? (
                        <Badge variant="outline">{u.territoire}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.actif ? (
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
                          <DropdownMenuItem onClick={() => openEditDialog(u)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifier
                          </DropdownMenuItem>
                          {user?.role === 'admin_general' && u.id !== user.id && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setUserToDelete(u)
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Modifiez les informations de l\'utilisateur'
                : 'Créez un nouveau compte utilisateur'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 py-4">
            {!editingUser && (
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="utilisateur@example.com"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prenom">Prénom *</Label>
                <Input
                  id="prenom"
                  value={form.prenom}
                  onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                  placeholder="Jean"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nom">Nom *</Label>
                <Input
                  id="nom"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  placeholder="Dupont"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telephone">Téléphone</Label>
              <Input
                id="telephone"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                placeholder="06 12 34 56 78"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">Rôle *</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) => setForm({ ...form, role: value as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin_general">Admin Général</SelectItem>
                    <SelectItem value="admin_regional">Admin Régional</SelectItem>
                    <SelectItem value="agent_regional">Agent Régional</SelectItem>
                    <SelectItem value="agent_depot">Agent Dépôt</SelectItem>
                    <SelectItem value="livreur">Livreur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="territoire">Territoire</Label>
                <Select
                  value={form.territoire}
                  onValueChange={(value) => setForm({ ...form, territoire: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {territoireOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="actif"
                checked={form.actif}
                onCheckedChange={(checked) => setForm({ ...form, actif: checked as boolean })}
              />
              <Label htmlFor="actif" className="cursor-pointer">Compte actif</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingUser ? 'Mettre à jour' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le compte de "{userToDelete?.prenom} {userToDelete?.nom}" sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
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
