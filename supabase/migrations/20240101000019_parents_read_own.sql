-- Allow a parent to read their own record (needed for FK joins in server actions)
CREATE POLICY "parents_read_own" ON parents
  FOR SELECT TO authenticated
  USING (id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid()));
