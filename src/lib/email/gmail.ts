import nodemailer from 'nodemailer'
import { google } from 'googleapis'
import { getTenantConfig } from '@/lib/tenants'

async function createTransporter() {
  // Mode 1 : SMTP direct (Microsoft 365, etc.)
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || process.env.GMAIL_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    } as nodemailer.TransportOptions)
  }

  // Mode 2 : Gmail OAuth2 (ECO-VOLT)
  const OAuth2 = google.auth.OAuth2
  const oauth2Client = new OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  )
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  })

  // Timeout sur getAccessToken pour éviter un hang infini
  const accessToken = await Promise.race([
    oauth2Client.getAccessToken(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('OAuth2 getAccessToken timeout (10s)')), 10000)
    ),
  ])

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token || undefined,
    },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  } as nodemailer.TransportOptions)
}

interface EmailOptions {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from }: EmailOptions) {
  try {
    const tenant = getTenantConfig()
    const transporter = await createTransporter()

    const mailOptions = {
      from: from || `${tenant.name} <${process.env.SMTP_USER || process.env.GMAIL_USER}>`,
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

/**
 * Génère le bloc rappel d'identité standard (style amber warning)
 */
function getIdentityReminderHtml(clientName: string, isRetrait: boolean): string {
  const action = isRetrait ? 'du retrait' : 'de la livraison'
  return `
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 30px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: bold; line-height: 1.5;">
        ⚠️ Rappel important
      </p>
      <p style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; line-height: 1.5;">
        C'est bien <strong>Monsieur/Madame ${clientName}</strong> qui réceptionnera le(s) vélo(s) cargo.
      </p>
      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
        Un <strong>justificatif d'identité valide</strong> sera obligatoire lors ${action}.
      </p>
    </div>
  `
}

/**
 * Génère le header HTML commun pour tous les emails
 */
function getEmailHeader(tenant: ReturnType<typeof getTenantConfig>): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${tenant.branding.colors.secondary}; border-radius: 12px 12px 0 0; padding: 30px;">
      <tr>
        <td align="center">
          <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">
            ${tenant.branding.emailEmoji} ${tenant.name}
          </h1>
          <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
            ${tenant.tagline}
          </p>
        </td>
      </tr>
    </table>
  `
}

/**
 * Génère le footer HTML commun pour tous les emails
 */
function getEmailFooter(tenant: ReturnType<typeof getTenantConfig>): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
      <tr>
        <td align="center">
          <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
            ${tenant.texts.copyright}
          </p>
        </td>
      </tr>
    </table>
  `
}

/**
 * Génère la section contact pour les emails
 */
function getContactSection(tenant: ReturnType<typeof getTenantConfig>): string {
  return `
    <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
      En cas de question, contactez-nous à <a href="mailto:${tenant.email}" style="color: ${tenant.branding.colors.secondary};">${tenant.email}</a>
    </p>
  `
}

/**
 * Génère la section contact complète avec téléphone
 */
function getFullContactSection(tenant: ReturnType<typeof getTenantConfig>): string {
  return `
    <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
      En cas de question, contactez-nous à <a href="mailto:${tenant.email}" style="color: ${tenant.branding.colors.secondary};">${tenant.email}</a> ou par téléphone au <strong>${tenant.phoneFormatted}</strong>
    </p>
  `
}

// Email d'envoi du code de validation à 6 chiffres
export async function sendCodeValidationEmail(
  clientEmail: string,
  clientName: string,
  code: string
) {
  const tenant = getTenantConfig()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.name} - Votre code de validation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        ${getEmailHeader(tenant)}

        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px;">
                Bonjour ${clientName},
              </h2>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Voici votre <strong>code de validation personnel</strong> pour la livraison de votre vélo cargo à assistance électrique :
              </p>

              <!-- Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" style="background-color: ${tenant.branding.colors.secondaryDark}; padding: 24px 48px; border-radius: 12px;">
                          <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 8px;">
                            ${code}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 10px 0; color: #92400e; font-size: 14px; font-weight: bold; line-height: 1.5;">
                  ⚠️ CONSERVEZ PRÉCIEUSEMENT CE CODE — NE SUPPRIMEZ PAS CET EMAIL
                </p>
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  Vous allez recevoir un <strong>second email</strong> contenant un lien vers un formulaire de livraison. Ce code vous sera demandé pour y accéder et valider vos coordonnées de livraison.
                </p>
                <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  Ce code est personnel et confidentiel. Ne le partagez avec personne.
                </p>
              </div>

              <p style="margin: 30px 0 0 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>Prochaine étape :</strong> vous recevrez prochainement un second email avec le lien vers votre formulaire de livraison. Vous aurez besoin de ce code pour y accéder.
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              ${getContactSection(tenant)}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: clientEmail,
    subject: `${tenant.name} - Votre code de validation personnel`,
    html,
  })
}

export async function sendFormulaireLinkEmail(
  clientEmail: string,
  clientName: string,
  formulaireLink: string,
  validationCode?: string
) {
  const tenant = getTenantConfig()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.name} - Votre formulaire de livraison</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        ${getEmailHeader(tenant)}

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

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Pour finaliser votre livraison, veuillez remplir le formulaire ci-dessous avec vos informations de livraison.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${formulaireLink}"
                       style="display: inline-block; background-color: ${tenant.branding.colors.secondary}; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Remplir le formulaire
                    </a>
                  </td>
                </tr>
              </table>

              ${validationCode ? `
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 0 0 20px 0; text-align: center;">
                <p style="margin: 0; color: #64748b; font-size: 13px;">Code de validation : <strong style="color: #18181b; font-size: 18px; letter-spacing: 2px;">${validationCode}</strong></p>
              </div>
              ` : ''}

              <p style="margin: 0 0 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                <a href="${formulaireLink}" style="color: ${tenant.branding.colors.secondary}; word-break: break-all;">
                  ${formulaireLink}
                </a>
              </p>

              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
                Ce lien est personnel et unique. Veuillez ne pas le partager.<br>
                ${getContactSection(tenant)}
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: clientEmail,
    subject: `${tenant.name} - Formulaire de livraison de votre vélo cargo`,
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
  complementAdresse?: string
  preferencesLivraison?: string
  userCreated: boolean
}

export async function sendFormulaireRecapEmail(
  clientEmail: string,
  clientName: string,
  data: RecapEmailData
) {
  const tenant = getTenantConfig()

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
  <title>${tenant.name} - Confirmation de votre demande</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        ${getEmailHeader(tenant)}

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
                Nous avons bien reçu votre demande de ${data.modeLivraison === 'retrait' ? 'retrait' : 'livraison'} de vélo cargo électrique. Voici le récapitulatif :
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

              ${data.complementAdresse ? `
              <!-- Complément d'adresse -->
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin-top: 12px;">
                <p style="margin: 0 0 4px 0; color: #52525b; font-weight: 600; font-size: 14px;">
                  Complément d'adresse
                </p>
                <p style="margin: 0; color: #18181b; font-size: 14px; line-height: 1.5;">
                  ${data.complementAdresse}
                </p>
              </div>
              ` : ''}

              ${data.preferencesLivraison ? `
              <!-- Préférences de livraison -->
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin-top: 12px;">
                <p style="margin: 0 0 4px 0; color: #52525b; font-weight: 600; font-size: 14px;">
                  Préférences de livraison
                </p>
                <p style="margin: 0; color: #18181b; font-size: 14px; line-height: 1.5;">
                  ${data.preferencesLivraison}
                </p>
              </div>
              ` : ''}

              ${accountSection}

              <p style="margin: 30px 0 0 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>Prochaines étapes :</strong><br>
                Notre équipe va traiter votre demande et vous contactera prochainement pour ${data.modeLivraison === 'retrait' ? 'convenir du retrait' : 'programmer la livraison'} de votre vélo cargo.
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              ${getFullContactSection(tenant)}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: clientEmail,
    subject: `${tenant.name} - Confirmation de votre demande de vélo cargo`,
    html,
  })
}

// Email d'invitation pour un nouvel utilisateur admin/agent
export async function sendUserInvitationEmail(
  userEmail: string,
  userName: string,
  role: string,
  loginUrl: string,
  password: string
) {
  const tenant = getTenantConfig()

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Administrateur',
    agent_secteur: 'Agent Secteur',
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
  <title>${tenant.name} - Bienvenue sur la plateforme</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${tenant.branding.colors.secondary}; border-radius: 12px 12px 0 0; padding: 30px;">
          <tr>
            <td align="center">
              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">
                ${tenant.branding.emailEmoji} ${tenant.name}
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
                Un compte a été créé pour vous sur la plateforme ${tenant.name} avec le rôle <strong style="color: ${tenant.branding.colors.secondary};">${roleLabel}</strong>.
              </p>

              <p style="margin: 0 0 10px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Voici vos identifiants de connexion :
              </p>

              <!-- Credentials box -->
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin: 0 0 30px 0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 6px 0; color: #71717a; font-size: 14px;">Email :</td>
                    <td style="padding: 6px 0; color: #18181b; font-size: 14px; font-weight: 600;">${userEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #71717a; font-size: 14px;">Mot de passe :</td>
                    <td style="padding: 6px 0; color: #18181b; font-size: 14px; font-weight: 600; font-family: monospace; letter-spacing: 1px;">${password}</td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}"
                       style="display: inline-block; background-color: ${tenant.branding.colors.secondary}; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Se connecter
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 30px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  <strong>⚠️ Important :</strong> Nous vous recommandons de changer votre mot de passe après votre première connexion. Si vous oubliez votre mot de passe, utilisez la fonction "Mot de passe oublié" sur la page de connexion.
                </p>
              </div>

              <p style="margin: 30px 0 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                <a href="${loginUrl}" style="color: ${tenant.branding.colors.secondary}; word-break: break-all;">
                  ${loginUrl}
                </a>
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
                Votre identifiant de connexion : <strong>${userEmail}</strong><br><br>
                En cas de question, contactez votre administrateur ou écrivez à <a href="mailto:${tenant.email}" style="color: ${tenant.branding.colors.secondary};">${tenant.email}</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: userEmail,
    subject: `${tenant.name} - Bienvenue ! Créez votre mot de passe`,
    html,
  })
}

// Email d'envoi du formulaire de choix de créneau de retrait au dépôt
export async function sendFormulaireLivraisonEmail(params: {
  to: string
  clientName: string
  depotName: string
  depotAddress?: string
  depotContact?: string
  modeLivraison: string
  formulaireUrl: string
  tenantName: string
}) {
  const tenant = getTenantConfig()
  const { to, clientName, depotName, depotAddress, depotContact, modeLivraison, formulaireUrl } = params

  const isRetrait = modeLivraison === 'point_relais' || modeLivraison === 'retrait'
  const modeLabel = isRetrait ? 'retrait' : 'livraison'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.name} - Choisissez votre créneau de ${modeLabel}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        ${getEmailHeader(tenant)}

        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px;">
                Bonjour ${clientName},
              </h2>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Bonne nouvelle ! Votre vélo cargo à assistance électrique est disponible à votre point de retrait.
              </p>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Pour finaliser le retrait, veuillez choisir un créneau qui vous convient en cliquant sur le bouton ci-dessous. Seuls les créneaux disponibles sur votre point de retrait sont proposés.
              </p>

              <!-- Depot info -->
              <div style="background-color: #f0f9ff; border-radius: 8px; padding: 16px; margin: 0 0 30px 0;">
                <p style="margin: 0 0 8px 0; color: #0369a1; font-weight: 600; font-size: 14px;">
                  📍 Votre point de retrait
                </p>
                <p style="margin: 0 0 4px 0; color: #0369a1; font-size: 14px; font-weight: 600;">
                  ${depotName}
                </p>
                ${depotAddress ? `<p style="margin: 0 0 4px 0; color: #0369a1; font-size: 14px;">${depotAddress}</p>` : ''}
                ${depotContact ? `<p style="margin: 0; color: #0369a1; font-size: 13px;">${depotContact}</p>` : ''}
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${formulaireUrl}"
                       style="display: inline-block; background-color: ${tenant.branding.colors.secondary}; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Choisir mon créneau de retrait
                    </a>
                  </td>
                </tr>
              </table>

              ${getIdentityReminderHtml(clientName, true)}

              <p style="margin: 30px 0 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                <a href="${formulaireUrl}" style="color: ${tenant.branding.colors.secondary}; word-break: break-all;">
                  ${formulaireUrl}
                </a>
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
                Ce lien est personnel et unique. Veuillez ne pas le partager.<br>
                ${getContactSection(tenant)}
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to,
    subject: `${tenant.name} - Choisissez votre créneau de retrait`,
    html,
  })
}

/**
 * Email informatif livraison à domicile — le client est informé que son vélo est prêt
 * et qu'il sera contacté par un livreur ou recevra un email avec les infos de livraison
 */
export async function sendMailLivraisonEmail(data: {
  to: string
  clientName: string
  raisonSociale: string
  tenantId?: string
}): Promise<boolean> {
  const tenant = getTenantConfig()
  const { to, clientName, raisonSociale } = data

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.name} - Votre vélo cargo est prêt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        ${getEmailHeader(tenant)}

        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; font-size: 32px;">
                  🚲
                </div>
              </div>

              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px; text-align: center;">
                Votre vélo cargo est prêt !
              </h2>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Bonjour ${clientName},
              </p>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Nous avons le plaisir de vous informer que votre vélo cargo à assistance électrique est prêt pour la livraison au nom de <strong>${raisonSociale}</strong>.
              </p>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Vous serez prochainement contacté par l'un de nos livreurs pour convenir des modalités de livraison, ou vous recevrez un email contenant les informations et le créneau de livraison.
              </p>

              <div style="background-color: #f0fdf4; border-radius: 8px; padding: 16px; margin: 0 0 20px 0;">
                <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.6;">
                  <strong>🚚 Livraison à domicile</strong><br>
                  Notre équipe prendra contact avec vous dans les prochains jours pour fixer la date et le créneau de livraison qui vous convient.
                </p>
              </div>

              ${getIdentityReminderHtml(clientName, false)}

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              ${getFullContactSection(tenant)}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  try {
    await sendEmail({
      to,
      subject: `${tenant.name} - Votre vélo cargo est prêt — informations de livraison`,
      html,
    })
    return true
  } catch (error) {
    console.error('Erreur sendMailLivraisonEmail:', error)
    return false
  }
}

/**
 * Email de confirmation de planning — rappel RDV avec date, créneau et identité
 * Envoyé aux clients au statut "programmé" pour confirmer leur rendez-vous
 */
export async function sendMailPlanningEmail(data: {
  to: string
  clientName: string
  raisonSociale: string
  dateLivraison: string
  creneauHoraire: string
  nomReceptionnaire: string
  tenantId?: string
}): Promise<boolean> {
  const tenant = getTenantConfig()
  const { to, clientName, raisonSociale, dateLivraison, creneauHoraire, nomReceptionnaire } = data

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.name} - Confirmation de votre rendez-vous</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        ${getEmailHeader(tenant)}

        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="display: inline-block; width: 64px; height: 64px; background-color: #dbeafe; border-radius: 50%; line-height: 64px; font-size: 32px;">
                  📅
                </div>
              </div>

              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px; text-align: center;">
                Votre rendez-vous est confirmé !
              </h2>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Bonjour ${clientName},
              </p>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Nous vous confirmons votre rendez-vous de livraison de vélo cargo électrique au nom de <strong>${raisonSociale}</strong>.
              </p>

              <!-- Bloc info RDV -->
              <div style="background-color: #eff6ff; border-radius: 12px; padding: 20px; margin: 25px 0; border-left: 4px solid ${tenant.branding.colors.secondary};">
                <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                  Détails du rendez-vous
                </p>
                <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold; color: #1e40af;">
                  📅 ${dateLivraison}
                </p>
                <p style="margin: 0 0 8px 0; font-size: 16px; color: #3b82f6;">
                  🕐 Créneau : ${creneauHoraire}
                </p>
                <p style="margin: 0; font-size: 14px; color: #64748b;">
                  👤 Réceptionnaire : <strong>${nomReceptionnaire}</strong>
                </p>
              </div>

              ${getIdentityReminderHtml(nomReceptionnaire, false)}

              <p style="margin: 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                En cas d'annulation ou de modification, n'hésitez pas à contacter notre service dans les meilleurs délais.
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">

              ${getFullContactSection(tenant)}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  try {
    await sendEmail({
      to,
      subject: `${tenant.name} - Confirmation de votre rendez-vous de livraison du ${dateLivraison}`,
      html,
    })
    return true
  } catch (error) {
    console.error('Erreur sendMailPlanningEmail:', error)
    return false
  }
}

/**
 * Email de confirmation de créneau — retrait dépôt ou livraison à domicile
 * Anciennement sendTourneeConfirmationEmail
 */
export async function sendConfirmationCreneauEmail({
  to,
  clientName,
  date,
  creneauDebut,
  creneauFin,
  confirmUrl,
  isRetrait = false,
  depotName,
  depotAddress,
  depotContact,
  token,
}: {
  to: string
  clientName: string
  date: string
  creneauDebut: string
  creneauFin: string
  confirmUrl: string
  isRetrait?: boolean
  depotName?: string
  depotAddress?: string
  depotContact?: string
  token?: string
}) {
  const tenant = getTenantConfig()
  const modeLabel = isRetrait ? 'retrait' : 'livraison'
  const baseUrl = tenant.url || process.env.NEXT_PUBLIC_APP_URL || ''
  const cancelUrl = `${baseUrl}/api/livraisons/cancel-creneau?token=${token || ''}`
  const confirmCreneauUrl = `${baseUrl}/livraisons/confirm-creneau?token=${token || ''}`

  const dateFormatted = (() => {
    try {
      return new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    } catch {
      return date
    }
  })()

  const depotSection = isRetrait && depotName ? `
    <div style="background-color: #f0f9ff; border-radius: 8px; padding: 16px; margin-bottom: 25px;">
      <p style="margin: 0 0 8px 0; color: #0369a1; font-weight: 600; font-size: 14px;">
        📍 Votre point de retrait
      </p>
      <p style="margin: 0 0 4px 0; color: #0369a1; font-size: 14px; font-weight: 600;">
        ${depotName}
      </p>
      ${depotAddress ? `<p style="margin: 0 0 4px 0; color: #0369a1; font-size: 14px;">${depotAddress}</p>` : ''}
      ${depotContact ? `<p style="margin: 0; color: #0369a1; font-size: 13px;">${depotContact}</p>` : ''}
    </div>
  ` : ''

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <tr>
      <td>
        ${getEmailHeader(tenant)}

        <div style="padding: 30px;">
          <h2 style="margin: 0 0 15px 0; color: #1f2937; font-size: 22px;">
            Votre ${modeLabel} est confirmé${isRetrait ? '' : 'e'} !
          </h2>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Bonjour <strong>${clientName}</strong>,
          </p>

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Votre vélo cargo est prêt ! Voici le créneau de ${modeLabel} confirmé :
          </p>

          <div style="background-color: #eff6ff; border-radius: 12px; padding: 20px; margin-bottom: 25px; border-left: 4px solid ${tenant.branding.colors.primary};">
            <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
              ${isRetrait ? 'Retrait au dépôt' : 'Livraison à domicile'}
            </p>
            <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold; color: #1e40af;">
              📅 ${dateFormatted}
            </p>
            <p style="margin: 0; font-size: 16px; color: #3b82f6;">
              🕐 Entre ${creneauDebut} et ${creneauFin}
            </p>
          </div>

          ${depotSection}

          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
            Merci de confirmer votre présence en cliquant sur le bouton ci-dessous :
          </p>

          <div style="text-align: center; margin-bottom: 12px;">
            <a href="${confirmCreneauUrl}" style="display: inline-block; background-color: #16a34a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
              Je confirme ma présence
            </a>
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <a href="${cancelUrl}" style="display: inline-block; padding: 12px 24px; background-color: #ef4444; color: white; border: 1px solid #dc2626; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Je refuse ce créneau
            </a>
          </div>

          ${getIdentityReminderHtml(clientName, isRetrait)}

          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px;">
            Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
            <a href="${confirmCreneauUrl}" style="color: #6b7280; word-break: break-all;">${confirmCreneauUrl}</a>
          </p>
        </div>

        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to,
    subject: `${tenant.name} - Confirmation de votre ${modeLabel} du ${dateFormatted}`,
    html,
  })
}

/**
 * @deprecated Utiliser sendConfirmationCreneauEmail à la place
 */
export async function sendTourneeConfirmationEmail(params: {
  to: string
  clientName: string
  date: string
  creneauDebut: string
  creneauFin: string
  confirmUrl: string
}) {
  return sendConfirmationCreneauEmail({ ...params, isRetrait: false })
}

/**
 * Envoie le bon de livraison/retrait par email au client avec le PDF en PJ
 */
export async function sendBonLivraisonEmail(params: {
  to: string
  beneficiaire: string
  raisonSociale: string
  modeLivraison: string
  pdfBuffer: Buffer
}) {
  const { to, beneficiaire, raisonSociale, modeLivraison, pdfBuffer } = params
  const tenant = getTenantConfig()
  const transporter = await createTransporter()
  const typeDoc = modeLivraison === 'retrait' ? 'retrait' : 'livraison'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.name} - Bon de ${typeDoc}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        ${getEmailHeader(tenant)}
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px;">
                Bon de ${typeDoc}
              </h2>
              <p style="margin: 0 0 16px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Bonjour ${beneficiaire},
              </p>
              <p style="margin: 0 0 16px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Veuillez trouver ci-joint votre attestation de ${typeDoc} pour <strong>${raisonSociale}</strong>.
              </p>
              <p style="margin: 0 0 24px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Conservez ce document comme justificatif.
              </p>
              ${getContactSection(tenant)}
            </td>
          </tr>
        </table>
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
  `

  const result = await transporter.sendMail({
    from: `${tenant.name} <${process.env.SMTP_USER || process.env.GMAIL_USER}>`,
    to,
    subject: `Votre bon de ${typeDoc} — ${raisonSociale}`,
    html,
    attachments: [{
      filename: `bon-${typeDoc}-${raisonSociale.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  })

  console.log('Bon de livraison envoyé:', result.messageId)
  return { success: true, messageId: result.messageId }
}
