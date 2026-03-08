import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/gmail'
import { getTenantConfig } from '@/lib/tenants'

/**
 * POST /api/admin/clients/send-relance
 * Body: { clientId: string, token: string }
 * Envoie un email de relance au client avec lien vers /relance?token=xxx
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { clientId, token } = await request.json()
    if (!clientId || !token) {
      return NextResponse.json({ error: 'clientId et token requis' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: client, error } = await adminClient
      .from('clients')
      .select('id, raison_sociale, email_beneficiaire, email, preferences_livraison')
      .eq('id', clientId)
      .single()

    if (error || !client) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const clientEmail = client.email_beneficiaire || client.email
    if (!clientEmail) {
      return NextResponse.json({ error: 'Aucun email pour ce client' }, { status: 400 })
    }

    const tenant = getTenantConfig()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://velo-${tenant.id}.vercel.app`
    const relanceLink = `${baseUrl}/relance?token=${token}`

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${tenant.branding.colors.primary};">Planification de votre livraison</h2>
        <p>Bonjour,</p>
        <p>Nous avons essayé de vous joindre pour organiser la livraison de votre vélo cargo, mais nous n'avons malheureusement pas pu vous contacter.</p>
        <p>Pour que nous puissions planifier au mieux votre livraison, nous avons besoin de quelques informations complémentaires :</p>
        <ul style="background: #f5f5f5; padding: 20px 40px; border-radius: 8px;">
          <li>Vos disponibilités (jours et horaires)</li>
          <li>Des instructions particulières pour la livraison</li>
          <li>Tout détail qui nous aiderait à vous livrer</li>
        </ul>
        ${client.preferences_livraison ? `
          <p style="color: #666; font-size: 14px;">Vos préférences actuelles : <em>"${client.preferences_livraison}"</em></p>
        ` : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${relanceLink}" style="background: ${tenant.branding.colors.primary}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Indiquer mes disponibilités
          </a>
        </div>
        <p>Si vous préférez nous contacter directement : <strong>${tenant.phone}</strong></p>
        <p style="color: #888; font-size: 12px;">Ce lien est personnel et sécurisé. — ${tenant.name}</p>
      </div>
    `

    await sendEmail({
      to: clientEmail,
      subject: `${tenant.name} — Planification de votre livraison vélo cargo`,
      html: emailHtml,
    })

    return NextResponse.json({ success: true, email: clientEmail })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
