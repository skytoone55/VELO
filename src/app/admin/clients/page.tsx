'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { Loader2, Search, Filter, Building2, MapPin, Send, Mail, ExternalLink, Copy, Check, RefreshCw, Trash2, MoreHorizontal, Navigation, Eye, Phone, X, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Client } from '@/lib/types/database'
import { toast } from 'sonner'
import { getTenantId } from '@/lib/tenants'
import { PROCESS_STATUTS, STATUT_COLORS, type ProcessStatut } from '@/lib/constants'
import { getCommercialName, getDepartementLabel, getStaticDepartementOptions, getStaticCommercialOptions } from '@/lib/tenants/commercial'

type SortField = 'nom_entreprise' | 'ville' | 'statut_process' | 'statut_commercial' | 'depot' | 'created_at'
type SortDirection = 'asc' | 'desc'

interface FilterState {
  search: string
  status: ProcessStatut | 'all'
  commercialStatus: string | 'all'
  commercial: string | 'all'
  departement: string | 'all'
  depot: string | 'all'
}

export default function ClientsPage() {
  const supabase = createClient()
  const { user: adminUser } = useAdminUser()
  
  const [clients, setClients] = useState<Client[]>([])
  const [depots, setDepots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'all',
    commercialStatus: 'all',
    commercial: 'all',
    departement: 'all',
    depot: 'all',
  })
  
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editFormData, setEditFormData] = useState<Partial<Client>>({})
  const [editLoading, setEditLoading] = useState(false)
  
  const tenantId = getTenantId()
  const commercialOptions = getStaticCommercialOptions(tenantId)
  const departementOptions = getStaticDepartementOptions(tenantId)

  useEffect(() => {
    fetchClients()
    fetchDepots()
  }, [tenantId, filters])

  const fetchDepots = async () => {
    try {
      const { data, error: err } = await supabase
        .from('depots')
        .select('*')
        .eq('tenant_id', tenantId)
      if (err) throw err
      setDepots(data || [])
    } catch (err: any) {
      console.error('Error fetching depots:', err)
    }
  }

  const fetchClients = async () => {
    try {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)

      // Apply filters
      if (filters.search) {
        query = query.or(`nom_entreprise.ilike.%${filters.search}%,contact_nom.ilike.%${filters.search}%,contact_email.ilike.%${filters.search}%,ville.ilike.%${filters.search}%`)
      }

      if (filters.status !== 'all') {
        query = query.eq('statut_process', filters.status)
      }

      if (filters.commercialStatus !== 'all') {
        query = query.eq('statut_commercial', filters.commercialStatus)
      }

      if (filters.commercial !== 'all') {
        query = query.eq('commercial', filters.commercial)
      }

      if (filters.departement !== 'all') {
        query = query.eq('departement', filters.departement)
      }

      if (filters.depot !== 'all') {
        query = query.eq('depot_id', filters.depot)
      }

      // Apply sorting
      query = query.order(sortField, { ascending: sortDirection === 'asc' })

      // Apply pagination
      const from = (page - 1) * pageSize
      query = query.range(from, from + pageSize - 1)

      const { data, error: err, count } = await query
      if (err) throw err

      setClients(data || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error fetching clients:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedClients(new Set(clients.map(c => c.id)))
    } else {
      setSelectedClients(new Set())
    }
  }

  const handleSelectClient = (clientId: string, checked: boolean) => {
    const newSelected = new Set(selectedClients)
    if (checked) {
      newSelected.add(clientId)
    } else {
      newSelected.delete(clientId)
    }
    setSelectedClients(newSelected)
  }

  const handleEditClick = (client: Client) => {
    setEditingClient(client)
    setEditFormData(client)
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!editingClient) return
    
    try {
      setEditLoading(true)
      const { error: err } = await supabase
        .from('clients')
        .update(editFormData)
        .eq('id', editingClient.id)
      
      if (err) throw err
      
      toast.success('Client updated successfully')
      setShowEditDialog(false)
      setEditingClient(null)
      setEditFormData({})
      await fetchClients()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  const sortedAndFilteredClients = useMemo(() => {
    return clients
  }, [clients])

  const pageCount = Math.ceil((clients.length || 0) / pageSize)

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Clients</h1>
          <p className="text-slate-600">Manage all clients and their information</p>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Search */}
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search by name, email, or city..."
                    className="pl-10 border-slate-200"
                    value={filters.search}
                    onChange={(e) => {
                      setFilters(prev => ({ ...prev, search: e.target.value }))
                      setPage(1)
                    }}
                  />
                </div>
              </div>

              {/* Filters Row */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                {/* Process Status */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Process Status</label>
                  <Select value={filters.status} onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, status: value as ProcessStatut | 'all' }))
                    setPage(1)
                  }}>
                    <SelectTrigger className="border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {Object.values(PROCESS_STATUTS).map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Commercial Status */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Commercial Status</label>
                  <Select value={filters.commercialStatus} onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, commercialStatus: value }))
                    setPage(1)
                  }}>
                    <SelectTrigger className="border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Commercial */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Commercial</label>
                  <Select value={filters.commercial} onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, commercial: value }))
                    setPage(1)
                  }}>
                    <SelectTrigger className="border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {commercialOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Department */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Department</label>
                  <Select value={filters.departement} onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, departement: value }))
                    setPage(1)
                  }}>
                    <SelectTrigger className="border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {departementOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Depot */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Depot</label>
                  <Select value={filters.depot} onValueChange={(value) => {
                    setFilters(prev => ({ ...prev, depot: value }))
                    setPage(1)
                  }}>
                    <SelectTrigger className="border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {depots.map(depot => (
                        <SelectItem key={depot.id} value={depot.id}>{depot.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-slate-200 shadow-md">
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : clients.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-slate-500">No clients found</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="border-slate-200 hover:bg-slate-50">
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedClients.size === clients.length && clients.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={() => handleSort('nom_entreprise')}
                        >
                          <div className="flex items-center gap-2">
                            Company
                            {sortField === 'nom_entreprise' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">Contact</TableHead>
                        <TableHead 
                          className="cursor-pointer font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={() => handleSort('ville')}
                        >
                          <div className="flex items-center gap-2">
                            City
                            {sortField === 'ville' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={() => handleSort('statut_process')}
                        >
                          <div className="flex items-center gap-2">
                            Process
                            {sortField === 'statut_process' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={() => handleSort('statut_commercial')}
                        >
                          <div className="flex items-center gap-2">
                            Status
                            {sortField === 'statut_commercial' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead className="font-semibold text-slate-700">Commercial</TableHead>
                        <TableHead 
                          className="cursor-pointer font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={() => handleSort('depot')}
                        >
                          <div className="flex items-center gap-2">
                            Depot
                            {sortField === 'depot' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                            )}
                          </div>
                        </TableHead>
                        <TableHead className="w-12 text-right font-semibold text-slate-700">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading && (
                        <TableRow>
                          <TableCell colSpan={9} className="py-8 text-center">
                            <div className="flex items-center justify-center">
                              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {!loading && clients.map((client) => (
                        <TableRow key={client.id} className="border-slate-200 hover:bg-slate-50">
                          <TableCell>
                            <Checkbox
                              checked={selectedClients.has(client.id)}
                              onCheckedChange={(checked) => handleSelectClient(client.id, !!checked)}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-slate-900">{client.nom_entreprise}</TableCell>
                          <TableCell className="text-slate-600">{client.contact_nom}</TableCell>
                          <TableCell className="text-slate-600">{client.ville}</TableCell>
                          <TableCell>
                            <Badge className={`${STATUT_COLORS[client.statut_process as ProcessStatut] || 'bg-slate-100'} text-xs`}>
                              {client.statut_process}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{client.statut_commercial}</Badge>
                          </TableCell>
                          <TableCell className="text-slate-600">{getCommercialName(tenantId, client.commercial)}</TableCell>
                          <TableCell className="text-slate-600">
                            {depots.find(d => d.id === client.depot_id)?.name || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => handleEditClick(client)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Make changes to the client information</DialogDescription>
          </DialogHeader>
          
          {editingClient && (
            <div className="space-y-4 py-4">
              {/* Edit form fields here */}
              <div>
                <Label htmlFor="nom_entreprise">Company Name</Label>
                <Input
                  id="nom_entreprise"
                  value={editFormData.nom_entreprise || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, nom_entreprise: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="contact_nom">Contact Name</Label>
                <Input
                  id="contact_nom"
                  value={editFormData.contact_nom || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, contact_nom: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={editFormData.contact_email || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const Edit = Mail
