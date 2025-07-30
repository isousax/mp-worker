CREATE TABLE IF NOT EXISTS intentions_db (
  id TEXT PRIMARY KEY,
  email TEXT,
  template_id TEXT,
  plan TEXT,
  form_data TEXT,
  preference_id TEXT,
  status TEXT DEFAULT 'pending',
  final_url TEXT,
  created_at TEXT
);