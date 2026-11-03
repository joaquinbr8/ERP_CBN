BEGIN;

-- 002 · Normalización del dominio operativo a tercera forma normal.
-- Esta migración conserva los identificadores y los datos del piloto. Las vistas
-- de compatibilidad mantienen estable el contrato REST mientras el modelo físico
-- elimina dependencias transitivas, grupos repetitivos y agregados duplicados.

CREATE TABLE plants (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  region text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO plants(id,name,region)
SELECT DISTINCT
  CASE center
    WHEN 'CBN-PILOTO' THEN 'CBN-PILOTO'
    WHEN 'La Paz' THEN 'LA-PAZ'
    WHEN 'Oruro' THEN 'ORURO'
    WHEN 'Cochabamba' THEN 'COCHABAMBA'
    WHEN 'Santa Cruz' THEN 'SANTA-CRUZ'
    ELSE upper(regexp_replace(center,'[^A-Za-z0-9]+','-','g'))
  END,
  center,
  center
FROM warehouses;

ALTER TABLE warehouses ADD COLUMN plant_id text;
UPDATE warehouses w SET plant_id=p.id FROM plants p WHERE p.name=w.center;
ALTER TABLE warehouses ALTER COLUMN plant_id SET NOT NULL;
ALTER TABLE warehouses ADD CONSTRAINT warehouses_plant_fk
  FOREIGN KEY(plant_id) REFERENCES plants(id);
ALTER TABLE warehouses ADD CONSTRAINT warehouses_plant_name_uk
  UNIQUE(plant_id,name);
ALTER TABLE warehouses DROP COLUMN center;
ALTER TABLE locations ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE locations ADD CONSTRAINT locations_warehouse_name_uk
  UNIQUE(warehouse_id,name);
ALTER TABLE suppliers ADD CONSTRAINT suppliers_name_uk UNIQUE(name);

-- Los permisos son una relación N:M; un arreglo dentro de roles no es 1FN.
CREATE TABLE permissions (
  id text PRIMARY KEY,
  description text NOT NULL UNIQUE
);
CREATE TABLE role_permissions (
  role_id text NOT NULL REFERENCES roles(id),
  permission_id text NOT NULL REFERENCES permissions(id),
  PRIMARY KEY(role_id,permission_id)
);
INSERT INTO permissions(id,description)
SELECT DISTINCT permission, permission
FROM roles CROSS JOIN LATERAL unnest(permissions) permission;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,permission FROM roles r CROSS JOIN LATERAL unnest(r.permissions) permission;
ALTER TABLE roles RENAME TO role_definitions;
ALTER TABLE role_definitions DROP COLUMN permissions;
ALTER TABLE role_definitions ADD CONSTRAINT role_definitions_name_uk UNIQUE(name);
ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;

CREATE VIEW roles AS
SELECT r.id,r.name,
       COALESCE(array_agg(rp.permission_id ORDER BY rp.permission_id)
                FILTER (WHERE rp.permission_id IS NOT NULL),'{}'::text[]) permissions
FROM role_definitions r
LEFT JOIN role_permissions rp ON rp.role_id=r.id
GROUP BY r.id,r.name;

CREATE FUNCTION roles_compat_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE permission_id text;
BEGIN
  INSERT INTO role_definitions(id,name) VALUES(NEW.id,NEW.name);
  FOREACH permission_id IN ARRAY COALESCE(NEW.permissions,'{}'::text[]) LOOP
    INSERT INTO permissions(id,description) VALUES(permission_id,permission_id)
      ON CONFLICT(id) DO NOTHING;
    INSERT INTO role_permissions(role_id,permission_id) VALUES(NEW.id,permission_id);
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER roles_compat_insert_trigger
INSTEAD OF INSERT ON roles FOR EACH ROW EXECUTE FUNCTION roles_compat_insert();

-- Actor operativo: permite FK tanto para usuarios como para procesos controlados.
CREATE TABLE actors (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('USER','SYSTEM','INTEGRATION')),
  user_id uuid UNIQUE REFERENCES users(id),
  CHECK((kind='USER' AND user_id IS NOT NULL) OR (kind<>'USER' AND user_id IS NULL))
);
INSERT INTO actors(id,kind,user_id)
SELECT username,'USER',id FROM users;
INSERT INTO actors(id,kind)
SELECT actor,'SYSTEM' FROM (
  SELECT actor FROM movements
  UNION SELECT created_by FROM counts
  UNION SELECT approved_by FROM counts WHERE approved_by IS NOT NULL
  UNION SELECT actor FROM audit
) source
WHERE actor NOT IN (SELECT id FROM actors)
ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION sync_user_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO actors(id,kind,user_id) VALUES(NEW.username,'USER',NEW.id)
  ON CONFLICT(id) DO UPDATE SET kind='USER',user_id=EXCLUDED.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_user_actor_trigger
AFTER INSERT OR UPDATE OF username ON users FOR EACH ROW EXECUTE FUNCTION sync_user_actor();

ALTER TABLE movements ADD CONSTRAINT movements_actor_fk FOREIGN KEY(actor) REFERENCES actors(id);
ALTER TABLE counts ADD CONSTRAINT counts_created_by_fk FOREIGN KEY(created_by) REFERENCES actors(id);
ALTER TABLE counts ADD CONSTRAINT counts_approved_by_fk FOREIGN KEY(approved_by) REFERENCES actors(id);
ALTER TABLE audit ADD CONSTRAINT audit_actor_fk FOREIGN KEY(actor) REFERENCES actors(id);

-- Al adoptar el libro de movimientos como fuente auditable, cualquier saldo
-- histórico que carecía de su asiento se regulariza con un movimiento explícito.
-- No se altera el físico: se completa su trazabilidad contable.
INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,reason,actor)
SELECT md5('migration:002:'||b.lot_id||':'||b.location_id)::uuid,
       'migration:002:reconciliation:'||b.lot_id||':'||b.location_id,
       'CONCILIACION_MIGRACION',b.lot_id,b.location_id,
       b.physical-COALESCE(m.ledger,0),
       'Asiento de conciliación al normalizar el modelo 3FN','sistema'
FROM balances b
LEFT JOIN (
  SELECT lot_id,location_id,SUM(quantity) ledger
  FROM movements GROUP BY lot_id,location_id
) m USING(lot_id,location_id)
WHERE b.physical<>COALESCE(m.ledger,0)
ON CONFLICT(business_key) DO NOTHING;

-- El saldo reservado se deriva de reservations: no se almacena dos veces.
DROP VIEW IF EXISTS inventory_reconciliation;
DROP VIEW IF EXISTS bi_inventory;
DROP VIEW IF EXISTS inventory_view;

ALTER TABLE balances RENAME TO inventory_positions;
ALTER TABLE inventory_positions ALTER COLUMN lot_id SET NOT NULL;
ALTER TABLE inventory_positions ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE inventory_positions DROP COLUMN reserved;

CREATE VIEW balances AS
SELECT p.lot_id,p.location_id,p.physical,
       COALESCE((SELECT SUM(r.quantity) FROM reservations r
                 WHERE r.lot_id=p.lot_id AND r.location_id=p.location_id
                   AND r.status='ACTIVA'),0)::numeric(16,3) reserved,
       p.version
FROM inventory_positions p;

CREATE FUNCTION balances_compat_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO inventory_positions(lot_id,location_id,physical,version)
    VALUES(NEW.lot_id,NEW.location_id,COALESCE(NEW.physical,0),COALESCE(NEW.version,1))
    ON CONFLICT(lot_id,location_id) DO NOTHING;
  ELSIF TG_OP='UPDATE' THEN
    UPDATE inventory_positions SET physical=NEW.physical,version=NEW.version
    WHERE lot_id=OLD.lot_id AND location_id=OLD.location_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER balances_compat_write_trigger
INSTEAD OF INSERT OR UPDATE ON balances FOR EACH ROW EXECUTE FUNCTION balances_compat_write();

CREATE FUNCTION enforce_reservation_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_lot text; target_location text; active_reserved numeric; on_hand numeric;
BEGIN
  target_lot=COALESCE(NEW.lot_id,OLD.lot_id);
  target_location=COALESCE(NEW.location_id,OLD.location_id);
  SELECT physical INTO on_hand FROM inventory_positions
   WHERE lot_id=target_lot AND location_id=target_location FOR UPDATE;
  SELECT COALESCE(SUM(quantity),0) INTO active_reserved FROM reservations
   WHERE lot_id=target_lot AND location_id=target_location AND status='ACTIVA';
  IF active_reserved>COALESCE(on_hand,0) THEN
    RAISE EXCEPTION 'Las reservas activas (%) exceden el físico (%) para lote % / ubicación %',
      active_reserved,on_hand,target_lot,target_location;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservations_capacity_trigger
AFTER INSERT OR UPDATE OR DELETE ON reservations DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_reservation_capacity();

-- Encabezado documental y subtipos: se elimina el JSON de negocio de documents.
CREATE TABLE document_lines (
  document_id text NOT NULL REFERENCES documents(id),
  line_no smallint NOT NULL CHECK(line_no>0),
  article_id text NOT NULL REFERENCES articles(id),
  quantity numeric(16,3) NOT NULL CHECK(quantity>0),
  received_quantity numeric(16,3) NOT NULL DEFAULT 0 CHECK(received_quantity>=0 AND received_quantity<=quantity),
  PRIMARY KEY(document_id,line_no)
);
CREATE TABLE purchase_requests (
  document_id text PRIMARY KEY REFERENCES documents(id),
  reason text NOT NULL,
  purchase_document_id text UNIQUE REFERENCES documents(id)
);
CREATE TABLE purchase_orders (
  document_id text PRIMARY KEY REFERENCES documents(id),
  supplier_id text NOT NULL REFERENCES suppliers(id),
  request_document_id text UNIQUE REFERENCES documents(id)
);
CREATE TABLE sales_orders (
  document_id text PRIMARY KEY REFERENCES documents(id),
  warehouse_id text NOT NULL REFERENCES warehouses(id),
  customer text NOT NULL,
  payment_type text NOT NULL DEFAULT 'Referencia externa',
  promised_date date,
  promise_version integer NOT NULL DEFAULT 0 CHECK(promise_version>=0),
  promised_atp numeric(16,3) CHECK(promised_atp>=0),
  preparation_days integer CHECK(preparation_days BETWEEN 0 AND 365),
  transit_days integer CHECK(transit_days BETWEEN 0 AND 365),
  promise_note text,
  delivery_evidence text,
  returned_quantity numeric(16,3) NOT NULL DEFAULT 0 CHECK(returned_quantity>=0)
);
CREATE TABLE transfer_orders (
  document_id text PRIMARY KEY REFERENCES documents(id),
  lot_id text NOT NULL REFERENCES lots(id),
  from_location_id text NOT NULL REFERENCES locations(id),
  to_location_id text NOT NULL REFERENCES locations(id),
  quantity numeric(16,3) NOT NULL CHECK(quantity>0),
  CHECK(from_location_id<>to_location_id)
);
CREATE TABLE production_orders (
  document_id text PRIMARY KEY REFERENCES documents(id),
  warehouse_id text NOT NULL REFERENCES warehouses(id),
  input_article_id text NOT NULL REFERENCES articles(id),
  output_article_id text NOT NULL REFERENCES articles(id),
  input_quantity numeric(16,3) NOT NULL CHECK(input_quantity>0),
  output_lot_id text REFERENCES lots(id),
  good_quantity numeric(16,3) CHECK(good_quantity>=0),
  loss_quantity numeric(16,3) CHECK(loss_quantity>=0),
  CHECK(input_article_id<>output_article_id)
);
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_purchase_subtype_fk
  FOREIGN KEY(purchase_document_id) REFERENCES purchase_orders(document_id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_request_subtype_fk
  FOREIGN KEY(request_document_id) REFERENCES purchase_requests(document_id)
  DEFERRABLE INITIALLY DEFERRED;

INSERT INTO document_lines(document_id,line_no,article_id,quantity,received_quantity)
SELECT id,1,data->>'articleId',(data->>'quantity')::numeric,
       COALESCE((data->>'received')::numeric,0)
FROM documents WHERE kind IN ('SOLICITUD','COMPRA','PEDIDO');
INSERT INTO purchase_requests(document_id,reason,purchase_document_id)
SELECT id,COALESCE(NULLIF(data->>'reason',''),'Necesidad registrada'),data->>'purchaseId'
FROM documents WHERE kind='SOLICITUD';
INSERT INTO purchase_orders(document_id,supplier_id,request_document_id)
SELECT id,data->>'supplierId',data->>'requestId' FROM documents WHERE kind='COMPRA';
INSERT INTO sales_orders(document_id,warehouse_id,customer,payment_type,promised_date,
                         promise_version,promised_atp,preparation_days,transit_days,promise_note,
                         delivery_evidence,returned_quantity)
SELECT id,data->>'warehouseId',data->>'customer',COALESCE(data->>'paymentType','Referencia externa'),
       NULLIF(data#>>'{promise,date}','')::date,
       COALESCE((data#>>'{promise,version}')::integer,0),
       NULLIF(data#>>'{promise,atp}','')::numeric,
       NULLIF(data#>>'{promise,preparationDays}','')::integer,
       NULLIF(data#>>'{promise,transitDays}','')::integer,
       data#>>'{promise,note}',data->>'evidence',COALESCE((data->>'returned')::numeric,0)
FROM documents WHERE kind='PEDIDO';
INSERT INTO transfer_orders(document_id,lot_id,from_location_id,to_location_id,quantity)
SELECT id,data->>'lotId',data->>'fromLocation',data->>'toLocation',(data->>'quantity')::numeric
FROM documents WHERE kind='TRASLADO';
INSERT INTO production_orders(document_id,warehouse_id,input_article_id,output_article_id,input_quantity,
                              output_lot_id,good_quantity,loss_quantity)
SELECT id,data->>'warehouseId',data->>'inputArticle',data->>'outputArticle',
       (data->>'inputQuantity')::numeric,data->>'lotId',
       NULLIF(data->>'good','')::numeric,NULLIF(data->>'loss','')::numeric
FROM documents WHERE kind='PRODUCCION';

-- Referencias históricas de movimientos que no eran documentos explícitos.
INSERT INTO documents(id,kind,status,data)
SELECT DISTINCT m.document_id,'OPERACION','REGISTRADA','{}'::jsonb
FROM movements m LEFT JOIN documents d ON d.id=m.document_id
WHERE m.document_id IS NOT NULL AND d.id IS NULL;

ALTER TABLE documents RENAME TO document_headers;
ALTER TABLE document_headers DROP COLUMN data;
ALTER TABLE document_headers ADD CONSTRAINT document_headers_kind_ck
  CHECK(kind IN ('SOLICITUD','COMPRA','PEDIDO','TRASLADO','PRODUCCION','OPERACION'));
ALTER TABLE movements ADD CONSTRAINT movements_document_fk
  FOREIGN KEY(document_id) REFERENCES document_headers(id);

CREATE FUNCTION canonical_quantity(value numeric) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT trim(trailing '.' FROM trim(trailing '0' FROM value::text))
$$;

CREATE VIEW documents AS
SELECT h.id,h.kind,h.status,
  CASE h.kind
    WHEN 'SOLICITUD' THEN jsonb_strip_nulls(jsonb_build_object(
      'articleId',dl.article_id,'quantity',canonical_quantity(dl.quantity),'reason',pr.reason,
      'purchaseId',pr.purchase_document_id))
    WHEN 'COMPRA' THEN jsonb_strip_nulls(jsonb_build_object(
      'articleId',dl.article_id,'quantity',canonical_quantity(dl.quantity),'received',canonical_quantity(dl.received_quantity),
      'supplierId',po.supplier_id,'requestId',po.request_document_id))
    WHEN 'PEDIDO' THEN jsonb_strip_nulls(jsonb_build_object(
      'articleId',dl.article_id,'quantity',canonical_quantity(dl.quantity),'warehouseId',so.warehouse_id,
      'customer',so.customer,'paymentType',so.payment_type,'evidence',so.delivery_evidence,
      'returned',canonical_quantity(so.returned_quantity),
      'promise',CASE WHEN so.promise_version>0 THEN jsonb_build_object(
        'version',so.promise_version,'date',so.promised_date,'atp',canonical_quantity(so.promised_atp),
        'preparationDays',so.preparation_days,'transitDays',so.transit_days,'note',so.promise_note) END))
    WHEN 'TRASLADO' THEN jsonb_build_object('lotId',tr.lot_id,'fromLocation',tr.from_location_id,
      'toLocation',tr.to_location_id,'quantity',canonical_quantity(tr.quantity))
    WHEN 'PRODUCCION' THEN jsonb_strip_nulls(jsonb_build_object(
      'warehouseId',prod.warehouse_id,'inputArticle',prod.input_article_id,
      'outputArticle',prod.output_article_id,'inputQuantity',canonical_quantity(prod.input_quantity),
      'lotId',prod.output_lot_id,'good',canonical_quantity(prod.good_quantity),'loss',canonical_quantity(prod.loss_quantity)))
    ELSE '{}'::jsonb
  END data,
  h.version,h.created_at
FROM document_headers h
LEFT JOIN document_lines dl ON dl.document_id=h.id AND dl.line_no=1
LEFT JOIN purchase_requests pr ON pr.document_id=h.id
LEFT JOIN purchase_orders po ON po.document_id=h.id
LEFT JOIN sales_orders so ON so.document_id=h.id
LEFT JOIN transfer_orders tr ON tr.document_id=h.id
LEFT JOIN production_orders prod ON prod.document_id=h.id;

CREATE FUNCTION documents_compat_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO document_headers(id,kind,status,version,created_at)
      VALUES(NEW.id,NEW.kind,NEW.status,COALESCE(NEW.version,1),COALESCE(NEW.created_at,now()));
    IF NEW.kind IN ('SOLICITUD','COMPRA','PEDIDO') THEN
      INSERT INTO document_lines(document_id,line_no,article_id,quantity,received_quantity)
      VALUES(NEW.id,1,NEW.data->>'articleId',(NEW.data->>'quantity')::numeric,
             COALESCE((NEW.data->>'received')::numeric,0));
    END IF;
    IF NEW.kind='SOLICITUD' THEN
      INSERT INTO purchase_requests VALUES(NEW.id,NEW.data->>'reason',NEW.data->>'purchaseId');
    ELSIF NEW.kind='COMPRA' THEN
      INSERT INTO purchase_orders VALUES(NEW.id,NEW.data->>'supplierId',NEW.data->>'requestId');
    ELSIF NEW.kind='PEDIDO' THEN
      INSERT INTO sales_orders(document_id,warehouse_id,customer,payment_type)
      VALUES(NEW.id,NEW.data->>'warehouseId',NEW.data->>'customer',
             COALESCE(NEW.data->>'paymentType','Referencia externa'));
    ELSIF NEW.kind='TRASLADO' THEN
      INSERT INTO transfer_orders VALUES(NEW.id,NEW.data->>'lotId',NEW.data->>'fromLocation',
        NEW.data->>'toLocation',(NEW.data->>'quantity')::numeric);
    ELSIF NEW.kind='PRODUCCION' THEN
      INSERT INTO production_orders(document_id,warehouse_id,input_article_id,output_article_id,input_quantity)
      VALUES(NEW.id,NEW.data->>'warehouseId',NEW.data->>'inputArticle',NEW.data->>'outputArticle',
             (NEW.data->>'inputQuantity')::numeric);
    END IF;
  ELSIF TG_OP='UPDATE' THEN
    UPDATE document_headers SET status=NEW.status,version=NEW.version WHERE id=OLD.id;
    IF NEW.kind IN ('SOLICITUD','COMPRA','PEDIDO') THEN
      UPDATE document_lines SET quantity=(NEW.data->>'quantity')::numeric,
        received_quantity=COALESCE((NEW.data->>'received')::numeric,received_quantity)
      WHERE document_id=OLD.id AND line_no=1;
    END IF;
    IF NEW.kind='SOLICITUD' THEN
      UPDATE purchase_requests SET reason=NEW.data->>'reason',purchase_document_id=NEW.data->>'purchaseId'
      WHERE document_id=OLD.id;
    ELSIF NEW.kind='PEDIDO' THEN
      UPDATE sales_orders SET delivery_evidence=NEW.data->>'evidence',
        returned_quantity=COALESCE((NEW.data->>'returned')::numeric,returned_quantity),
        promised_date=NULLIF(NEW.data#>>'{promise,date}','')::date,
        promise_version=COALESCE((NEW.data#>>'{promise,version}')::integer,0),
        promised_atp=NULLIF(NEW.data#>>'{promise,atp}','')::numeric,
        preparation_days=NULLIF(NEW.data#>>'{promise,preparationDays}','')::integer,
        transit_days=NULLIF(NEW.data#>>'{promise,transitDays}','')::integer,
        promise_note=NEW.data#>>'{promise,note}'
      WHERE document_id=OLD.id;
    ELSIF NEW.kind='PRODUCCION' THEN
      UPDATE production_orders SET output_lot_id=NEW.data->>'lotId',
        good_quantity=NULLIF(NEW.data->>'good','')::numeric,
        loss_quantity=NULLIF(NEW.data->>'loss','')::numeric WHERE document_id=OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documents_compat_write_trigger
INSTEAD OF INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION documents_compat_write();

ALTER TABLE reservations ADD CONSTRAINT reservations_allocation_uk
  UNIQUE(document_id,lot_id,location_id);
ALTER TABLE reservations ADD CONSTRAINT reservations_status_ck
  CHECK(status IN ('ACTIVA','LIBERADA','CONSUMIDA','COMPLETADA'));
ALTER TABLE counts ADD CONSTRAINT counts_status_ck CHECK(status IN ('PENDIENTE','APROBADO'));
CREATE UNIQUE INDEX one_pending_count_per_position
  ON counts(lot_id,location_id) WHERE status='PENDIENTE';
ALTER TABLE genealogy ALTER COLUMN parent_lot SET NOT NULL;
ALTER TABLE genealogy ALTER COLUMN child_lot SET NOT NULL;
ALTER TABLE genealogy ALTER COLUMN document_id SET NOT NULL;
ALTER TABLE genealogy ADD CONSTRAINT genealogy_quantity_ck CHECK(quantity>0);

-- La reposición es por posición SKU–almacén, no solo por artículo.
ALTER TABLE suggestions ADD COLUMN warehouse_id text REFERENCES warehouses(id);
UPDATE suggestions SET warehouse_id='PLANTA' WHERE warehouse_id IS NULL;
ALTER TABLE suggestions ALTER COLUMN warehouse_id SET NOT NULL;
DROP INDEX one_open_suggestion;
CREATE UNIQUE INDEX one_open_suggestion
  ON suggestions(article_id,warehouse_id) WHERE status='ABIERTA';
ALTER TABLE suggestions ADD CONSTRAINT suggestions_status_ck CHECK(status IN ('ABIERTA','RESUELTA'));

ALTER TABLE inbox ADD CONSTRAINT inbox_attempts_ck CHECK(attempts>=1);
ALTER TABLE inbox ADD CONSTRAINT inbox_status_ck
  CHECK(status IN ('PROCESANDO','APLICADO','DUPLICADO','ERROR'));
ALTER TABLE outbox ADD CONSTRAINT outbox_attempts_ck CHECK(attempts>=0);
ALTER TABLE outbox ADD CONSTRAINT outbox_status_ck
  CHECK(status IN ('PENDIENTE','ENVIADO','REVISION'));

-- Vistas derivadas: no forman parte del modelo lógico 3FN.
CREATE OR REPLACE VIEW inventory_view AS
SELECT b.*,l.article_id,a.name article,a.category,a.unit,a.policy,a.abc,
       l.quality,l.expiry,l.received_at,l.version lot_version,loc.warehouse_id,
       CASE WHEN l.quality='LIBERADO' AND (l.expiry IS NULL OR l.expiry>=CURRENT_DATE)
            THEN b.physical-b.reserved ELSE 0 END available,
       CASE WHEN l.quality<>'LIBERADO' OR l.expiry<CURRENT_DATE THEN b.physical ELSE 0 END blocked
FROM balances b JOIN lots l ON l.id=b.lot_id JOIN articles a ON a.id=l.article_id
JOIN locations loc ON loc.id=b.location_id;

CREATE OR REPLACE VIEW bi_inventory AS
SELECT article_id,article,category,unit,warehouse_id,quality,
       SUM(physical) physical,SUM(reserved) reserved,SUM(available) available
FROM inventory_view GROUP BY article_id,article,category,unit,warehouse_id,quality;

CREATE OR REPLACE VIEW inventory_reconciliation AS
SELECT p.lot_id,p.location_id,p.physical,
       COALESCE((SELECT SUM(m.quantity) FROM movements m
                 WHERE m.lot_id=p.lot_id AND m.location_id=p.location_id),0) ledger,
       b.reserved,b.reserved reservation_total
FROM inventory_positions p JOIN balances b USING(lot_id,location_id);

CREATE TABLE schema_migrations (
  version text PRIMARY KEY,
  description text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version,description)
VALUES('002','Normalización 3FN del dominio de inventarios');

COMMIT;
