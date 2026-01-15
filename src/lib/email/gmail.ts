import nodemailer from 'nodemailer'
import { google } from 'googleapis'

const OAuth2 = google.auth.OAuth2

const oauth2Client = new OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
)

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
})

async function createTransporter() {
  const accessToken = await oauth2Client.getAccessToken()

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token || undefined,
    },
  })

  return transporter
}

interface EmailOptions {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from }: EmailOptions) {
  try {
    const transporter = await createTransporter()

    const mailOptions = {
      from: from || `ECO-VOLT <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    }

    const result = await transporter.sendMail(mailOptions)
    console.log('Email envoyé:', result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error('Erreur envoi email:', error)
    throw error
  }
}

// Email d'envoi du code de validation à 6 chiffres
export async function sendCodeValidationEmail(
  clientEmail: string,
  clientName: string,
  code: string
) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ECO-VOLT - Votre code de validation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #16a34a; border-radius: 12px 12px 0 0; padding: 30px;">
          <tr>
            <td align="center">
              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">
                ⚡ ECO-VOLT
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                Vélos cargo électriques
              </p>
            </td>
          </tr>
        </table>

        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px;">
                Bonjour ${clientName},
              </h2>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Bienvenue chez ECO-VOLT ! Votre compte a été créé avec succès.
              </p>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Voici votre <strong>code de validation personnel</strong> à conserver précieusement :
              </p>

              <!-- Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 24px 48px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                      <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; color: white; letter-spacing: 8px;">
                        ${code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  <strong>⚠️ Important :</strong> Ce code est personnel et confidentiel. Il vous sera demandé lors du remplissage du formulaire de livraison pour valider votre identité. Ne le partagez avec personne.
                </p>
              </div>

              <p style="margin: 30px 0 0 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Vous recevrez prochainement un email avec le lien vers le formulaire de livraison.
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
                En cas de question, contactez-nous à <a href="mailto:admin@eco-volt.fr" style="color: #16a34a;">admin@eco-volt.fr</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                © 2026 ECO-VOLT - Tous droits réservés
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: clientEmail,
    subject: 'ECO-VOLT - Votre code de validation personnel',
    html,
  })
}

export async function sendFormulaireLinkEmail(
  clientEmail: string,
  clientName: string,
  formulaireLink: string
) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ECO-VOLT - Votre formulaire de livraison</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #16a34a; border-radius: 12px 12px 0 0; padding: 30px;">
          <tr>
            <td align="center">
              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">
                ⚡ ECO-VOLT
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                Vélos cargo électriques
              </p>
            </td>
          </tr>
        </table>

        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px;">
                Bonjour ${clientName},
              </h2>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Nous avons le plaisir de vous informer que votre commande de vélo cargo électrique est en cours de traitement.
              </p>

              <p style="margin: 0 0 30px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Pour finaliser votre livraison, veuillez remplir le formulaire ci-dessous avec vos informations de livraison :
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${formulaireLink}"
                       style="display: inline-block; background-color: #16a34a; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Remplir le formulaire
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                <a href="${formulaireLink}" style="color: #16a34a; word-break: break-all;">
                  ${formulaireLink}
                </a>
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
                Ce lien est personnel et unique. Veuillez ne pas le partager.<br>
                En cas de question, contactez-nous à <a href="mailto:admin@eco-volt.fr" style="color: #16a34a;">admin@eco-volt.fr</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                © 2026 ECO-VOLT - Tous droits réservés
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: clientEmail,
    subject: 'ECO-VOLT - Formulaire de livraison de votre vélo cargo',
    html,
  })
}

interface RecapEmailData {
  raisonSociale: string
  siret: string
  modeLivraison: 'domicile' | 'retrait'
  adresseLivraison?: {
    ligne1: string
    ligne2?: string
    codePostal: string
    ville: string
  }
  depotRetrait?: {
    nom: string
    adresse: string
    codePostal: string
    ville: string
  }
  userCreated: boolean
}

export async function sendFormulaireRecapEmail(
  clientEmail: string,
  clientName: string,
  data: RecapEmailData
) {
  const livraisonDetails = data.modeLivraison === 'domicile'
    ? `
      <div style="background-color: #f0fdf4; border-radius: 8px; padding: 16px;">
        <p style="margin: 0 0 8px 0; color: #166534; font-weight: 600; font-size: 14px;">
          Livraison à domicile
        </p>
        <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
          ${data.adresseLivraison?.ligne1 || ''}<br>
          ${data.adresseLivraison?.ligne2 ? data.adresseLivraison.ligne2 + '<br>' : ''}
          ${data.adresseLivraison?.codePostal || ''} ${data.adresseLivraison?.ville || ''}
        </p>
      </div>
    `
    : `
      <div style="background-color: #f0f9ff; border-radius: 8px; padding: 16px;">
        <p style="margin: 0 0 8px 0; color: #0369a1; font-weight: 600; font-size: 14px;">
          Retrait en point relais
        </p>
        <p style="margin: 0; color: #0369a1; font-size: 14px; line-height: 1.5;">
          ${data.depotRetrait?.nom || ''}<br>
          ${data.depotRetrait?.adresse || ''}<br>
          ${data.depotRetrait?.codePostal || ''} ${data.depotRetrait?.ville || ''}
        </p>
      </div>
    `

  const accountSection = data.userCreated
    ? `
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
          <strong>Votre compte client a été créé !</strong><br>
          Vous pouvez vous connecter à votre espace client avec l'adresse email <strong>${clientEmail}</strong> et le mot de passe que vous avez choisi.
        </p>
      </div>
    `
    : ''

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ECO-VOLT - Confirmation de votre demande</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #16a34a; border-radius: 12px 12px 0 0; padding: 30px;">
          <tr>
            <td align="center">
              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">
                ⚡ ECO-VOLT
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                Vélos cargo électriques
              </p>
            </td>
          </tr>
        </table>

        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; font-size: 32px;">
                  ✓
                </div>
              </div>

              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px; text-align: center;">
                Demande enregistrée avec succès !
              </h2>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Bonjour ${clientName},
              </p>

              <p style="margin: 0 0 30px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Nous avons bien reçu votre demande de livraison de vélo cargo électrique. Voici le récapitulatif de votre commande :
              </p>

              <!-- Récap société -->
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px 0; color: #52525b; font-weight: 600; font-size: 14px;">
                  Société
                </p>
                <p style="margin: 0; color: #18181b; font-size: 16px;">
                  ${data.raisonSociale}
                </p>
                <p style="margin: 4px 0 0 0; color: #71717a; font-size: 14px;">
                  SIRET: ${data.siret}
                </p>
              </div>

              <!-- Récap livraison -->
              ${livraisonDetails}

              ${accountSection}

              <p style="margin: 30px 0 0 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>Prochaines étapes :</strong><br>
                Notre équipe va traiter votre demande et vous contactera prochainement pour programmer la livraison de votre vélo cargo.
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
                En cas de question, contactez-nous à <a href="mailto:admin@eco-volt.fr" style="color: #16a34a;">admin@eco-volt.fr</a> ou par téléphone au <strong>07 57 99 11 25</strong>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                © 2026 ECO-VOLT - Tous droits réservés
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: clientEmail,
    subject: 'ECO-VOLT - Confirmation de votre demande de vélo cargo',
    html,
  })
}

// Email d'invitation pour un nouvel utilisateur admin/agent
export async function sendUserInvitationEmail(
  userEmail: string,
  userName: string,
  role: string,
  resetPasswordLink: string
) {
  const roleLabels: Record<string, string> = {
    admin_general: 'Administrateur Général',
    admin_regional: 'Administrateur Régional',
    agent_regional: 'Agent Régional',
    agent_depot: 'Agent Dépôt',
    livreur: 'Livreur',
    client: 'Client',
  }

  const roleLabel = roleLabels[role] || role

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ECO-VOLT - Bienvenue sur la plateforme</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #16a34a; border-radius: 12px 12px 0 0; padding: 30px;">
          <tr>
            <td align="center">
              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">
                ⚡ ECO-VOLT
              </h1>
              <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                Plateforme de gestion
              </p>
            </td>
          </tr>
        </table>

        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px;">
                Bienvenue ${userName} !
              </h2>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Un compte a été créé pour vous sur la plateforme ECO-VOLT avec le rôle <strong style="color: #16a34a;">${roleLabel}</strong>.
              </p>

              <p style="margin: 0 0 30px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Pour activer votre compte et créer votre mot de passe, cliquez sur le bouton ci-dessous :
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetPasswordLink}"
                       style="display: inline-block; background-color: #16a34a; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Créer mon mot de passe
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 30px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  <strong>⚠️ Important :</strong> Ce lien est valable pendant 24 heures. Passé ce délai, vous devrez utiliser la fonction "Mot de passe oublié" pour en obtenir un nouveau.
                </p>
              </div>

              <p style="margin: 30px 0 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                <a href="${resetPasswordLink}" style="color: #16a34a; word-break: break-all;">
                  ${resetPasswordLink}
                </a>
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
                Votre identifiant de connexion : <strong>${userEmail}</strong><br><br>
                En cas de question, contactez votre administrateur ou écrivez à <a href="mailto:admin@eco-volt.fr" style="color: #16a34a;">admin@eco-volt.fr</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
          <tr>
            <td align="center">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                © 2026 ECO-VOLT - Tous droits réservés
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: userEmail,
    subject: 'ECO-VOLT - Bienvenue ! Créez votre mot de passe',
    html,
  })
}
