import Papa from 'papaparse'
import { Bank, ParsedTransaction } from './types'
import { format, parse, isValid } from 'date-fns'

function parseDate(raw: string): string | null {
  const formats = [
    'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd',
    'dd MMM yyyy', 'dd-MM-yyyy', 'd/MM/yyyy',
    'dd/MM/yy', 'M/d/yyyy'
  ]
  for (const fmt of formats) {
    try {
      const d = parse(raw.trim(), fmt, new Date())
      if (isValid(d)) return format(d, 'yyyy-MM-dd')
    } catch {}
  }
  return null
}

function detectBank(headers: string[]): Bank | null {
  const h = headers.map(x => x.toLowerCase().replace(/[^a-z]/g, ''))
  const joined = h.join(',')

  // NAB: has "account" column
  if (h.includes('account')) return 'nab'
  // ING: has separate credit/debit columns
  if (h.includes('credit') && h.includes('debit')) return 'ing'
  // Macquarie: date, description, amount, balance
  if (h.includes('amount') && h.includes('balance') && !h.includes('account')) return 'macquarie'
  // Qantas CC: date, description, amount (no balance)
  if (h.includes('amount') && !h.includes('balance')) return 'qantas_cc'

  return null
}

function parseMacquarie(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows.map(row => {
    const date = parseDate(row['Date'] || row['date'])
    const amount = parseFloat((row['Amount'] || row['amount'] || '0').replace(/[$,]/g, ''))
    return {
      date: date || '',
      description: (row['Description'] || row['description'] || '').trim(),
      amount, // negative = debit already in Macquarie format
      balance: parseFloat((row['Balance'] || row['balance'] || '0').replace(/[$,]/g, ''))
    }
  }).filter(t => t.date && t.description)
}

function parseING(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows.map(row => {
    const date = parseDate(row['Date'] || row['date'])
    const credit = parseFloat((row['Credit'] || row['credit'] || '0').replace(/[$,]/g, '')) || 0
    const debit = parseFloat((row['Debit'] || row['debit'] || '0').replace(/[$,]/g, '')) || 0
    // credit = money in (positive), debit = money out (negative)
    const amount = credit > 0 ? credit : -Math.abs(debit)
    return {
      date: date || '',
      description: (row['Description'] || row['description'] || '').trim(),
      amount,
      balance: parseFloat((row['Balance'] || row['balance'] || '0').replace(/[$,]/g, ''))
    }
  }).filter(t => t.date && t.description)
}

function parseNAB(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows.map(row => {
    const date = parseDate(row['Date'] || row['date'])
    const amount = parseFloat((row['Amount'] || row['amount'] || '0').replace(/[$,]/g, ''))
    return {
      date: date || '',
      description: (row['Description'] || row['description'] || row['Transaction Details'] || '').trim(),
      amount,
      balance: parseFloat((row['Balance'] || row['balance'] || '0').replace(/[$,]/g, ''))
    }
  }).filter(t => t.date && t.description)
}

function parseQantasCC(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows.map(row => {
    const date = parseDate(row['Date'] || row['date'] || row['Transaction Date'])
    const rawAmount = parseFloat(
      (row['Amount'] || row['amount'] || row['Debit Amount'] || '0').replace(/[$,]/g, '')
    )
    // Credit card: positive amount = purchase (expense), negative = payment/refund
    const amount = -Math.abs(rawAmount)
    return {
      date: date || '',
      description: (row['Description'] || row['description'] || row['Merchant'] || '').trim(),
      amount,
    }
  }).filter(t => t.date && t.description)
}

export function parseCSV(csvText: string, bankHint?: Bank): {
  transactions: ParsedTransaction[]
  bank: Bank
  error?: string
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim()
  })

  if (result.errors.length > 0 && result.data.length === 0) {
    return { transactions: [], bank: bankHint || 'macquarie', error: 'Could not parse CSV' }
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

  return { transactions, bank }
}
