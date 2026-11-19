-- Run this entire file against your local MTOGO PostgreSQL database.
-- Development login: owner@mtogo.test / OwnerDev123!
-- Second owner: owner2@mtogo.test / OwnerDev123!
-- Customer: customer@mtogo.test / CustomerDev123!
-- Existing accounts keep their password. Existing restaurants/menus are reused.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    owner_email text;
    owner_name text;
    owner_password text;
    restaurant_address text;
    menu_name text;
    owner_uuid uuid;
    restaurant_uuid uuid;
BEGIN
    FOR owner_email, owner_name, owner_password, restaurant_address, menu_name IN
        VALUES
            ('owner@mtogo.test', 'Development Restaurant Owner', 'OwnerDev123!',
             'Testvej 1, 2100 Copenhagen', 'Main menu'),
            ('owner2@mtogo.test', 'Second Restaurant Owner', 'OwnerDev123!',
             'Testvej 2, 2100 Copenhagen', 'Second restaurant menu')
    LOOP
    -- Serialize concurrent runs for the same owner.
    PERFORM pg_advisory_xact_lock(hashtextextended(owner_email, 0));

    -- Hibernate's discriminator is separate from the application role.
    INSERT INTO users (dtype, id, name, email, passwordHash, role, createdAt)
    VALUES ('User', gen_random_uuid(), owner_name, owner_email,
            crypt(owner_password, gen_salt('bf', 12)),
            'RESTAURANT_OWNER', CURRENT_TIMESTAMP)
    ON CONFLICT (email) DO NOTHING;

    SELECT id INTO STRICT owner_uuid FROM users WHERE email = owner_email;

    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = owner_uuid AND role = 'RESTAURANT_OWNER'
    ) THEN
        RAISE EXCEPTION 'Account % exists but is not a restaurant owner', owner_email;
    END IF;

    SELECT id INTO restaurant_uuid
    FROM restaurants
    WHERE owner_id = owner_uuid AND address = restaurant_address
    ORDER BY id
    LIMIT 1;

    IF restaurant_uuid IS NULL THEN
        restaurant_uuid := gen_random_uuid();
        INSERT INTO restaurants (id, address, rating, owner_id)
        VALUES (restaurant_uuid, restaurant_address, NULL, owner_uuid);
    END IF;

    -- The actual table name in the Java mapping is "menues".
    IF NOT EXISTS (
        SELECT 1 FROM menues WHERE restaurant_id = restaurant_uuid
    ) THEN
        INSERT INTO menues (id, name, restaurant_id)
        VALUES (gen_random_uuid(), menu_name, restaurant_uuid);
    END IF;
    END LOOP;
END $$;

-- Provision a normal customer without changing any existing account password.
DO $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('customer@mtogo.test', 0));
    INSERT INTO users (dtype, id, name, email, passwordHash, role, createdAt)
    VALUES ('User', gen_random_uuid(), 'Development Customer', 'customer@mtogo.test',
            crypt('CustomerDev123!', gen_salt('bf', 12)),
            'CUSTOMER', CURRENT_TIMESTAMP)
    ON CONFLICT (email) DO NOTHING;

    IF NOT EXISTS (
        SELECT 1 FROM users WHERE email = 'customer@mtogo.test' AND role = 'CUSTOMER'
    ) THEN
        RAISE EXCEPTION 'Account customer@mtogo.test exists but is not a customer';
    END IF;
END $$;

-- Confirm the owner -> restaurant -> menu links without exposing the hash.
SELECT u.id AS owner_id, u.email, u.role,
       r.id AS restaurant_id, r.address,
       m.id AS menu_id, m.name AS menu_name
FROM users u
JOIN restaurants r ON r.owner_id = u.id
JOIN menues m ON m.restaurant_id = r.id
WHERE u.email IN ('owner@mtogo.test', 'owner2@mtogo.test');

SELECT id, email, role FROM users WHERE email = 'customer@mtogo.test';

COMMIT;
