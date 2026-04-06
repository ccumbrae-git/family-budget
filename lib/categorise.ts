import Anthropic from '@anthropic-ai/sdk'
import { ParsedTransaction } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface CategoryResult {
  transactionIndex: number
  category: string
  subcategory: string
  merchant: string
}

export interface DbCategory {
  id: string
  name: string
  subcategory: string
}

export async function categoriseTransactions(
  transactions: ParsedTransaction[],
  dbCategories?: DbCategory[]
): Promise<CategoryResult[]> {
  if (transactions.length === 0) return []

  const batchSize = 50
  const results: CategoryResult[] = []

  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize)
    const batchResults = await categoriseBatch(batch, i, dbCategories)
    results.push(...batchResults)
  }

  return results
}

async function categoriseBatch(
  transactions: ParsedTransaction[],
  startIndex: number,
  dbCategories?: DbCategory[]
): Promise<CategoryResult[]> {
  // Build category list from DB if provided, otherwise use defaults
  const categoryList = dbCategories && dbCategories.length > 0
    ? buildCategoryList(dbCategories)
    : DEFAULT_CATEGORIES

  const txList = transactions
    .map((t, i) => `${i}: ${t.date} | ${t.description} | $${Math.abs(t.amount).toFixed(2)} | ${t.amount < 0 ? 'expense' : 'income'}`)
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a financial transaction categoriser for Australian bank statements.
Classify each transaction using EXACTLY one category and subcategory from the list below.
You MUST use the exact spelling and capitalisation shown. Also extract a clean merchant name.

Available categories (format: Category > Subcategory):
${categoryList}

Rules:
- Income transactions (positive amounts): use Income > Salary or Income > Transfer or Income > Refund
- Woolworths, Coles, Aldi, IGA = Food & Groceries > Supermarket
- UberEats, DoorDash, Menulog = Dining Out > Takeaway & Delivery
- Uber, Ola, DiDi (no food) = Transport > Ride Share
- BP, Caltex, Shell, 7-Eleven fuel = Transport > Petrol
- Netflix, Spotify, Disney+, Stan = Entertainment > Streaming Services
- ATM withdrawals = Financial > ATM Withdrawal
- Salary/pay = Income > Salary

Respond with a JSON array ONLY, no other text:
[{"i": 0, "category": "...", "subcategory": "...", "merchant": "..."}]`,
    messages: [{ role: 'user', content: `Categorise these transactions:\n${txList}` }]
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed: Array<{ i: number; category: string; subcategory: string; merchant: string }> = JSON.parse(jsonMatch[0])
    return parsed.map(p => ({
      transactionIndex: startIndex + p.i,
      category: p.category?.trim(),
      subcategory: p.subcategory?.trim(),
      merchant: p.merchant?.trim()
    }))
  } catch {
    return []
  }
}

function buildCategoryList(categories: DbCategory[]): string {
  const groups = new Map<string, string[]>()
  for (const c of categories) {
    if (!groups.has(c.name)) groups.set(c.name, [])
    groups.get(c.name)!.push(c.subcategory)
  }
  return Array.from(groups.entries())
    .map(([name, subs]) => subs.map(s => `${name} > ${s}`).join('\n'))
    .join('\n')
}

const DEFAULT_CATEGORIES = `Food & Groceries > Supermarket
Food & Groceries > Specialty Food
Food & Groceries > Bakery & Deli
Dining Out > Restaurants
Dining Out > Takeaway & Delivery
Dining Out > Cafes & Coffee
Dining Out > Fast Food
Dining Out > Bars & Pubs
Transport > Petrol
Transport > Public Transport
Transport > Ride Share
Transport > Parking
Transport > Tolls
Transport > Car Service & Repair
Shopping > Clothing & Fashion
Shopping > Electronics
Shopping > Home & Garden
Shopping > Online Shopping
Shopping > Department Store
Health > Pharmacy
Health > Medical & Dental
Health > Gym & Fitness
Health > Optical
Entertainment > Streaming Services
Entertainment > Movies & Events
Entertainment > Sports & Recreation
Entertainment > Hobbies
Utilities > Electricity
Utilities > Gas
Utilities > Water
Utilities > Internet
Utilities > Mobile Phone
Home > Rent & Mortgage
Home > Home Insurance
Home > Strata & Body Corp
Home > Home Maintenance
Travel > Flights
Travel > Accommodation
Travel > Car Hire
Travel > Travel Insurance
Education > School & Uni Fees
Education > Books & Supplies
Education > Online Courses
Childcare > Childcare & Daycare
Childcare > School Activities
Personal Care > Haircut & Beauty
Personal Care > Clothing & Accessories
Financial > Bank Fees
Financial > ATM Withdrawal
Financial > Insurance
Income > Salary
Income > Transfer
Income > Refund
Other > Miscellaneous`
