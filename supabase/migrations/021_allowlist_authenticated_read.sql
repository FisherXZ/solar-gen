-- Allow authenticated users to read allowed_emails table
-- Needed for middleware to check if user's email is still authorized on every request
DROP POLICY IF EXISTS "Authenticated read" ON allowed_emails;
CREATE POLICY "Authenticated read" ON allowed_emails
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Re-add fisher262425@gmail.com (was removed during testing)
INSERT INTO allowed_emails (email) VALUES ('fisher262425@gmail.com') ON CONFLICT DO NOTHING;
