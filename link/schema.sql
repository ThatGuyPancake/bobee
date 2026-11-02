CREATE TABLE IF NOT EXISTS receivers (
 id TEXT PRIMARY KEY,
 receiver_hash TEXT UNIQUE NOT NULL,
 sender_hash TEXT UNIQUE,
 code_hash TEXT UNIQUE NOT NULL,
 expires INTEGER NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS deliveries (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 receiver_id TEXT NOT NULL REFERENCES receivers(id),
 id TEXT NOT NULL,
 pixels TEXT,
 digest TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','received','completed')),
 created INTEGER NOT NULL,
 UNIQUE(receiver_id,id)
);
CREATE INDEX IF NOT EXISTS delivery_inbox ON deliveries(receiver_id,status,sequence);
