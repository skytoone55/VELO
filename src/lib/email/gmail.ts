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
    })
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

  const accessToken = await oauth2Client.getAccessToken()

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
  })
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
    console.log('Email envoy\u00e9:', result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error('Erreur envoi email:', error)
    throw error
  }
}

/**
 * G\u00e9n\u00e8re le header HTML commun pour tous les emails
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
 * G\u00e9n\u00e8re le footer HTML commun pour tous les emails
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
 * G\u00e9n\u00e8re la section contact pour les emails
 */
function getContactSection(tenant: ReturnType<typeof getTenantConfig>): string {
  return `
    <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
      En cas de question, contactez-nous \u00e0 <a href="mailto:${tenant.email}" style="color: ${tenant.branding.colors.secondary};">${tenant.email}</a>
    </p>
  `
}

/**
 * G\u00e9n\u00e8re la section contact compl\u00e8te avec t\u00e9l\u00e9phone
 */
function getFullContactSection(tenant: ReturnType<typeof getTenantConfig>): string {
  return `
    <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
      En cas de question, contactez-nous \u00e0 <a href="mailto:${tenant.email}" style="color: ${tenant.branding.colors.secondary};">${tenant.email}</a> ou par t\u00e9l\u00e9phone au <strong>${tenant.phoneFormatted}</strong>
    </p>
  `
}

// Email d'envoi du code de validation \u00e0 6 chiffres
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
                ${tenant.texts.welcomeMessage} Votre compte a \u00e9t\u00e9 cr\u00e9\u00e9 avec succ\u00e8s.
              </p>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Voici votre <strong>code de validation personnel</strong> :
              </p>

              <!-- Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: linear-gradient(135deg, ${tenant.branding.colors.secondary} 0%, ${tenant.branding.colors.secondaryDark} 100%); padding: 24px 48px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                      <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; color: white; letter-spacing: 8px;">
                        ${code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 10px 0; color: #92400e; font-size: 14px; font-weight: bold; line-height: 1.5;">
                  \u26a0\ufe0f CONSERVEZ PR\u00c9CIEUSEMENT CE CODE \u2014 NE SUPPRIMEZ PAS CET EMAIL
                </p>
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  Vous allez recevoir un <strong>second email</strong> contenant un lien vers un formulaire de livraison. Ce code vous sera demand\u00e9 pour y acc\u00e9der et valider vos coordonn\u00e9es de livraison.
                </p>
                <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  Ce code est personnel et confidentiel. Ne le partagez avec personne.
                </p>
              </div>

              <p style="margin: 30px 0 0 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>Prochaine \u00e9tape :</strong> vous recevrez prochainement un second email avec le lien vers votre formulaire de livraison. Vous aurez besoin de ce code pour y acc\u00e9der.
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
                Nous avons le plaisir de vous informer que votre commande de v\u00e9lo cargo \u00e9lectrique est en cours de traitement.
              </p>

              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Pour finaliser votre livraison, veuillez remplir le formulaire ci-dessous avec vos informations de livraison.
              </p>

              ${validationCode ? `
              <div style="background-color: #f0f9ff; border: 2px solid ${tenant.branding.colors.secondary}; border-radius: 8px; padding: 20px; margin: 0 0 30px 0; text-align: center;">
                <p style="margin: 0 0 8px 0; color: #52525b; font-size: 14px;">Votre code de validation PPE :</p>
                <p style="margin: 0; color: #18181b; font-size: 28px; font-weight: 700; letter-spacing: 4px;">${validationCode}</p>
                <p style="margin: 8px 0 0 0; color: #71717a; font-size: 12px;">Ce code vous sera demand\u00e9 \u00e0 la premi\u00e8re \u00e9tape du formulaire</p>
              </div>
              ` : ''}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${formulaireLink}"
                       style="display: inline-block; background-color: ${tenant.branding.colors.secondary}; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Remplir le formulaire
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                <a href="${formulaireLink}" style="color: ${tenant.branding.colors.secondary}; word-break: break-all;">
                  ${formulaireLink}
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
    to: clientEmail,
    subject: `${tenant.name} - Formulaire de livraison de votre v\u00e9lo cargo`,
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
  const tenant = getTenantConfig()

  const livraisonDetails = data.modeLivraison === 'domicile'
    ? `
      <div style="background-color: #f0fdf4; border-radius: 8px; padding: 16px;">
        <p style="margin: 0 0 8px 0; color: #166534; font-weight: 600; font-size: 14px;">
          Livraison \u00e0 domicile
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
          <strong>Votre compte client a \u00e9t\u00e9 cr\u00e9\u00e9 !</strong><br>
          Vous pouvez vous connecter \u00e0 votre espace client avec l'adresse email <strong>${clientEmail}</strong> et le mot de passe que vous avez choisi.
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
        ${getEmailHeader(tenant)}
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr>
            <td>
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; font-size: 32px;">\u2713</div>
              </div>
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px; text-align: center;">Demande enregistr\u00e9e avec succ\u00e8s !</h2>
              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">Bonjour ${clientName},</p>
              <p style="margin: 0 0 30px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Nous avons bien re\u00e7u votre demande de ${data.modeLivraison === 'retrait' ? 'retrait' : 'livraison'} de v\u00e9lo cargo \u00e9lectrique. Voici le r\u00e9capitulatif :
              </p>
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px 0; color: #52525b; font-weight: 600; font-size: 14px;">Soci\u00e9t\u00e9</p>
                <p style="margin: 0; color: #18181b; font-size: 16px;">${data.raisonSociale}</p>
                <p style="margin: 4px 0 0 0; color: #71717a; font-size: 14px;">SIRET: ${data.siret}</p>
              </div>
              ${livraisonDetails}
              ${accountSection}
              <p style="margin: 30px 0 0 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>Prochaines \u00e9tapes :</strong><br>
                Notre \u00e9quipe va traiter votre demande et vous contactera prochainement pour ${data.modeLivraison === 'retrait' ? 'convenir du retrait' : 'programmer la livraison'} de votre v\u00e9lo cargo.
              </p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">
              ${getFullContactSection(tenant)}
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

  return sendEmail({
    to: clientEmail,
    subject: `${tenant.name} - Confirmation de votre demande de v\u00e9lo cargo`,
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
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${tenant.branding.colors.secondary}; border-radius: 12px 12px 0 0; padding: 30px;">
          <tr><td align="center">
            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: bold;">${tenant.branding.emailEmoji} ${tenant.name}</h1>
            <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Plateforme de gestion</p>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr><td>
            <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px;">Bienvenue ${userName} !</h2>
            <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
              Un compte a \u00e9t\u00e9 cr\u00e9\u00e9 pour vous sur la plateforme ${tenant.name} avec le r\u00f4le <strong style="color: ${tenant.branding.colors.secondary};">${roleLabel}</strong>.
            </p>
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
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${loginUrl}" style="display: inline-block; background-color: ${tenant.branding.colors.secondary}; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Se connecter</a>
              </td></tr>
            </table>
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 30px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                <strong>\u26a0\ufe0f Important :</strong> Nous vous recommandons de changer votre mot de passe apr\u00e8s votre premi\u00e8re connexion.
              </p>
            </div>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">
            <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
              Votre identifiant de connexion : <strong>${userEmail}</strong><br><br>
              En cas de question, contactez votre administrateur ou \u00e9crivez \u00e0 <a href="mailto:${tenant.email}" style="color: ${tenant.branding.colors.secondary};">${tenant.email}</a>
            </p>
          </td></tr>
        </table>
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to: userEmail,
    subject: `${tenant.name} - Bienvenue ! Cr\u00e9ez votre mot de passe`,
    html,
  })
}

// Email d'envoi du formulaire de choix de cr\u00e9neau de livraison
export async function sendFormulaireLivraisonEmail(params: {
  to: string
  clientName: string
  depotName: string
  modeLivraison: string
  formulaireUrl: string
  tenantName: string
}) {
  const tenant = getTenantConfig()
  const { to, clientName, depotName, modeLivraison, formulaireUrl } = params

  const isRetrait = modeLivraison === 'point_relais' || modeLivraison === 'retrait'
  const modeLabel = isRetrait ? 'retrait' : 'livraison'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.name} - Choisissez votre cr\u00e9neau de ${modeLabel}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        ${getEmailHeader(tenant)}
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px;">
          <tr><td>
            <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 22px;">Bonjour ${clientName},</h2>
            <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
              Bonne nouvelle ! Votre v\u00e9lo cargo \u00e9lectrique est pr\u00eat ${isRetrait ? '\u00e0 \u00eatre r\u00e9cup\u00e9r\u00e9' : '\u00e0 \u00eatre livr\u00e9'}.
            </p>
            <div style="background-color: #f0f9ff; border-radius: 8px; padding: 16px; margin: 0 0 30px 0;">
              <p style="margin: 0 0 8px 0; color: #0369a1; font-weight: 600; font-size: 14px;">
                ${isRetrait ? '\ud83d\udccd Point de retrait' : '\ud83d\ude9a D\u00e9p\u00f4t de d\u00e9part'}
              </p>
              <p style="margin: 0; color: #0369a1; font-size: 14px;">${depotName}</p>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${formulaireUrl}" style="display: inline-block; background-color: ${tenant.branding.colors.secondary}; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Choisir mon cr\u00e9neau de ${modeLabel}
                </a>
              </td></tr>
            </table>
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 30px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                <strong>\u26a0\ufe0f Rappel important</strong><br>
                Une <strong>pi\u00e8ce d'identit\u00e9</strong> sera demand\u00e9e lors ${isRetrait ? 'du retrait' : 'de la livraison'} du v\u00e9lo cargo.
              </p>
            </div>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">
            <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">
              Ce lien est personnel et unique. Veuillez ne pas le partager.<br>
              ${getContactSection(tenant)}
            </p>
          </td></tr>
        </table>
        ${getEmailFooter(tenant)}
      </td>
    </tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to,
    subject: `${tenant.name} - Choisissez votre cr\u00e9neau de ${modeLabel}`,
    html,
  })
}

/**
 * Email de confirmation de tourn\u00e9e \u2014 le client confirme ou refuse la date propos\u00e9e
 */
export async function sendTourneeConfirmationEmail({
  to,
  clientName,
  date,
  creneauDebut,
  creneauFin,
  confirmUrl,
}: {
  to: string
  clientName: string
  date: string
  creneauDebut: string
  creneauFin: string
  confirmUrl: string
}) {
  const tenant = getTenantConfig()

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

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <tr><td>
      ${getEmailHeader(tenant)}
      <div style="padding: 30px;">
        <h2 style="margin: 0 0 15px 0; color: #1f2937; font-size: 22px;">Votre livraison est programm\u00e9e !</h2>
        <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">Bonjour <strong>${clientName}</strong>,</p>
        <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">Votre v\u00e9lo cargo est pr\u00eat ! Nous avons programm\u00e9 votre livraison :</p>
        <div style="background-color: #eff6ff; border-radius: 12px; padding: 20px; margin-bottom: 25px; border-left: 4px solid ${tenant.branding.colors.primary};">
          <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold; color: #1e40af;">\ud83d\udcc5 ${dateFormatted}</p>
          <p style="margin: 0; font-size: 16px; color: #3b82f6;">\ud83d\udd50 Entre ${creneauDebut} et ${creneauFin}</p>
        </div>
        <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">Merci de confirmer votre disponibilit\u00e9 en cliquant sur le bouton ci-dessous :</p>
        <div style="text-align: center; margin-bottom: 20px;">
          <a href="${confirmUrl}" style="display: inline-block; background-color: ${tenant.branding.colors.primary}; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">Confirmer ou modifier</a>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px;">
          Si le bouton ne fonctionne pas, copiez ce lien :<br/>
          <a href="${confirmUrl}" style="color: #6b7280; word-break: break-all;">${confirmUrl}</a>
        </p>
      </div>
      ${getEmailFooter(tenant)}
    </td></tr>
  </table>
</body>
</html>
`

  return sendEmail({
    to,
    subject: `${tenant.name} - Confirmez votre livraison du ${dateFormatted}`,
    html,
  })
}
