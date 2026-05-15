import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yxtlejxngeilsgpfnznc.supabase.co/rest/v1/'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4dGxlanhuZ2VpbHNncGZuem5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDM4MDgsImV4cCI6MjA5NDA3OTgwOH0.3uaLEhbvqjaToArZC3UnhmYVbDOgETEo668C8uLFX1c'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)