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
import {
  Loader2, Search, Filter, Users, UserPlus, Check, X, AlertCircle,
  MoreHorizontal, Pencil, Trash2, KeyRound, LogIn, Copy, Building2,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { UsersProfile, UserRole } from '@/lib/types/database'
import { ROLE_HIERARCHY } from '@/lib/auth/types'
import { getTenantConfig, TENANTS } from '@/lib/tenants'

const roleOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'Tous les rôles' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'agent_secteur', label: 'Agent Secteur' },
  { value: 'livreur', label: 'Livreur' },
  { value: 'client', label: 'Client' },
]

const roleColors: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-indigo-100 text-indigo-800',
  agent_secteur: 'bg-blue-100 text-blue-800',
  livreur: 'bg-teal-100 text-teal-800',
  client: 'bg-gray-100 text-gray-800',
}

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  agent_secteur: 'Agent Secteur',
  livreur: 'Livreur',
  client: 'Client',
}

function getRoleLabel(role: UserRole): string {
  return roleLabels[role] || role
}

const allTerritoires: Record<string, string> = {
  FR: 'France métropolitaine',
  '971': '971 - Guadeloupe',
  '972': '972 - Martinique',
  '973': '973 - Guyane',
  '974': '974 - La Réunion',
}

const tenantConfig = getTenantConfig()
const territoireOptions = [
  { value: 'none', label: 'Aucun' },
  ...tenantConfig.territories.map(t => ({ value: t, label: allTerritoires[t] || t })),
]

// Rôles qui nécessitent une sélection de dépôts
const rolesWithDepots: UserRole[] = ['agent_secteur', 'livreur']

interface UserForm {
  email: string
  password: string
  nom: string
  prenom: string
  role: UserRole
  territoire: string
  telephone: string
  actif: boolean
  depot_ids: string[]
}

const initialForm: UserForm = {
  email: '',
  password: '',
  nom: '',
  prenom: '',
  role: 'agent_secteur',
  territoire: tenantConfig.territories.length === 1 ? tenantConfig.territories[0] : 'none',
  telephone: '',
  actif: true,
  depot_ids: [],
}

interface DepotOption {
  id: string
  nom: string
}

function SortableHeader({ label, column, currentSort, currentOrder, onSort }: {
  label: string; column: string; currentSort: string; currentOrder: 'asc' | 'desc'; onSort: (col: string) => void
}) {
  const isActive = currentSort === column
  return (
    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => onSort(column)}>
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (currentOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </div>
    </TableHead>
  )
}

export default function AdminUsersPage() {
  const user = useAdminUser()
  const [users, setUsers] = useState<UsersProfile[]>([])
  const [depots, setDepots] = useState<DepotOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortBy, setSortBy] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

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

  // Password dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [shownPassword, setShownPassword] = useState('')
  const [passwordUserName, setPasswordUserName] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      // Fetch users — filtré par hiérarchie
      let query = supabase
        .from('users_profile')
        .select('*')
        .order('created_at', { ascending: false })

      if (user?.role === 'admin' && user.territoire) {
        query = query.eq('territoire', user.territoire)
      } else if (user?.role === 'agent_secteur') {
        // Agent secteur ne voit que les livreurs de son périmètre (+ lui-même)
        query = query.in('role', ['livreur'])
      }

      const { data, error } = await query
      if (!error) {
        let filtered = data || []
        // Agent : ajouter lui-même à la liste s'il n'y est pas
        if (user?.role === 'agent_secteur') {
          if (!filtered.find((u: any) => u.id === user.id)) {
            const { data: self } = await supabase
              .from('users_profile')
              .select('*')
              .eq('id', user.id)
              .single()
            if (self) filtered = [self, ...filtered]
          }
        }
        setUsers(filtered)
      }

      // Fetch depots — filtrer par depot_ids pour agent_secteur
      let depotsQuery = supabase
        .from('depots')
        .select('id, nom')
        .eq('actif', true)
        .order('nom')

      if (user?.role === 'agent_secteur' && user.depot_ids?.length) {
        depotsQuery = depotsQuery.in('id', user.depot_ids)
      }

      const { data: depotsData } = await depotsQuery
      if (depotsData) setDepots(depotsData)

      setLoading(false)
    }

    fetchData()
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

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (!sortBy) return 0
    const aVal = (a as any)[sortBy] ?? ''
    const bVal = (b as any)[sortBy] ?? ''
    const cmp = String(aVal).localeCompare(String(bVal), 'fr', { numeric: true })
    return sortOrder === 'asc' ? cmp : -cmp
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
      password: '',
      nom: userProfile.nom || '',
      prenom: userProfile.prenom || '',
      role: userProfile.role as UserRole,
      territoire: userProfile.territoire || 'none',
      telephone: userProfile.telephone || '',
      actif: userProfile.actif ?? true,
      depot_ids: (userProfile as any).depot_ids || [],
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

    if (!editingUser && (!form.password || form.password.length < 6)) {
      setError('Le mot de passe doit contenir au moins 6 caractères')
      return
    }

    if (editingUser && form.password && form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères')
      return
    }

    if (rolesWithDepots.includes(form.role) && form.depot_ids.length === 0) {
      setError('Veuillez sélectionner au moins un dépôt pour ce rôle')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const territoireValue = form.territoire === 'none' ? null : form.territoire || null

      if (editingUser) {
        const patchBody: Record<string, unknown> = {
          nom: form.nom,
          prenom: form.prenom,
          role: form.role,
          territoire: territoireValue,
          telephone: form.telephone || null,
          actif: form.actif,
          depot_ids: form.depot_ids,
        }
        if (form.password) patchBody.password = form.password

        const response = await fetch(`/api/admin/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })

        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Erreur lors de la mise à jour')

        setUsers(users.map(u => u.id === editingUser.id ? {
          ...u,
          nom: form.nom,
          prenom: form.prenom,
          role: form.role,
          territoire: territoireValue,
          telephone: form.telephone || null,
          actif: form.actif,
          depot_ids: form.depot_ids,
        } as any : u))
        toast.success('Utilisateur mis à jour')
      } else {
        const response = await fetch('/api/admin/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            territoire: territoireValue,
          }),
        })

        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Erreur lors de la création')

        setUsers([result.user, ...users])
        toast.success('Utilisateur créé avec succès')
      }

      setDialogOpen(false)
    } catch (err) {
      console.error('Erreur sauvegarde:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
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
      toast.success('Utilisateur supprimé')
      setShowDeleteDialog(false)
      setUserToDelete(null)
    } catch (err) {
      console.error('Erreur suppression:', err)
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
  }

  const handleResetPassword = async (targetUser: UsersProfile) => {
    setResettingPassword(true)
    try {
      const response = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: 'PUT',
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erreur')

      setPasswordUserName(`${targetUser.prenom} ${targetUser.nom}`)
      setShownPassword(result.temporaryPassword)
      setPasswordDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du reset')
    } finally {
      setResettingPassword(false)
    }
  }

  const handleImpersonate = async (targetUser: UsersProfile) => {
    try {
      const response = await fetch(`/api/admin/users/${targetUser.id}/impersonate`, {
        method: 'POST',
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erreur')

      // Store return info before navigating away
      localStorage.setItem('impersonate_return', JSON.stringify({
        email: user?.email,
        nom: user?.nom,
        prenom: user?.prenom,
        timestamp: Date.now(),
      }))

      // Navigate in same tab (cookies are shared across tabs, can't use new tab)
      const impersonateUrl = `/auth/impersonate?token=${encodeURIComponent(result.token)}&email=${encodeURIComponent(result.email)}`
      window.location.href = impersonateUrl
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur d\'impersonation')
    }
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(shownPassword)
    toast.success('Mot de passe copié !')
  }

  const toggleDepot = (depotId: string) => {
    setForm(prev => ({
      ...prev,
      depot_ids: prev.depot_ids.includes(depotId)
        ? prev.depot_ids.filter(id => id !== depotId)
        : [...prev.depot_ids, depotId],
    }))
  }

  // Get depot names for display
  const getDepotNames = (depotIds: string[] | undefined): string => {
    if (!depotIds || depotIds.length === 0) return '-'
    return depotIds
      .map(id => depots.find(d => d.id === id)?.nom || '?')
      .join(', ')
  }

  if (loading) {
    return null
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
        {(['super_admin', 'admin'] as const).includes(user?.role as 'super_admin' | 'admin') && (
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
                autoComplete="off"
                name="search-users-list"
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
                  <SortableHeader label="Utilisateur" column="nom" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Email" column="email" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Téléphone" column="telephone" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Rôle" column="role" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Territoire" column="territoire" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead>Dépôts</TableHead>
                  <SortableHeader label="Actif" column="actif" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">
                        {u.prenom} {u.nom}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell className="text-sm">{u.telephone || '-'}</TableCell>
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
                      <span className="text-sm text-muted-foreground">
                        {getDepotNames((u as any).depot_ids)}
                      </span>
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
                          {/* Modifier : soi-même OU hiérarchie strictement supérieure */}
                          {(u.id === user.id || (ROLE_HIERARCHY[user.role as UserRole] > ROLE_HIERARCHY[u.role as UserRole])) && (
                            <DropdownMenuItem onClick={() => openEditDialog(u)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                          )}
                          {!u.is_super_admin && u.id !== user.id && (
                            <>
                              {ROLE_HIERARCHY[user.role as UserRole] > ROLE_HIERARCHY[u.role as UserRole] && (
                                <DropdownMenuItem onClick={() => handleResetPassword(u)}>
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  Réinitialiser mot de passe
                                </DropdownMenuItem>
                              )}
                              {user?.role === 'super_admin' && (
                                <DropdownMenuItem onClick={() => handleImpersonate(u)}>
                                  <LogIn className="h-4 w-4 mr-2" />
                                  Se connecter en tant que
                                </DropdownMenuItem>
                              )}
                              {/* Supprimer : super_admin uniquement */}
                              {user?.role === 'super_admin' && (
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
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                  id="create-user-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="utilisateur@example.com"
                  autoComplete="off"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">
                {editingUser ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe *'}
              </Label>
              <Input
                id="password"
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingUser ? 'Laisser vide pour ne pas changer' : 'Mot de passe'}
              />
              {!editingUser && (
                <p className="text-xs text-muted-foreground">Minimum 6 caractères</p>
              )}
            </div>

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
                  onValueChange={(value) => setForm({ ...form, role: value as UserRole, depot_ids: [] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {user?.role === 'super_admin' && (
                      <SelectItem value="admin">Administrateur</SelectItem>
                    )}
                    <SelectItem value="agent_secteur">Agent Secteur</SelectItem>
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

            {/* Depot selection — visible for agent_secteur and livreur */}
            {rolesWithDepots.includes(form.role) && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Dépôts rattachés *
                </Label>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto border rounded-md p-3">
                  {depots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun dépôt actif</p>
                  ) : (
                    depots.map((depot) => (
                      <div key={depot.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`depot-${depot.id}`}
                          checked={form.depot_ids.includes(depot.id)}
                          onCheckedChange={() => toggleDepot(depot.id)}
                        />
                        <Label htmlFor={`depot-${depot.id}`} className="cursor-pointer text-sm">
                          {depot.nom}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                {form.depot_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {form.depot_ids.length} dépôt(s) sélectionné(s)
                  </p>
                )}
              </div>
            )}

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

      {/* Password Display Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Mot de passe
            </DialogTitle>
            <DialogDescription>
              Mot de passe pour {passwordUserName}. Copiez-le maintenant, il ne sera plus affiché.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
            <code className="flex-1 font-mono text-sm select-all break-all">
              {shownPassword}
            </code>
            <Button variant="outline" size="sm" onClick={copyPassword}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setPasswordDialogOpen(false)}>
              Fermer
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
              Cette action est irréversible. Le compte de &quot;{userToDelete?.prenom} {userToDelete?.nom}&quot; sera définitivement supprimé.
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
