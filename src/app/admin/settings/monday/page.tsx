'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { RefreshCcw, Link2, Link2Off, Plus, Check, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MondayColumn {
  id: string
  title: string
  type: string
  labels?: { id: string; label: string }[]
}

interface InterfaceField {
  field: string
  label: string
  type: string
  section: string
  required?: boolean
  monday_column_id: string | null
  monday_column_title: string | null
  monday_column_type: string | null
  value_mapping: Record<string, string>
  is_synced: boolean
}

interface Section {
  id: string
  label: string
}

export default function MondayMappingPage() {
  const [mondayColumns, setMondayColumns] = useState<MondayColumn[]>([])
  const [interfaceFields, setInterfaceFields] = useState<InterfaceField[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['identification', 'statuts']))
  const [boardInfo, setBoardInfo] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newColumnField, setNewColumnField] = useState<string | null>(null)
  const [newColumnTitle, setNewColumnTitle] = useState('')

  // Charger le schéma Monday et le mapping
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Charger en parallèle le schéma Monday et le mapping
      const [schemaRes, mappingRes] = await Promise.all([
        fetch('/api/monday/schema'),
        fetch('/api/monday/mapping'),
      ])

      if (!schemaRes.ok) {
        const err = await schemaRes.json()
        throw new Error(err.error || 'Erreur chargement schéma Monday')
      }

      if (!mappingRes.ok) {
        const err = await mappingRes.json()
        throw new Error(err.error || 'Erreur chargement mapping')
      }

      const schemaData = await schemaRes.json()
      const mappingData = await mappingRes.json()

      setBoardInfo({ id: schemaData.boardId, name: schemaData.boardName })
      setMondayColumns(schemaData.columns)
      setInterfaceFields(mappingData.fields)
      setSections(mappingData.sections)

    } catch (err: any) {
      console.error('Erreur chargement:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Sauvegarder un mapping
  const saveMapping = async (field: string, mondayColumnId: string | null) => {
    setSaving(field)

    try {
      const mondayColumn = mondayColumns.find(c => c.id === mondayColumnId)

      const res = await fetch('/api/monday/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interface_field: field,
          monday_column_id: mondayColumnId,
          monday_column_title: mondayColumn?.title || null,
          monday_column_type: mondayColumn?.type || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }

      // Mettre à jour l'état local
      setInterfaceFields(prev =>
        prev.map(f =>
          f.field === field
            ? {
                ...f,
                monday_column_id: mondayColumnId,
                monday_column_title: mondayColumn?.title || null,
                monday_column_type: mondayColumn?.type || null,
                is_synced: !!mondayColumnId,
              }
            : f
        )
      )

    } catch (err: any) {
      console.error('Erreur sauvegarde:', err)
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  // Créer une nouvelle colonne Monday
  const createMondayColumn = async (interfaceField: string) => {
    if (!newColumnTitle.trim()) return

    setSaving(interfaceField)

    try {
      const fieldDef = interfaceFields.find(f => f.field === interfaceField)
      const columnType = fieldDef?.type || 'text'

      const res = await fetch('/api/monday/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newColumnTitle,
          columnType,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }

      const data = await res.json()

      // Mapper automatiquement le nouveau champ
      await saveMapping(interfaceField, data.column.id)

      // Recharger les colonnes Monday
      await loadData()

      setNewColumnField(null)
      setNewColumnTitle('')

    } catch (err: any) {
      console.error('Erreur création colonne:', err)
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  // Compter les champs mappés par section
  const getMappingStats = (sectionId: string) => {
    const sectionFields = interfaceFields.filter(f => f.section === sectionId)
    const mapped = sectionFields.filter(f => f.is_synced).length
    return { mapped, total: sectionFields.length }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mapping Monday.com</h1>
          <p className="text-muted-foreground">
            Connectez les champs de l'interface avec les colonnes Monday
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCcw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Erreur</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {boardInfo && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="bg-blue-50">Monday.com</Badge>
                <span className="font-medium">{boardInfo.name}</span>
                <span className="text-muted-foreground text-sm">ID: {boardInfo.id}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {mondayColumns.length} colonnes disponibles
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {sections.map(section => {
          const stats = getMappingStats(section.id)
          const isExpanded = expandedSections.has(section.id)
          const sectionFields = interfaceFields.filter(f => f.section === section.id)

          return (
            <Card key={section.id}>
              <CardHeader
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <CardTitle className="text-lg">{section.label}</CardTitle>
                  </div>
                  <Badge
                    variant={stats.mapped === stats.total ? 'default' : 'secondary'}
                    className={cn(
                      stats.mapped === stats.total && 'bg-green-100 text-green-800'
                    )}
                  >
                    {stats.mapped}/{stats.total} mappés
                  </Badge>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="divide-y">
                    {sectionFields.map(field => (
                      <div key={field.field} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-4">
                          {/* Champ interface */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{field.label}</span>
                              {field.required && (
                                <Badge variant="outline" className="text-xs">Requis</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {field.field}
                            </div>
                          </div>

                          {/* Icône de connexion */}
                          <div className="flex items-center">
                            {field.is_synced ? (
                              <Link2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <Link2Off className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>

                          {/* Sélection colonne Monday */}
                          <div className="flex-1 min-w-0">
                            {newColumnField === field.field ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="Nom de la nouvelle colonne"
                                  value={newColumnTitle}
                                  onChange={e => setNewColumnTitle(e.target.value)}
                                  className="h-9"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => createMondayColumn(field.field)}
                                  disabled={!newColumnTitle.trim() || saving === field.field}
                                >
                                  {saving === field.field ? (
                                    <RefreshCcw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setNewColumnField(null)
                                    setNewColumnTitle('')
                                  }}
                                >
                                  Annuler
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Select
                                  value={field.monday_column_id || 'none'}
                                  onValueChange={value => {
                                    if (value === 'none') {
                                      saveMapping(field.field, null)
                                    } else if (value === 'create') {
                                      setNewColumnField(field.field)
                                      setNewColumnTitle(field.label)
                                    } else {
                                      saveMapping(field.field, value)
                                    }
                                  }}
                                  disabled={saving === field.field}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Sélectionner une colonne Monday" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">
                                      <span className="text-muted-foreground">Non mappé</span>
                                    </SelectItem>
                                    <SelectItem value="create">
                                      <span className="flex items-center gap-2 text-primary">
                                        <Plus className="h-4 w-4" />
                                        Créer une nouvelle colonne
                                      </span>
                                    </SelectItem>
                                    {mondayColumns.map(col => (
                                      <SelectItem key={col.id} value={col.id}>
                                        <div className="flex items-center gap-2">
                                          <span>{col.title}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {col.type}
                                          </Badge>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {saving === field.field && (
                                  <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Info sur le mapping actuel */}
                        {field.is_synced && field.monday_column_title && (
                          <div className="mt-2 text-sm text-muted-foreground pl-4 border-l-2 border-green-200">
                            Mappé vers: <span className="font-mono">{field.monday_column_id}</span> ({field.monday_column_title})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
