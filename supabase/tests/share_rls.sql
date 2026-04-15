-- supabase/tests/share_rls.sql
--
-- RLS + SECURITY DEFINER integration tests for the share feature (migration 029).
-- Run against a local Supabase instance AFTER applying migrations.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f supabase/tests/share_rls.sql
--
-- Each block does one thing, RAISE NOTICEs a pass/fail, and rolls back so the
-- database state is unchanged. Asserts abort the script on failure.

\set ON_ERROR_STOP on
SET client_min_messages = NOTICE;

BEGIN;

-- ---------------------------------------------------------------------------
-- Test fixture: a user + conversation + two messages (one pre-share, one post)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_user_id UUID;
    v_conv_id UUID;
BEGIN
    -- Create a test user (if auth.users has a seeder this should match your pattern).
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (gen_random_uuid(), 'share-rls-test@example.com', 'authenticated', 'authenticated')
    RETURNING id INTO v_user_id;

    -- Conversation with a known share token and shared_at in the PAST.
    INSERT INTO chat_conversations (id, user_id, title, share_token, shared_at)
    VALUES (
        gen_random_uuid(),
        v_user_id,
        'Test: RLS share',
        'rls-test-token-abc',
        now() - interval '5 minutes'
    )
    RETURNING id INTO v_conv_id;

    -- Pre-share message (should appear via the function).
    INSERT INTO chat_messages (conversation_id, role, content, parts, created_at)
    VALUES (v_conv_id, 'user', 'before share', '[]'::jsonb, now() - interval '10 minutes');

    -- Post-share message (should NOT appear via the function).
    INSERT INTO chat_messages (conversation_id, role, content, parts, created_at)
    VALUES (v_conv_id, 'assistant', 'after share', '[]'::jsonb, now() - interval '1 minute');

    -- Save ids for later asserts
    PERFORM set_config('share_rls.user_id', v_user_id::text, true);
    PERFORM set_config('share_rls.conv_id', v_conv_id::text, true);
END $$;

-- ---------------------------------------------------------------------------
-- Test 1: anon role CAN call get_shared_conversation(valid_token)
-- and only receives pre-share messages
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_count INT;
BEGIN
    SET LOCAL ROLE anon;

    SELECT COUNT(*) INTO v_count
    FROM get_shared_conversation('rls-test-token-abc');

    RESET ROLE;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL test_1: expected 1 pre-share message, got %', v_count;
    END IF;
    RAISE NOTICE 'PASS test_1: anon can call get_shared_conversation, only sees pre-share messages';
END $$;

-- ---------------------------------------------------------------------------
-- Test 2: anon role CAN call get_shared_conversation with invalid token
-- and gets zero rows (no leak)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_count INT;
BEGIN
    SET LOCAL ROLE anon;
    SELECT COUNT(*) INTO v_count FROM get_shared_conversation('never-existed');
    RESET ROLE;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL test_2: invalid token leaked % rows', v_count;
    END IF;
    RAISE NOTICE 'PASS test_2: invalid token returns zero rows';
END $$;

-- ---------------------------------------------------------------------------
-- Test 3: anon role CANNOT read chat_messages directly (RLS blocks)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_count INT;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM chat_messages;
    EXCEPTION WHEN insufficient_privilege THEN
        v_count := -1;
    END;
    RESET ROLE;

    -- Either RLS returns 0 rows, or GRANT was never given and we get privilege error.
    -- Both are acceptable — neither exposes the raw table to anon.
    IF v_count IS NULL OR v_count > 0 THEN
        RAISE EXCEPTION 'FAIL test_3: anon read chat_messages returned % rows', v_count;
    END IF;
    RAISE NOTICE 'PASS test_3: anon cannot read chat_messages directly (rows=%)', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- Test 4: anon role CANNOT read chat_conversations directly
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_count INT;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM chat_conversations;
    EXCEPTION WHEN insufficient_privilege THEN
        v_count := -1;
    END;
    RESET ROLE;

    IF v_count IS NULL OR v_count > 0 THEN
        RAISE EXCEPTION 'FAIL test_4: anon read chat_conversations returned % rows', v_count;
    END IF;
    RAISE NOTICE 'PASS test_4: anon cannot read chat_conversations directly (rows=%)', v_count;
END $$;

-- ---------------------------------------------------------------------------
-- Test 5: revoking a token (setting share_token to NULL) makes the function
-- return zero rows for that token
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_conv_id UUID := current_setting('share_rls.conv_id')::uuid;
    v_count INT;
BEGIN
    UPDATE chat_conversations
        SET share_token = NULL, shared_at = NULL
        WHERE id = v_conv_id;

    SET LOCAL ROLE anon;
    SELECT COUNT(*) INTO v_count FROM get_shared_conversation('rls-test-token-abc');
    RESET ROLE;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAIL test_5: revoked token still returned % rows', v_count;
    END IF;
    RAISE NOTICE 'PASS test_5: revoked token returns zero rows';
END $$;

-- ---------------------------------------------------------------------------
-- Test 6: chat_share_access_log is not readable by anon
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_count INT;
BEGIN
    SET LOCAL ROLE anon;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM chat_share_access_log;
    EXCEPTION WHEN insufficient_privilege THEN
        v_count := -1;
    END;
    RESET ROLE;

    IF v_count IS NULL OR v_count > 0 THEN
        RAISE EXCEPTION 'FAIL test_6: anon read chat_share_access_log returned % rows', v_count;
    END IF;
    RAISE NOTICE 'PASS test_6: anon cannot read chat_share_access_log';
END $$;

ROLLBACK;

-- End of tests. Every DO block RAISEs NOTICE 'PASS' or EXCEPTION 'FAIL'.
