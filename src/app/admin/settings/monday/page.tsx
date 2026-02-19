'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  RefreshCcw,
  Link2,
  Database,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'

interface MondayColumn {
  id: string
  title: string
  type: string
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
  mapping_status: 'unmapped' | 'monday' | 'supabase_only'
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [boardInfo, setBoardInfo] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMapped, setShowMapped] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  // Auto-expand sections that have unmapped fields
  useEffect(() => {
    const sectionsWithUnmapped = new Set<string>()
    interfaceFields.forEach(f => {
      if (f.mapping_status === 'unmapped') {
        sectionsWithUnmapped.add(f.section)
      }
    })
    setExpandedSections(sectionsWithUnmapped)
  }, [interfaceFields])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Charger le mapping d'abord (plus rapide, depuis Supabase)
      const mappingRes = await fetch('/api/monday/mapping')
      if (!mappingRes.ok) {
        const err = await mappingRes.json()
        throw new Error(err.error || 'Erreur chargement mapping')
      }
      const mappingData = await mappingRes.json()
      setInterfaceFields(mappingData.fields)
      setSections(mappingData.sections)

      // Puis charger le schéma Monday (peut être lent)
      const schemaRes = await fetch('/api/monday/schema')

      if (schemaRes.ok) {
        const schemaData = await schemaRes.json()
        setBoardInfo({ id: schemaData.boardId, name: schemaData.boardName })
        setMondayColumns(schemaData.columns)
      } else {
        console.error('Erreur chargement schéma Monday - continuera sans')
        setError('Impossible de charger les colonnes Monday. Réessayez avec le bouton Actualiser.')
      }
    } catch (err: any) {
      console.error('Erreur chargement:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Mapper un champ vers une colonne Monday
  const saveMapping = async (field: string, mondayColumnId: string) => {
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

      // Mettre à jour l'état local - le champ passe en "monday"
      setInterfaceFields(prev =>
        prev.map(f =>
          f.field === field
            ? {
                ...f,
                monday_column_id: mondayColumnId,
                monday_column_title: mondayColumn?.title || null,
                monday_column_type: mondayColumn?.type || null,
                is_synced: true,
                mapping_status: 'monday' as const,
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

  // Marquer un champ comme "Supabase uniquement"
  const markSupabaseOnly = async (field: string) => {
    setSaving(field)
    try {
      const res = await fetch('/api/monday/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interface_field: field,
          supabase_only: true,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }

      // Mettre à jour l'état local - le champ passe en "supabase_only"
      setInterfaceFields(prev =>
        prev.map(f =>
          f.field === field
            ? {
                ...f,
                monday_column_id: null,
                monday_column_title: null,
                monday_column_type: null,
                is_synced: false,
                mapping_status: 'supabase_only' as const,
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

  // Stats globales
  const unmappedFields = interfaceFields.filter(f => f.mapping_status === 'unmapped')
  const mondayMappedFields = interfaceFields.filter(f => f.mapping_status === 'monday')
  const supabaseOnlyFields = interfaceFields.filter(f => f.mapping_status === 'supabase_only')
  const allConfigured = unmappedFields.length === 0

  // Stats par section pour les non-mappés
  const getSectionUnmappedCount = (sectionId: string) => {
    return interfaceFields.filter(f => f.section === sectionId && f.mapping_status === 'unmapped').length
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Mapping Monday.com</h1>
            <p className="text-muted-foreground">
              {allConfigured
                ? 'Tous les champs sont configurés'
                : `${unmappedFields.length} champ${unmappedFields.length > 1 ? 's' : ''} à configurer`}
            </p>
          </div>
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

      {/* Board info + stats globales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {boardInfo && (
          <Card className="md:col-span-1">
            <CardContent className="py-4">
              <div className="text-sm text-muted-foreground">Board Monday</div>
              <div className="font-medium truncate">{boardInfo.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{boardInfo.id}</div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{unmappedFields.length}</div>
            <div className="text-sm text-muted-foreground">Non configurés</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-green-600">{mondayMappedFields.length}</div>
            <div className="text-sm text-muted-foreground">Liés à Monday</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{supabaseOnlyFields.length}</div>
            <div className="text-sm text-muted-foreground">Supabase uniquement</div>
          </CardContent>
        </Card>
      </div>

      {/* All configured message */}
      {allConfigured && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-6 flex items-center justify-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <span className="text-green-800 font-medium text-lg">
              Tous les champs sont configurés !
            </span>
          </CardContent>
        </Card>
      )}

      {/* Champs non mappés - par section */}
      {!allConfigured && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Champs à configurer</h2>
          {sections.map(section => {
            const unmappedCount = getSectionUnmappedCount(section.id)
            if (unmappedCount === 0) return null

            const isExpanded = expandedSections.has(section.id)
            const sectionFields = interfaceFields.filter(
              f => f.section === section.id && f.mapping_status === 'unmapped'
            )

            return (
              <Card key={section.id}>
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
                  onClick={() => toggleSection(section.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <CardTitle className="text-base">{section.label}</CardTitle>
                    </div>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                      {unmappedCount} à configurer
                    </Badge>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="divide-y">
                      {sectionFields.map(field => (
                        <div key={field.field} className="py-4 first:pt-0 last:pb-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            {/* Field info */}
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

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Select Monday column */}
                              <Select
                                onValueChange={value => saveMapping(field.field, value)}
                                disabled={saving === field.field}
                              >
                                <SelectTrigger className="w-[240px]">
                                  <SelectValue placeholder="Colonne Monday..." />
                                </SelectTrigger>
                                <SelectContent>
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

                              {/* Supabase only button */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => markSupabaseOnly(field.field)}
                                disabled={saving === field.field}
                                className="whitespace-nowrap"
                              >
                                {saving === field.field ? (
                                  <RefreshCcw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Database className="h-4 w-4 mr-1" />
                                )}
                                Supabase seul
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Champs déjà configurés (résumé pliable) */}
      {(mondayMappedFields.length > 0 || supabaseOnlyFields.length > 0) && (
        <div className="space-y-4">
          <button
            onClick={() => setShowMapped(!showMapped)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showMapped ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span>
              Champs déjà configurés ({mondayMappedFields.length + supabaseOnlyFields.length})
            </span>
          </button>

          {showMapped && (
            <Card>
              <CardContent className="py-4">
                <div className="divide-y">
                  {/* Monday mapped fields */}
                  {mondayMappedFields.map(field => (
                    <div key={field.field} className="py-2 flex items-center gap-3">
                      <Link2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{field.label}</span>
                        <span className="text-xs text-muted-foreground font-mono ml-2">
                          {field.field}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <span className="font-mono text-xs">{field.monday_column_id}</span>
                        {field.monday_column_title && (
                          <span className="text-xs">({field.monday_column_title})</span>
                        )}
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">
                        Monday
                      </Badge>
                    </div>
                  ))}

                  {/* Supabase only fields */}
                  {supabaseOnlyFields.map(field => (
                    <div key={field.field} className="py-2 flex items-center gap-3">
                      <Database className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{field.label}</span>
                        <span className="text-xs text-muted-foreground font-mono ml-2">
                          {field.field}
                        </span>
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">
                        Supabase seul
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
