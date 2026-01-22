import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * API pour gérer le mapping des champs Monday
 * GET /api/monday/mapping - Récupérer tous les mappings
 * POST /api/monday/mapping - Créer/Mettre à jour un mapping
 * DELETE /api/monday/mapping - Supprimer un mapping
 */

// Définition des champs de notre interface avec leurs métadonnées
export const INTERFACE_FIELDS = [
  // Identification
  { field: 'raison_sociale', label: 'Raison sociale', type: 'text', section: 'identification', required: true },
  { field: 'siret', label: 'SIRET', type: 'text', section: 'identification', required: true },
  { field: 'reference_dossier', label: 'Code Retina / Réf dossier', type: 'text', section: 'identification' },
  { field: 'numero_devis', label: 'Numéro de devis', type: 'text', section: 'identification' },

  // Contact
  { field: 'email', label: 'Email principal', type: 'email', section: 'contact', required: true },
  { field: 'email_beneficiaire', label: 'Email bénéficiaire', type: 'email', section: 'contact' },
  { field: 'telephone', label: 'Téléphone', type: 'phone', section: 'contact' },
  { field: 'contact_nom', label: 'Nom du contact', type: 'text', section: 'contact' },
  { field: 'contact_prenom', label: 'Prénom du contact', type: 'text', section: 'contact' },
  { field: 'contact_fonction', label: 'Fonction du contact', type: 'text', section: 'contact' },

  // Adresse siège
  { field: 'adresse_societe_ligne1', label: 'Adresse (ligne 1)', type: 'text', section: 'adresse_siege' },
  { field: 'adresse_societe_ligne2', label: 'Adresse (ligne 2)', type: 'text', section: 'adresse_siege' },
  { field: 'adresse_societe_cp', label: 'Code postal', type: 'text', section: 'adresse_siege' },
  { field: 'adresse_societe_ville', label: 'Ville', type: 'text', section: 'adresse_siege' },

  // Adresse livraison
  { field: 'adresse_livraison_ligne1', label: 'Adresse livraison (ligne 1)', type: 'text', section: 'adresse_livraison' },
  { field: 'adresse_livraison_ligne2', label: 'Adresse livraison (ligne 2)', type: 'text', section: 'adresse_livraison' },
  { field: 'adresse_livraison_cp', label: 'CP livraison', type: 'text', section: 'adresse_livraison' },
  { field: 'adresse_livraison_ville', label: 'Ville livraison', type: 'text', section: 'adresse_livraison' },

  // Informations entreprise
  { field: 'format_juridique', label: 'Format juridique', type: 'text', section: 'entreprise' },
  { field: 'code_ape', label: 'Code APE/NAF', type: 'text', section: 'entreprise' },
  { field: 'nb_salaries', label: 'Nombre de salariés', type: 'number', section: 'entreprise' },
  { field: 'departement', label: 'Département', type: 'status', section: 'entreprise' },

  // Vélos & Devis
  { field: 'velo_devis', label: 'Nombre vélos devis', type: 'number', section: 'velos' },
  { field: 'velo_valide', label: 'Nombre vélos validés', type: 'number', section: 'velos' },
  { field: 'devis_pdf_url', label: 'URL devis PDF', type: 'link', section: 'velos' },
  { field: 'date_signature_devis', label: 'Date signature devis', type: 'date', section: 'velos' },

  // Statuts
  { field: 'statut_commercial', label: 'Statut commercial', type: 'status', section: 'statuts' },
  { field: 'statut_retina', label: 'Statut Retina', type: 'status', section: 'statuts' },
  { field: 'statut_mail', label: 'Statut mail', type: 'status', section: 'statuts' },
  { field: 'statut_anomalie', label: 'Statut anomalie', type: 'status', section: 'statuts' },
  { field: 'statut_doublon', label: 'Statut doublon', type: 'status', section: 'statuts' },
  { field: 'date_statut', label: 'Date statut', type: 'date', section: 'statuts' },

  // Assignation
  { field: 'commercial_assigne', label: 'Commercial assigné', type: 'people', section: 'assignation' },
  { field: 'equipe_ids', label: 'Équipe', type: 'people', section: 'assignation' },

  // Notes
  { field: 'notes_internes', label: 'Notes internes', type: 'long_text', section: 'notes' },

  // Code ENEMAT (validation client)
  { field: 'code_enemat_saisi', label: 'Code ENEMAT saisi', type: 'text', section: 'validation' },
  { field: 'code_enemat_valide', label: 'Code ENEMAT validé', type: 'checkbox', section: 'validation' },
  { field: 'date_validation_code', label: 'Date validation code', type: 'date', section: 'validation' },
]

export async function GET() {
  const adminClient = createAdminClient()

  try {
    // Récupérer les mappings existants
    const { data: mappings, error } = await adminClient
      .from('monday_field_mapping')
      .select('*')
      .order('interface_section', { ascending: true })

    if (error) throw error

    // Combiner avec la définition des champs interface
    const result = INTERFACE_FIELDS.map(field => {
      const mapping = mappings?.find(m => m.interface_field === field.field)
      return {
        ...field,
        monday_column_id: mapping?.monday_column_id || null,
        monday_column_title: mapping?.monday_column_title || null,
        monday_column_type: mapping?.monday_column_type || null,
        value_mapping: mapping?.value_mapping || {},
        is_synced: !!mapping?.monday_column_id,
      }
    })

    return NextResponse.json({
      fields: result,
      sections: [
        { id: 'identification', label: 'Identification' },
        { id: 'contact', label: 'Contact' },
        { id: 'adresse_siege', label: 'Adresse siège' },
        { id: 'adresse_livraison', label: 'Adresse livraison' },
        { id: 'entreprise', label: 'Informations entreprise' },
        { id: 'velos', label: 'Vélos & Devis' },
        { id: 'statuts', label: 'Statuts' },
        { id: 'assignation', label: 'Assignation' },
        { id: 'notes', label: 'Notes' },
        { id: 'validation', label: 'Validation client' },
      ],
    })

  } catch (error: any) {
    console.error('Erreur récupération mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de récupération' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const adminClient = createAdminClient()

  try {
    const body = await request.json()
    const { interface_field, monday_column_id, monday_column_title, monday_column_type, value_mapping } = body

    if (!interface_field) {
      return NextResponse.json(
        { error: 'interface_field est requis' },
        { status: 400 }
      )
    }

    // Trouver la définition du champ
    const fieldDef = INTERFACE_FIELDS.find(f => f.field === interface_field)
    if (!fieldDef) {
      return NextResponse.json(
        { error: 'Champ interface inconnu' },
        { status: 400 }
      )
    }

    // Upsert le mapping
    const { data, error } = await adminClient
      .from('monday_field_mapping')
      .upsert({
        interface_field,
        interface_label: fieldDef.label,
        interface_type: fieldDef.type,
        interface_section: fieldDef.section,
        monday_column_id: monday_column_id || null,
        monday_column_title: monday_column_title || null,
        monday_column_type: monday_column_type || null,
        value_mapping: value_mapping || {},
        is_required: fieldDef.required || false,
        is_synced: !!monday_column_id,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'interface_field',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      mapping: data,
    })

  } catch (error: any) {
    console.error('Erreur mise à jour mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de mise à jour' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const adminClient = createAdminClient()

  try {
    const { searchParams } = new URL(request.url)
    const interface_field = searchParams.get('interface_field')

    if (!interface_field) {
      return NextResponse.json(
        { error: 'interface_field est requis' },
        { status: 400 }
      )
    }

    const { error } = await adminClient
      .from('monday_field_mapping')
      .delete()
      .eq('interface_field', interface_field)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Erreur suppression mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur de suppression' },
      { status: 500 }
    )
  }
}
