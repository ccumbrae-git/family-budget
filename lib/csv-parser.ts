import Papa from 'papaparse'
import { Bank, ParsedTransaction } from './types'
import { format, parse, isValid } from 'date-fns'

function parseDate(raw: string): string | null {
  if (!raw) return null
  const formats = [
    'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd',
    'dd MMM yyyy', 'dd-MM-yyyy', 'd/MM/yyyy',
    'dd/MM/yy', 'M/d/yyyy', 'd MMM yyyy', 'dd-MMM-yyyy'
  ]
  for (const fmt of formats) {
    try {
      const d = parse(raw.trim(), fmt, new Date())
      if (isValid(d) && d.getFullYear() > 2000) return format(d, 'yyyy-MM-dd')
    } catch {}
  }
  return null
}

// Case-insensitive field lookup
function field(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase().trim() === key.toLowerCase()) return v || ''
    }
  }
  return ''
}

function detectBank(headers: string[]): Bank | null {
  const h = headers.map(x => x.toLowerCase().replace(/[^a-z]/g, ''))
  // Macquarie new format: has 'transactiondate' and 'details'
  if (h.includes('transactiondate') || (h.includes('details') && h.includes('balance'))) return 'macquarie'
  // NAB: has "account" but not the macquarie pattern
  if (h.includes('account') && !h.includes('details')) return 'nab'
  // ING: separate credit/debit columns
  if (h.includes('credit') && h.includes('debit')) return 'ing'
  // Macquarie old format: date, description, amount, balance
  if (h.includes('amount') && h.includes('balance')) return 'macquarie'
  // Qantas CC: amount, no balance
  if (h.includes('amount') && !h.includes('balance')) return 'qantas_cc'
  return null
}

// Strip BOM and find the actual CSV data (skip metadata rows some banks add)
function cleanCSV(csvText: string): string {
  // Strip UTF-8 BOM
  let text = csvText.replace(/^\uFEFF/, '')

  // Some banks (ING, NAB) have metadata rows before the header
  // Find the first line that looks like a header (contains 'date' case-insensitive)
  const lines = text.split(/\r?\n/)
  const headerIndex = lines.findIndex(line =>
    line.toLowerCase().includes('date') && line.includes(',')
  )
  if (headerIndex > 0) {
    text = lines.slice(headerIndex).join('\n')
  }

  return text
}

function parseMacquarie(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows.map(row => {
    const date = parseDate(field(row, 'date', 'transaction date'))
    const amountRaw = field(row, 'amount')
    let amount: number
    if (amountRaw) {
      amount = parseFloat(amountRaw.replace(/[$,]/g, ''))
    } else {
      // Macquarie exports Debit as positive number = money out, Credit as positive = money in
      const debit = parseFloat(field(row, 'debit').replace(/[$,]/g, '')) || 0
      const credit = parseFloat(field(row, 'credit').replace(/[$,]/g, '')) || 0
      amount = credit > 0 ? credit : -Math.abs(debit)
    }
    // Prefer Original Description (clean merchant name) over Details (verbose)
    const description = field(row, 'original description', 'description', 'details', 'narrative').trim()
    return {
      date: date || '',
      description,
      amount,
      balance: parseFloat(field(row, 'balance').replace(/[$,]/g, '')) || 0
    }
  }).filter(t => t.date && t.description && !isNaN(t.amount))
}

function parseING(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows.map(row => {
    const date = parseDate(field(row, 'date'))
    const creditRaw = field(row, 'credit').replace(/[$,]/g, '')
    const debitRaw = field(row, 'debit').replace(/[$,]/g, '')
    const credit = parseFloat(creditRaw) || 0
    const debit = parseFloat(debitRaw) || 0
    // ING exports debit as already-negative values; credit is positive
    let amount: number
    if (creditRaw && credit !== 0) {
      amount = credit // positive = money in
    } else {
      amount = debit // already negative in ING export
    }
    return {
      date: date || '',
      description: field(row, 'description', 'narrative', 'details').trim(),
      amount,
      balance: parseFloat(field(row, 'balance').replace(/[$,]/g, '')) || 0
    }
  }).filter(t => t.date && t.description && !isNaN(t.amount))
}

function parseNAB(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows.map(row => {
    const date = parseDate(field(row, 'date'))
    const amount = parseFloat(field(row, 'amount').replace(/[$,]/g, ''))
    return {
      date: date || '',
      description: field(row, 'description', 'transaction details', 'narrative', 'details').trim(),
      amount,
      balance: parseFloat(field(row, 'balance').replace(/[$,]/g, '')) || 0
    }
  }).filter(t => t.date && t.description && !isNaN(t.amount))
}

function parseQantasCC(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows.map(row => {
    const date = parseDate(field(row, 'date', 'transaction date'))
    const rawAmount = parseFloat(
      field(row, 'amount', 'debit amount').replace(/[$,]/g, '')
    )
    const amount = -Math.abs(rawAmount)
    return {
      date: date || '',
      description: field(row, 'description', 'merchant', 'narrative').trim(),
      amount,
    }
  }).filter(t => t.date && t.description && !isNaN(t.amount))
}

export function parseCSV(csvText: string, bankHint?: Bank): {
  transactions: ParsedTransaction[]
  bank: Bank
  error?: string
  debug?: string
} {
  const cleaned = cleanCSV(csvText)

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // auto-detect (comma or tab)
    transformHeader: (h) => h.trim()
  })

  if (result.errors.length > 0 && result.data.length === 0) {
    return { transactions: [], bank: bankHint || 'macquarie', error: 'Could not parse CSV file' }
  }

  const headers = result.meta.fields || []
  const bank = bankHint || detectBank(headers) || 'macquarie'

  let transactions: ParsedTransaction[] = []
  switch (bank) {
    case 'ing': transactions = parseING(result.data); break
    case 'nab': transactions = parseNAB(result.data); break
    case 'qantas_cc': transactions = parseQantasCC(result.data); break
    default: transactions = parseMacquarie(result.data); break
  }

  if (transactions.length === 0) {
    return {
      transactions: [],
      bank,
      error: `No transactions found. Detected bank: ${bank}. Headers found: ${headers.join(', ')}`
    }
  }

  return { transactions, bank }
}
