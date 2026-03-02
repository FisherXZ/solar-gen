-- Chat tables: persistent conversation history for chat-based EPC discovery

CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    parts JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_conversation
    ON chat_messages (conversation_id, created_at);

-- Updated_at trigger for conversations
CREATE TRIGGER chat_conversations_updated_at
    BEFORE UPDATE ON chat_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS: public read, service-role write
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read chat_conversations" ON chat_conversations
    FOR SELECT USING (true);

CREATE POLICY "Service role write chat_conversations" ON chat_conversations
    FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read chat_messages" ON chat_messages
    FOR SELECT USING (true);

CREATE POLICY "Service role write chat_messages" ON chat_messages
    FOR ALL USING (auth.role() = 'service_role');
