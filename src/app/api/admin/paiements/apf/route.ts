import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import PDFDocument from 'pdfkit'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'

type ApfMode = 'livreur' | 'commercial'

interface ApfBody {
  client_ids: string[]
  mode: ApfMode
}

interface ClientRow {
  id: string
  raison_sociale: string | null
  reference_retina: string | null
  velo_valide: number | null
  type_de_zone: string | null
  paiement_livreur_id: string | null
  commercial_code: string | null
  commercial_apf_envoye: boolean | null
  commercial_paye: boolean | null
  livreur_apf_envoye: boolean | null
  livreur_paye: boolean | null
  commercial?: { code: string; nom: string; parent_code: string | null } | null
  livreur?: { id: string; nom: string; prenom: string; email: string } | null
}

/**
 * Normalise un libelle en slug safe (nom de dossier).
 * - lowercase
 * - remplace espaces par "_"
 * - retire accents
 * - garde [a-z0-9_-]
 */
function slugify(input: string): string {
  const stripped = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '')
  return stripped || 'sans_nom'
}

function todayDdMmYyyy(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

/**
 * Genere le buffer XLSX pour un groupe de clients.
 * Colonnes : Client (raison_sociale) | Ref Retina | Nb velos livres
 */
function isHorsZone(c: ClientRow): boolean {
  return c.type_de_zone === 'hors_zone'
}

function buildXlsx(clients: ClientRow[], splitByZone: boolean): Buffer {
  const headers = ['Client', 'Réf Retina', 'Nb vélos livrés']
  const mkRows = (list: ClientRow[]) => list.map(c => [
    c.raison_sociale ?? '',
    c.reference_retina ?? '',
    c.velo_valide ?? 0,
  ])
  const sumVelos = (list: ClientRow[]) => list.reduce((acc, c) => acc + (c.velo_valide ?? 0), 0)

  let sheetData: (string | number)[][]
  if (splitByZone) {
    const dans = clients.filter(c => !isHorsZone(c))
    const hors = clients.filter(isHorsZone)
    sheetData = [headers]
    sheetData.push(['CLIENTS DANS LA ZONE', '', ''])
    sheetData.push(...mkRows(dans))
    sheetData.push(['', 'Sous-total dans la zone', sumVelos(dans)])
    sheetData.push(['', '', ''])
    sheetData.push(['CLIENTS HORS ZONE', '', ''])
    sheetData.push(...mkRows(hors))
    sheetData.push(['', 'Sous-total hors zone', sumVelos(hors)])
    sheetData.push(['', '', ''])
    sheetData.push(['', 'TOTAL', sumVelos(clients)])
  } else {
    sheetData = [headers, ...mkRows(clients), ['', 'Total', sumVelos(clients)]]
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...sheetData.slice(1).map(r => String(r[i] ?? '').length)
    )
    return { wch: Math.min(maxLen + 2, 60) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'APF')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/**
 * Genere le buffer PDF pour un groupe de clients.
 * Layout A4, annexe facture : header PPE + titre + sous-titre + tableau + total gras.
 */
async function buildPdf(
  clients: ClientRow[],
  splitByZone: boolean,
  opts: { title: string; subtitle: string; tenantName: string }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      })
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

      // Titre (sans header tenant, sans sous-titre date/nom — annexe brute)
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text(opts.title, { align: 'center' })
      doc.moveDown(1.5)

      // Table
      const col1W = pageWidth * 0.50 // Client
      const col2W = pageWidth * 0.25 // Ref Retina
      const col3W = pageWidth * 0.25 // Nb velos
      const rowH = 22

      let y = doc.y
      const drawRow = (
        vals: [string, string, string],
        bold: boolean,
        fill?: string
      ) => {
        if (fill) {
          doc.save()
          doc.rect(doc.page.margins.left, y, pageWidth, rowH).fill(fill)
          doc.restore()
        }
        // bordures
        doc.lineWidth(0.5).strokeColor('#bbb')
        doc.rect(doc.page.margins.left, y, pageWidth, rowH).stroke()
        doc.moveTo(doc.page.margins.left + col1W, y).lineTo(doc.page.margins.left + col1W, y + rowH).stroke()
        doc.moveTo(doc.page.margins.left + col1W + col2W, y).lineTo(doc.page.margins.left + col1W + col2W, y + rowH).stroke()

        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#000')
        const textY = y + 6
        doc.text(vals[0], doc.page.margins.left + 6, textY, { width: col1W - 12, ellipsis: true })
        doc.text(vals[1], doc.page.margins.left + col1W + 6, textY, { width: col2W - 12, ellipsis: true })
        doc.text(vals[2], doc.page.margins.left + col1W + col2W + 6, textY, {
          width: col3W - 12,
          align: 'right',
        })
        y += rowH
      }

      const sumVelos = (list: ClientRow[]) => list.reduce((acc, c) => acc + (c.velo_valide ?? 0), 0)
      const drawHeader = () => drawRow(['Client', 'Réf Retina', 'Nb vélos livrés'], true, '#f0f0f0')
      const drawSectionTitle = (label: string) => {
        if (y + rowH > doc.page.height - doc.page.margins.bottom - 40) {
          doc.addPage(); y = doc.page.margins.top
        }
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(label, doc.page.margins.left, y + 4)
        y += rowH + 4
      }
      const renderRows = (list: ClientRow[]) => {
        drawHeader()
        for (const c of list) {
          if (y + rowH > doc.page.height - doc.page.margins.bottom - 40) {
            doc.addPage(); y = doc.page.margins.top
            drawHeader()
          }
          drawRow([c.raison_sociale ?? '', c.reference_retina ?? '', String(c.velo_valide ?? 0)], false)
        }
      }
      const drawTotal = (label: string, n: number, big = false) => {
        y += 8
        if (y + 30 > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.page.margins.top }
        doc.font('Helvetica-Bold').fontSize(big ? 12 : 11).fillColor('#000')
          .text(`${label} : ${n} vélo${n > 1 ? 's' : ''}`, doc.page.margins.left, y, { width: pageWidth, align: 'right' })
        y += big ? 24 : 20
      }

      if (splitByZone) {
        const dans = clients.filter(c => !isHorsZone(c))
        const hors = clients.filter(isHorsZone)
        drawSectionTitle('Clients dans la zone')
        renderRows(dans)
        drawTotal('Sous-total dans la zone', sumVelos(dans))
        y += 6
        drawSectionTitle('Clients hors zone')
        renderRows(hors)
        drawTotal('Sous-total hors zone', sumVelos(hors))
        drawTotal('TOTAL', sumVelos(clients), true)
      } else {
        renderRows(clients)
        drawTotal('Total', sumVelos(clients), true)
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * POST /api/admin/paiements/apf
 * Genere les appels a facture (xlsx + pdf) groupes par livreur ou commercial, zippes.
 * Met a jour aussi le flag `*_apf_envoye` + timestamp.
 *
 * Body : { client_ids: string[], mode: 'livreur' | 'commercial' }
 * Acces : super_admin uniquement.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(['super_admin'])
    if (isAuthError(auth)) return auth

    const body = (await request.json()) as ApfBody

    if (!body.client_ids || !Array.isArray(body.client_ids) || body.client_ids.length === 0) {
      return NextResponse.json({ error: 'client_ids requis (tableau non vide)' }, { status: 400 })
    }
    if (!body.mode || !['livreur', 'commercial'].includes(body.mode)) {
      return NextResponse.json({ error: 'mode invalide (livreur|commercial)' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: rows, error } = await supabase
      .from('clients')
      .select(
        `id, raison_sociale, reference_retina, velo_valide, type_de_zone,
         paiement_livreur_id, commercial_code,
         commercial_apf_envoye, commercial_paye,
         livreur_apf_envoye, livreur_paye,
         commercial:commercial_code (code, nom, parent_code),
         livreur:paiement_livreur_id (id, nom, prenom, email)`
      )
      .in('id', body.client_ids)

    if (error) {
      console.error('Erreur POST /api/admin/paiements/apf (fetch):', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const allRows = (rows || []) as unknown as ClientRow[]

    // Filtrer les clients sans livreur/commercial + exclure ceux deja APF/payes (verrou anti-doublon)
    const rejected: { id: string; raison_sociale: string | null; reason: string }[] = []
    const valid: ClientRow[] = []
    for (const c of allRows) {
      if (body.mode === 'livreur') {
        if (!c.paiement_livreur_id) {
          rejected.push({ id: c.id, raison_sociale: c.raison_sociale, reason: 'sans_livreur' })
          continue
        }
        if (c.livreur_apf_envoye) {
          rejected.push({ id: c.id, raison_sociale: c.raison_sociale, reason: 'apf_deja_envoye' })
          continue
        }
        if (c.livreur_paye) {
          rejected.push({ id: c.id, raison_sociale: c.raison_sociale, reason: 'deja_paye' })
          continue
        }
      } else {
        if (!c.commercial_code) {
          rejected.push({ id: c.id, raison_sociale: c.raison_sociale, reason: 'sans_commercial' })
          continue
        }
        if (c.commercial_apf_envoye) {
          rejected.push({ id: c.id, raison_sociale: c.raison_sociale, reason: 'apf_deja_envoye' })
          continue
        }
        if (c.commercial_paye) {
          rejected.push({ id: c.id, raison_sociale: c.raison_sociale, reason: 'deja_paye' })
          continue
        }
      }
      valid.push(c)
    }

    if (valid.length === 0) {
      const nbApfDeja = rejected.filter(r => r.reason === 'apf_deja_envoye').length
      const nbPayeDeja = rejected.filter(r => r.reason === 'deja_paye').length
      const nbSans = rejected.filter(r => r.reason.startsWith('sans_')).length
      const messages = []
      if (nbApfDeja > 0) messages.push(`${nbApfDeja} déjà APF envoyé`)
      if (nbPayeDeja > 0) messages.push(`${nbPayeDeja} déjà payé(s)`)
      if (nbSans > 0) messages.push(`${nbSans} sans ${body.mode} attribué`)
      return NextResponse.json(
        {
          error: `Aucun client éligible : ${messages.join(', ')}.`,
          rejected,
        },
        { status: 400 }
      )
    }

    // Grouper par livreur ou commercial
    interface Group {
      key: string
      label: string // libelle humain (pour sous-titre PDF)
      slug: string // slug (pour nom de dossier)
      clients: ClientRow[]
    }
    const groups = new Map<string, Group>()
    for (const c of valid) {
      let key = ''
      let label = ''
      if (body.mode === 'livreur') {
        key = c.paiement_livreur_id as string
        const l = c.livreur
        label = l ? `${l.prenom ?? ''} ${l.nom ?? ''}`.trim() : 'Livreur'
      } else {
        key = c.commercial_code as string
        label = c.commercial?.nom || c.commercial_code || 'Commercial'
      }
      const slug = slugify(label)
      const existing = groups.get(key)
      if (existing) {
        existing.clients.push(c)
      } else {
        groups.set(key, { key, label, slug, clients: [c] })
      }
    }

    const dateStr = todayDdMmYyyy()
    const tenantName = 'PPE Energie'
    const isLivreur = body.mode === 'livreur'
    const filePrefix = isLivreur ? 'livraison' : 'montage'
    const titleText = isLivreur ? 'LIVRAISON' : 'MONTAGE DE VÉLOS'

    const zip = new JSZip()
    const groupList = Array.from(groups.values())
    const multiGroup = groupList.length > 1

    for (const g of groupList) {
      const totalVelosGroup = g.clients.reduce((acc, c) => acc + (c.velo_valide ?? 0), 0)
      const baseName = `${filePrefix}-${dateStr}-${totalVelosGroup}velos`

      // Pour les livreurs : tableau séparé en "dans la zone" / "hors zone".
      const xlsxBuf = buildXlsx(g.clients, isLivreur)
      const pdfBuf = await buildPdf(g.clients, isLivreur, {
        title: titleText,
        subtitle: `${g.label} — ${dateStr}`,
        tenantName,
      })

      const folder = multiGroup ? `${g.slug}/` : ''
      zip.file(`${folder}${baseName}.xlsx`, xlsxBuf)
      zip.file(`${folder}${baseName}.pdf`, pdfBuf)
    }

    const zipBuf = await zip.generateAsync({ type: 'nodebuffer' })
    const zipFilename = `apf-${filePrefix}-${dateStr}.zip`

    // Update flag APF envoye + timestamp sur les clients valides
    const nowIso = new Date().toISOString()
    const field = isLivreur ? 'livreur_apf_envoye' : 'commercial_apf_envoye'
    const fieldLe = `${field}_le`
    const validIds = valid.map(c => c.id)
    const updatePayload: Record<string, any> = {
      updated_at: nowIso,
      [field]: true,
      [fieldLe]: nowIso,
    }
    const { error: updateError } = await supabase
      .from('clients')
      .update(updatePayload)
      .in('id', validIds)

    if (updateError) {
      console.error('Erreur POST /api/admin/paiements/apf (update):', updateError)
      // Le zip est pret — on renvoie quand meme l'erreur pour que le front affiche un message
      return NextResponse.json(
        { error: `Fichiers générés mais erreur mise à jour DB: ${updateError.message}` },
        { status: 500 }
      )
    }

    // Headers personnalises pour permettre au front de lire les stats
    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'X-Apf-Groups': String(groupList.length),
        'X-Apf-Valid': String(valid.length),
        'X-Apf-Rejected': String(rejected.length),
        'X-Apf-Rejected-Apf': String(rejected.filter(r => r.reason === 'apf_deja_envoye').length),
        'X-Apf-Rejected-Paye': String(rejected.filter(r => r.reason === 'deja_paye').length),
        'X-Apf-Rejected-Sans': String(rejected.filter(r => r.reason.startsWith('sans_')).length),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur interne'
    console.error('Erreur POST /api/admin/paiements/apf:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
