-- Family sharing migration
-- Run this in the Supabase SQL editor

-- 1. Add owner_id to families
ALTER TABLE families ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES profiles(id);

-- 2. Family invitations table
CREATE TABLE IF NOT EXISTS family_invitations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  family_id uuid REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  email text,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES profiles(id),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3. RLS for families
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view family" ON families FOR SELECT
  USING (id IN (SELECT family_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Authenticated users can create family" ON families FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Family owner can update family" ON families FOR UPDATE
  USING (owner_id = auth.uid());

-- 4. RLS for family_invitations
ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can manage invitations" ON family_invitations FOR ALL
  USING (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Anyone can read invite by token" ON family_invitations FOR SELECT
  USING (true);

-- 5. Allow family members to see each other's profiles (name only)
CREATE POLICY "Family members can view family profiles" ON profiles FOR SELECT
  USING (
    auth.uid() = id OR
    (family_id IS NOT NULL AND family_id = (SELECT family_id FROM profiles WHERE id = auth.uid()))
  );

-- 6. Update get_monthly_spend to support family_id
CREATE OR REPLACE FUNCTION get_family_monthly_spend(p_family_id uuid, p_month text)
RETURNS TABLE(category_id uuid, category_name text, subcategory text, total numeric)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    c.id AS category_id,
    c.name AS category_name,
    c.subcategory,
    ABS(SUM(t.amount)) AS total
  FROM transactions t
  JOIN categories c ON t.category_id = c.id
  JOIN profiles p ON t.user_id = p.id
  WHERE p.family_id = p_family_id
    AND to_char(t.date, 'YYYY-MM') = p_month
    AND t.amount < 0
  GROUP BY c.id, c.name, c.subcategory
  ORDER BY total DESC;
$$;
