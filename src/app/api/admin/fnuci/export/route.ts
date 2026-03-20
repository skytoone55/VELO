import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole, isAuthError } from '@/lib/auth/require-role'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'

/**
 * POST /api/admin/fnuci/export
 * Génère un ou plusieurs fichiers Excel Bicycode pour déclaration FNUCI
 * Body: { client_ids: string[] }
 *
 * - Max 50 vélos par fichier
 * - Colonnes A (FNUCI), N (raison sociale), O (téléphone), P (email) sont remplies par client
 * - Toutes les autres colonnes sont copiées depuis la ligne modèle du fichier template
 * - Marque les FNUCI comme déclarés après export
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(['super_admin', 'admin'])
    if (isAuthError(authResult)) return authResult

    const { client_ids } = await request.json()
    if (!client_ids?.length) {
      return NextResponse.json({ error: 'Aucun client sélectionné' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Récupérer les clients avec leurs FNUCI
    const { data: clients, error: clientsError } = await adminClient
      .from('clients')
      .select('id, raison_sociale, telephone, email_beneficiaire, fnuci_ids, velo_valide')
      .in('id', client_ids)

    if (clientsError || !clients?.length) {
      return NextResponse.json({ error: 'Clients introuvables' }, { status: 404 })
    }

    // Récupérer les FNUCI associés à ces clients
    const { data: fnuciRecords } = await adminClient
      .from('fnuci')
      .select('id, reference, client_id, statut')
      .in('client_id', client_ids)
      .neq('statut', 'disponible')

    // Construire la liste des lignes à exporter : 1 ligne par FNUCI
    const rows: Array<{ fnuci: string; raison_sociale: string; telephone: string; email: string; client_id: string }> = []

    for (const client of clients) {
      const clientFnucis = fnuciRecords?.filter(f => f.client_id === client.id) || []

      if (clientFnucis.length === 0) {
        // Si pas de FNUCI dans la table fnuci, utiliser fnuci_ids (JSON array sur le client)
        const fnuciIds = Array.isArray(client.fnuci_ids) ? client.fnuci_ids : []
        for (const fid of fnuciIds) {
          rows.push({
            fnuci: String(fid),
            raison_sociale: client.raison_sociale,
            telephone: client.telephone || '',
            email: client.email_beneficiaire || '',
            client_id: client.id,
          })
        }
      } else {
        for (const f of clientFnucis) {
          rows.push({
            fnuci: f.reference,
            raison_sociale: client.raison_sociale,
            telephone: client.telephone || '',
            email: client.email_beneficiaire || '',
            client_id: client.id,
          })
        }
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Aucun FNUCI à déclarer pour ces clients' }, { status: 400 })
    }

    // Charger le fichier modèle
    const templatePath = path.join(process.cwd(), 'docs', 'import-vélos-cargoland.xlsx')
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Fichier modèle introuvable' }, { status: 500 })
    }

    const templateWb = new ExcelJS.Workbook()
    await templateWb.xlsx.readFile(templatePath)
    const templateSheet = templateWb.worksheets[0]

    // Lire les valeurs par défaut de la ligne 5 (première ligne modèle avec données)
    const defaultValues: Record<number, any> = {}
    for (let col = 1; col <= 17; col++) {
      const cell = templateSheet.getRow(5).getCell(col)
      defaultValues[col] = cell.value
    }

    // Découper en chunks de 50 max
    const chunks: typeof rows[] = []
    for (let i = 0; i < rows.length; i += 50) {
      chunks.push(rows.slice(i, i + 50))
    }

    // Si un seul fichier, retourner directement le xlsx
    // Si plusieurs, retourner un zip (ou plusieurs fichiers en JSON base64)
    const files: Array<{ name: string; buffer: Uint8Array }> = []

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx]

      // Créer un nouveau workbook basé sur le template
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(templatePath)
      const ws = wb.worksheets[0]

      // Supprimer les lignes existantes après le header (lignes 5+)
      // On garde les 4 premières lignes (headers + annotations)
      const lastRow = ws.rowCount
      for (let r = lastRow; r >= 5; r--) {
        ws.spliceRows(r, 1)
      }

      // Ajouter les lignes de données
      for (const row of chunk) {
        const newRow = ws.addRow([])
        // Remplir les colonnes par défaut (B-M, Q)
        for (let col = 1; col <= 17; col++) {
          if (col === 1) {
            // Col A : FNUCI
            newRow.getCell(col).value = row.fnuci
          } else if (col === 14) {
            // Col N : Raison sociale
            newRow.getCell(col).value = row.raison_sociale
          } else if (col === 15) {
            // Col O : Téléphone (sans espace — format +33612345678)
            newRow.getCell(col).value = (row.telephone || '').replace(/\s/g, '')
          } else if (col === 16) {
            // Col P : Email
            newRow.getCell(col).value = row.email
          } else {
            // Colonnes par défaut du modèle
            newRow.getCell(col).value = defaultValues[col]
          }
        }
      }

      const arrayBuffer = await wb.xlsx.writeBuffer()
      const buffer = new Uint8Array(arrayBuffer)
      const suffix = chunks.length > 1 ? `-${chunkIdx + 1}` : ''
      const today = new Date().toISOString().slice(0, 10)
      const tenantName = process.env.NEXT_PUBLIC_TENANT_ID === 'ppe' ? 'PPE-Energie' : 'Ecovolt'
      files.push({
        name: `declaration-fnuci-${tenantName}-${today}${suffix}.xlsx`,
        buffer,
      })
    }

    // Marquer les FNUCI comme déclarés
    const uniqueClientIds = [...new Set(rows.map(r => r.client_id))]
    const now = new Date().toISOString()

    await adminClient
      .from('clients')
      .update({ fnuci_declared: true, fnuci_declared_at: now })
      .in('id', uniqueClientIds)

    // Si un seul fichier, retourner directement
    if (files.length === 1) {
      return new Response(files[0].buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${files[0].name}"`,
        },
      })
    }

    // Plusieurs fichiers : retourner en JSON avec les buffers en base64
    return NextResponse.json({
      files: files.map(f => ({
        name: f.name,
        data: Buffer.from(f.buffer).toString('base64'),
      })),
      summary: {
        total_velos: rows.length,
        total_clients: uniqueClientIds.length,
        total_fichiers: files.length,
      },
    })
  } catch (error: any) {
    console.error('Erreur POST /api/admin/fnuci/export:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
