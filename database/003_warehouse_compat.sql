BEGIN;

-- La tabla física permanece en 3FN: solo conserva plant_id. Esta vista expone
-- temporalmente el nombre de la planta como `center` para procesos del API que
-- ya estaban abiertos antes de la migración 002.
ALTER TABLE warehouses RENAME TO warehouse_definitions;

CREATE VIEW warehouses AS
SELECT w.id,w.name,w.plant_id,p.name AS center
FROM warehouse_definitions w
JOIN plants p ON p.id=w.plant_id;

CREATE FUNCTION warehouses_compat_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO warehouse_definitions(id,name,plant_id)
    VALUES(NEW.id,NEW.name,COALESCE(NEW.plant_id,
      (SELECT id FROM plants WHERE name=NEW.center)))
    RETURNING id,name,plant_id INTO NEW.id,NEW.name,NEW.plant_id;
    SELECT name INTO NEW.center FROM plants WHERE id=NEW.plant_id;
  ELSIF TG_OP='UPDATE' THEN
    UPDATE warehouse_definitions
       SET name=NEW.name,
           plant_id=COALESCE(NEW.plant_id,(SELECT id FROM plants WHERE name=NEW.center))
     WHERE id=OLD.id;
  ELSIF TG_OP='DELETE' THEN
    DELETE FROM warehouse_definitions WHERE id=OLD.id;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE TRIGGER warehouses_compat_write_trigger
INSTEAD OF INSERT OR UPDATE OR DELETE ON warehouses
FOR EACH ROW EXECUTE FUNCTION warehouses_compat_write();

INSERT INTO schema_migrations(version,description)
VALUES('003','Vista compatible planta-almacén sobre modelo físico 3FN');

COMMIT;
