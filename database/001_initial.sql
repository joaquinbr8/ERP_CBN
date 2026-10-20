CREATE TABLE IF NOT EXISTS roles (id text PRIMARY KEY, name text NOT NULL, permissions text[] NOT NULL);
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, username text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL, role_id text REFERENCES roles(id), active boolean NOT NULL DEFAULT true);
ALTER TABLE users ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS warehouses (id text PRIMARY KEY, name text NOT NULL, center text NOT NULL DEFAULT 'CBN-PILOTO');
CREATE TABLE IF NOT EXISTS locations (id text PRIMARY KEY, name text NOT NULL, warehouse_id text NOT NULL REFERENCES warehouses(id));
CREATE TABLE IF NOT EXISTS suppliers (id text PRIMARY KEY, name text NOT NULL, contact text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS articles (id text PRIMARY KEY, name text NOT NULL, category text NOT NULL, unit text NOT NULL, policy text NOT NULL CHECK(policy IN ('FIFO','FEFO')), abc text NOT NULL CHECK(abc IN ('A','B','C')), daily_demand numeric(16,3) NOT NULL DEFAULT 0 CHECK(daily_demand>=0), lead_days integer NOT NULL DEFAULT 0 CHECK(lead_days>=0), safety_stock numeric(16,3) NOT NULL DEFAULT 0 CHECK(safety_stock>=0), version integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS lots (id text PRIMARY KEY, article_id text NOT NULL REFERENCES articles(id), expiry date, received_at timestamptz NOT NULL DEFAULT now(), quality text NOT NULL DEFAULT 'CUARENTENA' CHECK(quality IN ('CUARENTENA','LIBERADO','BLOQUEADO','RECHAZADO')), version integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS balances (lot_id text REFERENCES lots(id), location_id text REFERENCES locations(id), physical numeric(16,3) NOT NULL DEFAULT 0 CHECK(physical>=0), reserved numeric(16,3) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=physical), version integer NOT NULL DEFAULT 1, PRIMARY KEY(lot_id,location_id));
CREATE TABLE IF NOT EXISTS documents (id text PRIMARY KEY, kind text NOT NULL, status text NOT NULL, data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS reservations (id uuid PRIMARY KEY, document_id text NOT NULL REFERENCES documents(id), lot_id text NOT NULL REFERENCES lots(id), location_id text NOT NULL REFERENCES locations(id), quantity numeric(16,3) NOT NULL CHECK(quantity>0), status text NOT NULL DEFAULT 'ACTIVA', explanation text NOT NULL);
CREATE TABLE IF NOT EXISTS movements (id uuid PRIMARY KEY, business_key text UNIQUE NOT NULL, type text NOT NULL, lot_id text NOT NULL REFERENCES lots(id), location_id text NOT NULL REFERENCES locations(id), quantity numeric(16,3) NOT NULL, document_id text, reason text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS genealogy (parent_lot text REFERENCES lots(id), child_lot text REFERENCES lots(id), document_id text REFERENCES documents(id), quantity numeric(16,3) NOT NULL, PRIMARY KEY(parent_lot,child_lot,document_id));
CREATE TABLE IF NOT EXISTS counts (id uuid PRIMARY KEY, lot_id text NOT NULL REFERENCES lots(id), location_id text NOT NULL REFERENCES locations(id), theoretical numeric(16,3) NOT NULL, counted numeric(16,3) NOT NULL CHECK(counted>=0), balance_version integer NOT NULL, status text NOT NULL DEFAULT 'PENDIENTE', reason text NOT NULL, created_by text NOT NULL, approved_by text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS inbox (id uuid PRIMARY KEY, source text NOT NULL, event_id text NOT NULL, business_key text NOT NULL, fingerprint text NOT NULL, result jsonb, status text NOT NULL DEFAULT 'PROCESANDO', attempts integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source,event_id));
CREATE TABLE IF NOT EXISTS business_effects (business_key text PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (id uuid PRIMARY KEY, event_type text NOT NULL, payload jsonb NOT NULL, destination text NOT NULL, status text NOT NULL DEFAULT 'PENDIENTE', attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(), last_error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz);
CREATE TABLE IF NOT EXISTS deliveries (event_id uuid PRIMARY KEY, destination text NOT NULL, payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit (id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS suggestions (id uuid PRIMARY KEY, article_id text NOT NULL REFERENCES articles(id), position numeric(16,3) NOT NULL, rop numeric(16,3) NOT NULL, status text NOT NULL DEFAULT 'ABIERTA', version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS one_open_suggestion ON suggestions(article_id) WHERE status='ABIERTA';
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(status,next_attempt);
CREATE INDEX IF NOT EXISTS movements_lot ON movements(lot_id,created_at);
CREATE OR REPLACE FUNCTION prevent_history_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'El historial es inmutable; utilice un movimiento compensatorio autorizado'; END $$;
DROP TRIGGER IF EXISTS immutable_movements ON movements;
CREATE TRIGGER immutable_movements BEFORE UPDATE OR DELETE ON movements FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
DROP TRIGGER IF EXISTS immutable_audit ON audit;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION prevent_history_change();
CREATE OR REPLACE VIEW inventory_view AS SELECT b.*, l.article_id,a.name article,a.category,a.unit,a.policy,a.abc,l.quality,l.expiry,l.received_at,l.version lot_version,loc.warehouse_id,
CASE WHEN l.quality='LIBERADO' AND (l.expiry IS NULL OR l.expiry>=CURRENT_DATE) THEN b.physical-b.reserved ELSE 0 END available,
CASE WHEN l.quality<>'LIBERADO' OR l.expiry<CURRENT_DATE THEN b.physical ELSE 0 END blocked
FROM balances b JOIN lots l ON l.id=b.lot_id JOIN articles a ON a.id=l.article_id JOIN locations loc ON loc.id=b.location_id;
CREATE OR REPLACE VIEW bi_inventory AS SELECT article_id,article,category,unit,warehouse_id,quality,SUM(physical) physical,SUM(reserved) reserved,SUM(available) available FROM inventory_view GROUP BY article_id,article,category,unit,warehouse_id,quality;
CREATE OR REPLACE VIEW inventory_reconciliation AS
SELECT b.lot_id,b.location_id,b.physical,
COALESCE((SELECT SUM(m.quantity) FROM movements m WHERE m.lot_id=b.lot_id AND m.location_id=b.location_id),0) ledger,
b.reserved,COALESCE((SELECT SUM(r.quantity) FROM reservations r WHERE r.lot_id=b.lot_id AND r.location_id=b.location_id AND r.status='ACTIVA'),0) reservation_total
FROM balances b;
