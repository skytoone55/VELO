import * as XLSX from 'xlsx'

interface ExportColumn {
  header: string
  accessor: (row: any) => string | number | null | undefined
}

export function exportToXlsx(
  data: any[],
  columns: ExportColumn[],
  filename: string
) {
  const headers = columns.map(c => c.header)
  const rows = data.map(row => columns.map(c => c.accessor(row) ?? ''))

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Auto-width columns
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map(r => String(r[i] || '').length)
    )
    return { wch: Math.min(maxLen + 2, 40) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Export')
  XLSX.writeFile(wb, filename)
}
