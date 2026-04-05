-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  family_id uuid,
  created_at timestamptz default now()
);

-- Families (shared budget group)
create table families (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamptz default now()
);

alter table profiles add constraint profiles_family_fk foreign key (family_id) references families(id);

-- Bank accounts
create table accounts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  bank text not null, -- 'macquarie' | 'ing' | 'nab' | 'qantas_cc'
  account_name text not null,
  account_number text,
  created_at timestamptz default now()
);

-- Categories (hierarchical)
create table categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  subcategory text not null,
  icon text,
  color text,
  unique(name, subcategory)
);

-- Transactions
create table transactions (
  id uuid default uuid_generate_v4() primary key,
  account_id uuid references accounts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  date date not null,
  description text not null,
  amount numeric(12,2) not null, -- negative = expense, positive = income
  category_id uuid references categories(id),
  category_override boolean default false, -- true if user manually changed category
  merchant text,
  notes text,
  raw_description text,
  created_at timestamptz default now()
);

create index transactions_user_date on transactions(user_id, date desc);
create index transactions_account_date on transactions(account_id, date desc);

-- Budgets (monthly, per category, per family)
create table budgets (
  id uuid default uuid_generate_v4() primary key,
  family_id uuid references families(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade not null,
  monthly_limit numeric(12,2) not null,
  alert_at_percent integer default 80,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Push subscriptions
create table push_subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- Budget alerts sent (to avoid spamming)
create table budget_alerts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  budget_id uuid references budgets(id) on delete cascade not null,
  month text not null, -- 'YYYY-MM'
  alert_type text not null, -- '80_percent' | 'over_budget'
  sent_at timestamptz default now(),
  unique(budget_id, month, alert_type)
);

-- RLS policies
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table push_subscriptions enable row level security;
alter table budget_alerts enable row level security;

create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "Users can manage own accounts" on accounts for all using (auth.uid() = user_id);
create policy "Users can manage own transactions" on transactions for all using (auth.uid() = user_id);
create policy "Users can manage own budgets" on budgets for all using (auth.uid() = user_id);
create policy "Users can manage own push subs" on push_subscriptions for all using (auth.uid() = user_id);
create policy "Users can view own alerts" on budget_alerts for select using (auth.uid() = user_id);

create policy "Categories are public" on categories for select using (true);

-- Seed default categories
insert into categories (name, subcategory, icon, color) values
  ('Food & Groceries', 'Supermarket', '🛒', '#10b981'),
  ('Food & Groceries', 'Specialty Food', '🥩', '#10b981'),
  ('Food & Groceries', 'Bakery & Deli', '🥖', '#10b981'),
  ('Dining Out', 'Restaurants', '🍽️', '#f59e0b'),
  ('Dining Out', 'Takeaway & Delivery', '🥡', '#f59e0b'),
  ('Dining Out', 'Cafes & Coffee', '☕', '#f59e0b'),
  ('Dining Out', 'Fast Food', '🍔', '#f59e0b'),
  ('Dining Out', 'Bars & Pubs', '🍺', '#f59e0b'),
  ('Transport', 'Petrol', '⛽', '#3b82f6'),
  ('Transport', 'Public Transport', '🚌', '#3b82f6'),
  ('Transport', 'Ride Share', '🚗', '#3b82f6'),
  ('Transport', 'Parking', '🅿️', '#3b82f6'),
  ('Transport', 'Tolls', '🛣️', '#3b82f6'),
  ('Transport', 'Car Service & Repair', '🔧', '#3b82f6'),
  ('Shopping', 'Clothing & Fashion', '👗', '#8b5cf6'),
  ('Shopping', 'Electronics', '💻', '#8b5cf6'),
  ('Shopping', 'Home & Garden', '🏡', '#8b5cf6'),
  ('Shopping', 'Online Shopping', '📦', '#8b5cf6'),
  ('Shopping', 'Department Store', '🏬', '#8b5cf6'),
  ('Health', 'Pharmacy', '💊', '#ef4444'),
  ('Health', 'Medical & Dental', '🏥', '#ef4444'),
  ('Health', 'Gym & Fitness', '💪', '#ef4444'),
  ('Health', 'Optical', '👓', '#ef4444'),
  ('Entertainment', 'Streaming Services', '📺', '#ec4899'),
  ('Entertainment', 'Movies & Events', '🎬', '#ec4899'),
  ('Entertainment', 'Sports & Recreation', '⚽', '#ec4899'),
  ('Entertainment', 'Hobbies', '🎯', '#ec4899'),
  ('Utilities', 'Electricity', '⚡', '#6b7280'),
  ('Utilities', 'Gas', '🔥', '#6b7280'),
  ('Utilities', 'Water', '💧', '#6b7280'),
  ('Utilities', 'Internet', '🌐', '#6b7280'),
  ('Utilities', 'Mobile Phone', '📱', '#6b7280'),
  ('Home', 'Rent & Mortgage', '🏠', '#84cc16'),
  ('Home', 'Home Insurance', '🛡️', '#84cc16'),
  ('Home', 'Strata & Body Corp', '🏢', '#84cc16'),
  ('Home', 'Home Maintenance', '🔨', '#84cc16'),
  ('Travel', 'Flights', '✈️', '#06b6d4'),
  ('Travel', 'Accommodation', '🏨', '#06b6d4'),
  ('Travel', 'Car Hire', '🚙', '#06b6d4'),
  ('Travel', 'Travel Insurance', '🧳', '#06b6d4'),
  ('Education', 'School & Uni Fees', '🎓', '#f97316'),
  ('Education', 'Books & Supplies', '📚', '#f97316'),
  ('Education', 'Online Courses', '💡', '#f97316'),
  ('Childcare', 'Childcare & Daycare', '👶', '#a78bfa'),
  ('Childcare', 'School Activities', '🎒', '#a78bfa'),
  ('Personal Care', 'Haircut & Beauty', '💇', '#fb7185'),
  ('Personal Care', 'Clothing & Accessories', '👔', '#fb7185'),
  ('Financial', 'Bank Fees', '🏦', '#94a3b8'),
  ('Financial', 'ATM Withdrawal', '💵', '#94a3b8'),
  ('Financial', 'Insurance', '📋', '#94a3b8'),
  ('Income', 'Salary', '💰', '#22c55e'),
  ('Income', 'Transfer', '↔️', '#22c55e'),
  ('Income', 'Refund', '↩️', '#22c55e'),
  ('Other', 'Miscellaneous', '❓', '#d1d5db');

-- Helper function: get monthly spend per category for a user
create or replace function get_monthly_spend(p_user_id uuid, p_month text)
returns table(category_id uuid, category_name text, subcategory text, total numeric)
language sql security definer as $$
  select
    c.id as category_id,
    c.name as category_name,
    c.subcategory,
    abs(sum(t.amount)) as total
  from transactions t
  join categories c on t.category_id = c.id
  where t.user_id = p_user_id
    and to_char(t.date, 'YYYY-MM') = p_month
    and t.amount < 0  -- expenses only
  group by c.id, c.name, c.subcategory
  order by total desc;
$$;
