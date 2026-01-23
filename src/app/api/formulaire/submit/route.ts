import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFormulaireRecapEmail } from '@/lib/email/gmail'
import { syncClientToMonday, isMondayConfigured } from '@/lib/monday/api'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId, data } = body

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID requis' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()

    // Vérifier que le client existe et récupérer ses infos
    const { data: client, error: clientCheckError } = await adminClient
      .from('clients')
      .select('id, email, raison_sociale, contact_nom, contact_prenom, statut_formulaire, depot_retrait_id, depot_logistique_id, monday_item_id')
      .eq('id', clientId)
      .single()

    if (clientCheckError || !client) {
      return NextResponse.json(
        { error: 'Client non trouvé' },
        { status: 404 }
      )
    }

    // Vérifier que le formulaire n'est pas déjà complété
    if (client.statut_formulaire === 'formulaire_complete') {
      return NextResponse.json(
        { error: 'Ce formulaire a déjà été complété' },
        { status: 400 }
      )
    }

    // Déterminer le mode de livraison basé sur le depot_retrait_id
    const modeLivraison = client.depot_retrait_id ? 'retrait' : 'domicile'
    const depotId = client.depot_retrait_id || client.depot_logistique_id

    // 1. Créer le compte utilisateur si un mot de passe a été fourni
    let userId: string | null = null
    if (data.password && client.email) {
      try {
        // Créer l'utilisateur auth
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email: client.email,
          password: data.password,
          email_confirm: true,
          user_metadata: {
            nom: client.contact_nom,
            prenom: client.contact_prenom,
            role: 'client',
          }
        })

        if (authError) {
          // Si l'utilisateur existe déjà, ne pas bloquer la soumission
          if (!authError.message.includes('already been registered')) {
            console.error('Erreur création auth user:', authError)
          }
        } else if (authData.user) {
          userId = authData.user.id

          // Créer le profil utilisateur
          await adminClient.from('users_profile').insert({
            id: userId,
            email: client.email,
            nom: client.contact_nom,
            prenom: client.contact_prenom,
            role: 'client',
            actif: true,
          })

          // Lier l'utilisateur au client
          await adminClient.from('user_societes').insert({
            user_id: userId,
            client_id: clientId,
            is_primary: true,
          })

          console.log(`Compte client créé pour ${client.email}`)
        }
      } catch (userError) {
        console.error('Erreur création compte client:', userError)
        // Ne pas bloquer la soumission si la création du compte échoue
      }
    }

    // 2. Mettre à jour le client
    const { error: updateError } = await adminClient
      .from('clients')
      .update({
        statut_formulaire: 'formulaire_complete',
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId)

    if (updateError) {
      console.error('Erreur update client:', updateError)
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour du client' },
        { status: 500 }
      )
    }

    // 3. Créer la livraison
    const { error: livraisonError } = await adminClient.from('livraisons').insert({
      client_id: clientId,
      mode_livraison: modeLivraison,
      depot_id: depotId,
      adresse_livraison_ligne1: modeLivraison === 'domicile' ? data.adresseLivraison?.ligne1 : null,
      adresse_livraison_ligne2: modeLivraison === 'domicile' ? data.adresseLivraison?.ligne2 : null,
      adresse_livraison_cp: modeLivraison === 'domicile' ? data.adresseLivraison?.codePostal : null,
      adresse_livraison_ville: modeLivraison === 'domicile' ? data.adresseLivraison?.ville : null,
      document_identite_type: data.documentIdentite?.type,
      document_identite_url: data.documentIdentite?.url,
      document_identite_nom_fichier: data.documentIdentite?.nomFichier,
      statut: 'en_attente',
    })

    if (livraisonError) {
      console.error('Erreur création livraison:', livraisonError)
      return NextResponse.json(
        { error: 'Erreur lors de la création de la livraison' },
        { status: 500 }
      )
    }

    // 4. Logger l'étape formulaire
    await adminClient.from('formulaires_log').insert({
      client_id: clientId,
      etape_numero: 6,
      etape_nom: 'confirmation',
      donnees_saisies: { ...data, password: '[REDACTED]' }, // Ne pas logger le mot de passe
    })

    // 5. Créer transition workflow
    await adminClient.from('workflow_transitions').insert({
      entity_type: 'client',
      entity_id: clientId,
      statut_avant: 'formulaire_envoye',
      statut_apres: 'formulaire_complete',
      raison: 'Formulaire complété par le client',
    })

    // 6. Envoyer l'email récapitulatif
    const clientName = client.contact_prenom && client.contact_nom
      ? `${client.contact_prenom} ${client.contact_nom}`
      : client.raison_sociale

    try {
      // Si mode retrait, récupérer les infos du dépôt
      let depotRetraitInfo = null
      if (modeLivraison === 'retrait' && client.depot_retrait_id) {
        const { data: depot } = await adminClient
          .from('depots')
          .select('nom, adresse, code_postal, ville')
          .eq('id', client.depot_retrait_id)
          .single()
        if (depot) {
          depotRetraitInfo = {
            nom: depot.nom,
            adresse: depot.adresse,
            codePostal: depot.code_postal,
            ville: depot.ville,
          }
        }
      }

      await sendFormulaireRecapEmail(client.email, clientName, {
        raisonSociale: client.raison_sociale,
        siret: data.siret || '',
        modeLivraison: modeLivraison as 'domicile' | 'retrait',
        adresseLivraison: modeLivraison === 'domicile' ? data.adresseLivraison : undefined,
        depotRetrait: depotRetraitInfo || undefined,
        userCreated: !!userId,
      })
      console.log(`Email récapitulatif envoyé à ${client.email}`)
    } catch (emailError) {
      console.error('Erreur envoi email récapitulatif:', emailError)
      // Ne pas bloquer si l'email échoue
    }

    // 7. Sync vers Monday - mettre le statut "FORMULAIRE VALIDÉ"
    if (client.monday_item_id && isMondayConfigured()) {
      try {
        await syncClientToMonday(
          { monday_item_id: client.monday_item_id, statut_commercial: 'formulaire_valide' },
          ['statut_commercial']
        )
        console.log(`Statut FORMULAIRE VALIDÉ sync vers Monday pour ${client.raison_sociale}`)
      } catch (syncError) {
        console.error('Erreur sync Monday:', syncError)
        // Ne pas bloquer si la sync échoue
      }
    }

    return NextResponse.json({
      success: true,
      modeLivraison,
      depotId,
      userCreated: !!userId,
    })
  } catch (error: any) {
    console.error('Erreur API submit:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
