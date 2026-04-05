export type Bank = 'macquarie' | 'ing' | 'nab' | 'qantas_cc'

export interface Category {
  id: string
  name: string
  subcategory: string
  icon: string
  color: string
}

export interface Account {
  id: string
  user_id: string
  bank: Bank
  account_name: string
  account_number?: string
  created_at: string
}

export interface Transaction {
  id: string
  account_id: string
  user_id: string
  date: string
  description: string
  amount: number
  category_id?: string
  category?: Category
  merchant?: string
  notes?: string
  created_at: string
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  category?: Category
  monthly_limit: number
  alert_at_percent: number
  created_at: string
}

export interface MonthlySpend {
  category_id: string
  category_name: string
  subcategory: string
  total: number
  budget?: number
  percent?: number
}

export interface ParsedTransaction {
  date: string
  description: string
  amount: number
  balance?: number
}
