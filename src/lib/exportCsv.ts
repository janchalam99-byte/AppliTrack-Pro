/**
 * Utility functions for exporting data to CSV with UTF-8 BOM
 * ป้องกันปัญหาภาษาไทยเพี้ยนใน Microsoft Excel (Windows)
 */

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  // ถ้ามี comma, double quote หรือ new line ต้องใส่ double quote ครอบและ escape quote
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const headerLine = headers.map(escapeCsvCell).join(',')
  const rowLines = rows.map(row => row.map(escapeCsvCell).join(','))
  
  // ใส่ UTF-8 BOM (\uFEFF) นำหน้าไฟล์ เพื่อให้ Microsoft Excel บน Windows แสดงภาษาไทยได้อย่างถูกต้อง 100%
  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n')
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
