// Polyfill WebSocket for Node.js environments
if (typeof globalThis.WebSocket === "undefined") {
  try {
    globalThis.WebSocket = require("ws");
  } catch (_) {
    globalThis.WebSocket = class DummyWebSocket {};
  }
}
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://tdmzscadnbskdnmjkgdl.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbXpzY2FkbmJza2RubWprZ2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTg5ODQsImV4cCI6MjEwNzM5NDk4NH0.1FhfaL9h2yPe5nd18uhicqMDp3P9ki-XkYmb_4vMCUQ';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbXpzY2FkbmJza2RubWprZ2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTgxODk4NCwiZXhwIjoyMTA3Mzk0OTg0fQ.7b_qHY5_NGK1jH0OFzks2NH0d9M8li8f5vZaj0bzEW0';

function ensureSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables.');
  }
}

function createSupabaseClient() {
  ensureSupabaseConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function createSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const defaultStorageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'progress-documents';

async function uploadToSupabaseStorage(fileBuffer, destinationPath, contentType = 'application/octet-stream', bucketName = defaultStorageBucket) {
  const client = createSupabaseAdminClient() || createSupabaseClient();
  if (!client) {
    throw new Error('Supabase client could not be initialized.');
  }

  const { data, error } = await client.storage
    .from(bucketName)
    .upload(destinationPath, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = client.storage
    .from(bucketName)
    .getPublicUrl(destinationPath);

  return urlData ? urlData.publicUrl : null;
}

module.exports = {
  supabase: supabaseUrl && supabaseAnonKey ? createSupabaseClient() : null,
  supabaseAdmin: createSupabaseAdminClient(),
  createSupabaseClient,
  createSupabaseAdminClient,
  ensureSupabaseConfig,
  uploadToSupabaseStorage,
  defaultStorageBucket,
};

