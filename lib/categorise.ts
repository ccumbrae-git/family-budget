import Anthropic from '@anthropic-ai/sdk'
import { ParsedTransaction } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface CategoryResult {
  transactionIndex: number
  category: string
  subcategory: string
  merchant: string
}

const CATEGORIES = `
Food & Groceries: Supermarket, Specialty Food, Bakery & Deli
Dining Out: Restaurants, Takeaway & Delivery, Cafes & Coffee, Fast Food, Bars & Pubs
Transport: Petrol, Public Transport, Ride Share, Parking, Tolls, Car Service & Repair
Shopping: Clothing & Fashion, Electronics, Home & Garden, Online Shopping, Department Store
Health: Pharmacy, Medical & Dental, Gym & Fitness, Optical
Entertainment: Streaming Services, Movies & Events, Sports & Recreation, Hobbies
Utilities: Electricity, Gas, Water, Internet, Mobile Phone
Home: Rent & Mortgage, Home Insurance, Strata & Body Corp, Home Maintenance
Travel: Flights, Accommodation, Car Hire, Travel Insurance
Education: School & Uni Fees, Books & Supplies, Online Courses
Childcare: Childcare & Daycare, School Activities
Personal Care: Haircut & Beauty, Clothing & Accessories
Financial: Bank Fees, ATM Withdrawal, Insurance
Income: Salary, Transfer, Refund
Other: Miscellaneous
`

export async function categoriseTransactions(
  transactions: ParsedTransaction[]
): Promise<CategoryResult[]> {
  if (transactions.length === 0) return []

  // Process in batches of 50 to stay within token limits
  const batchSize = 50
  const results: CategoryResult[] = []

  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize)
    const batchResults = await categoriseBatch(batch, i)
    results.push(...batchResults)
  }

  return results
}

async function categoriseBatch(
  transactions: ParsedTransaction[],
  startIndex: number
): Promise<CategoryResult[]> {
  const txList = transactions
    .map((t, i) => `${i}: ${t.date} | ${t.description} | $${Math.abs(t.amount).toFixed(2)} | ${t.amount < 0 ? 'expense' : 'income'}`)
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a financial transaction categoriser for Australian bank statements.
Classify each transaction into exactly one category and subcategory from the list below.
Also extract a clean merchant name (remove codes, location info, transaction IDs).

Available categories:
${CATEGORIES}

Rules:
- For income transactions (positive amounts), always use Income category
- Woolworths, Coles, Aldi, IGA = Food & Groceries > Supermarket
- UberEats, DoorDash, Menulog = Dining Out > Takeaway & Delivery
- Uber, Ola, DiDi = Transport > Ride Share
- BP, Caltex, Shell, 7-Eleven = Transport > Petrol
- Netflix, Spotify, Disney+, Stan = Entertainment > Streaming Services
- PayPal, Amazon could be various categories - use description context
- ATM withdrawals = Financial > ATM Withdrawal
- Salary/pay = Income > Salary

Respond with a JSON array only, no explanation:
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
      category: p.category,
      subcategory: p.subcategory,
      merchant: p.merchant
    }))
  } catch {
    return []
  }
}
