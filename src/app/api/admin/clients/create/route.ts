import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateValidationCode, hashValidationCode } from '@/lib/utils'
import { sendCodeValidationEmail } from '@/lib/email/gmail'

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

export async function POST(request: Request) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer le profil pour vérifier les permissions
    const { data: profile } = await supabase
      .from('users_profile')
      .select('role, territoire')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin_general', 'admin_regional', 'agent_regional'].includes(profile.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const body = await request.json()
    const {
      raison_sociale,
      siret,
      email,
      telephone,
      contact_nom,
      contact_prenom,
      adresse_societe_ligne1,
      adresse_societe_cp,
      adresse_societe_ville,
      departement,
      velo_devis,
    } = body

    // Validation basique
    if (!raison_sociale || !siret || !email || !departement) {
      return NextResponse.json(
        { error: 'Champs obligatoires manquants (raison_sociale, siret, email, departement)' },
        { status: 400 }
      )
    }

    // Vérifier le territoire pour admin_regional
    if (profile.role === 'admin_regional' && profile.territoire !== departement) {
      return NextResponse.json(
        { error: 'Vous ne pouvez créer des clients que dans votre territoire' },
        { status: 403 }
      )
    }

    // Utiliser le client admin pour bypasser RLS
    const adminClient = createAdminClient()

    // Vérifier si le SIRET existe déjà
    const { data: existingClient } = await adminClient
      .from('clients')
      .select('id')
      .eq('siret', siret)
      .single()

    if (existingClient) {
      return NextResponse.json(
        { error: 'Un client avec ce SIRET existe déjà' },
        { status: 409 }
      )
    }

    // Calculer l'agence à partir du code postal
    const agence = getAgenceFromCodePostal(adresse_societe_cp || '')

    // Générer le code de validation à 6 chiffres
    const codeValidation = generateValidationCode()
    const codeValidationHash = hashValidationCode(codeValidation)

    // Créer le client avec le code de validation hashé
    const { data: newClient, error } = await adminClient
      .from('clients')
      .insert({
        raison_sociale,
        siret,
        email,
        telephone: telephone || null,
        contact_nom: contact_nom || null,
        contact_prenom: contact_prenom || null,
        adresse_societe_ligne1: adresse_societe_ligne1 || '',
        adresse_societe_cp: adresse_societe_cp || '',
        adresse_societe_ville: adresse_societe_ville || '',
        departement,
        agence,
        velo_devis: velo_devis || 1,
        statut_formulaire: 'en_attente',
        code_validation_hash: codeValidationHash,
        code_validation_envoye_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Erreur création client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Envoyer l'email avec le code de validation
    const clientName = contact_prenom && contact_nom
      ? `${contact_prenom} ${contact_nom}`
      : raison_sociale

    try {
      await sendCodeValidationEmail(email, clientName, codeValidation)
      console.log(`Code de validation envoyé à ${email}`)
    } catch (emailError) {
      console.error('Erreur envoi email code validation:', emailError)
      // On ne bloque pas la création du client si l'email échoue
      // L'admin pourra renvoyer le code plus tard
    }

    return NextResponse.json({
      client: newClient,
      codeEnvoye: true
    })
  } catch (error: any) {
    console.error('Erreur API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
