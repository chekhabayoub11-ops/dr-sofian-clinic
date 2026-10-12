-- 1. Reset old policies
DROP POLICY IF EXISTS "Allow public read/update appointments" ON appointments;
DROP POLICY IF EXISTS "Allow public insert appointments" ON appointments;
DROP POLICY IF EXISTS "Patients can insert appointments only" ON appointments;
DROP POLICY IF EXISTS "Doctor can view and update appointments" ON appointments;

-- Policies do nothing unless RLS is enabled. Make this migration safe to apply
-- even when the table was created outside the Supabase dashboard defaults.
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;

-- 2. Portfolio demo: deny public inserts. Demo bookings are kept in memory.
CREATE POLICY "Patients can insert appointments only"
ON appointments FOR INSERT
TO anon
WITH CHECK (false);

-- 3. Portfolio demo: staff access is deliberately disabled. Only configure
--    authenticated staff policies in a separate, private production project.
CREATE POLICY "Doctor can view and update appointments"
ON appointments FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
