-- Add excluded column to transactions (for excluding from budget calculations)
alter table transactions add column if not exists excluded boolean default false;

-- Update get_monthly_spend to skip excluded transactions
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
    and t.excluded is not true
  group by c.id, c.name, c.subcategory
  order by total desc;
$$;
