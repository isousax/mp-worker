-- Tabela principal de intenções de compra/pedido
CREATE TABLE IF NOT EXISTS intentions (
  intention_id TEXT PRIMARY KEY,               -- nanoid da intenção
  email TEXT NOT NULL,
  template_id TEXT NOT NULL,                   -- ex: 'nossa_historia'
  plan TEXT NOT NULL,                          -- ex: 'standard', 'premium'
  price NUMBER NOT NULL,                       -- você pode usar TEXT por simplicidade (ex: '19.90')
  preference_id TEXT,                          -- identifica a preferência do Mercado Pago
  status TEXT DEFAULT 'pending',               -- 'pending', 'approved', 'cancelled', etc.
  final_url TEXT NOT NULL,                     -- onde acessar o site gerado
  created_at TEXT NOT NULL,
  updated_at TEXT
);

DROP TABLE IF EXISTS nossa_historia;

-- Tabela de dados específicos do template "Nossa História"
CREATE TABLE IF NOT EXISTS nossa_historia (
  intention_id TEXT PRIMARY KEY,               -- mesmo ID da intenção
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',              -- 'pending', 'approved', 'cancelled', etc.
  form_data TEXT NOT NULL,                     -- JSON com todos os dados do template
  created_at TEXT NOT NULL,
  updated_at TEXT
  FOREIGN KEY (intention_id) REFERENCES intentions(intention_id) ON DELETE CASCADE
);