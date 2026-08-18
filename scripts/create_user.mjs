// Create a Supabase Auth user and link it to the ERP users table.
//
// Usage:
//   node scripts/create_user.mjs --email admin@xp.com --password 'secret' --role admin
//   node scripts/create_user.mjs --email pm@xp.com --password 'secret' --role member --person "홍길동"
//
// Roles: admin | partner | member
// --person links the account to a people row by exact name_ko match,
// which is what gives PL/PM edit rights on their own projects.

import postgres from "postgres";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const email = arg("email");
const password = arg("password");
const role = arg("role") ?? "member";
const personName = arg("person");

if (!email || !password) {
  console.error("Usage: node scripts/create_user.mjs --email <email> --password <password> [--role admin|partner|member] [--person <name_ko>]");
  process.exit(1);
}
if (!["admin", "partner", "member"].includes(role)) {
  console.error(`Invalid role: ${role}`);
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl || databaseUrl.includes("[YOUR-PASSWORD]")) {
  console.error("SUPABASE_DB_URL is required (set it in .env.local).");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, ssl: "require", prepare: false });

try {
  let personId = null;
  if (personName) {
    const people = await sql`select id, name_ko from people where name_ko = ${personName}`;
    if (people.length === 0) {
      console.error(`No people row found with name_ko = ${personName}`);
      process.exit(1);
    }
    if (people.length > 1) {
      console.error(`Multiple people rows named ${personName}: ${people.map((p) => p.id).join(", ")}`);
      console.error("Link the person manually in 설정 after creating the account, or dedupe first.");
      process.exit(1);
    }
    personId = people[0].id;
  }

  const existing = await sql`select id from auth.users where email = ${email}`;
  let authUserId;

  if (existing.length > 0) {
    authUserId = existing[0].id;
    await sql`
      update auth.users
      set encrypted_password = crypt(${password}, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = ${authUserId}
    `;
    console.log(`Auth user already existed; password reset: ${email}`);
  } else {
    const inserted = await sql`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        ${email},
        crypt(${password}, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        now(), now(), '', '', '', ''
      )
      returning id
    `;
    authUserId = inserted[0].id;

    await sql`
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(),
        ${authUserId},
        ${authUserId},
        jsonb_build_object('sub', ${authUserId}::text, 'email', ${email}, 'email_verified', true),
        'email',
        now(), now(), now()
      )
    `;
    console.log(`Auth user created: ${email}`);
  }

  const appUser = await sql`
    insert into users (email, global_role, status, auth_user_id, person_id)
    values (${email}, ${role}, 'active', ${authUserId}, ${personId})
    on conflict (email) do update
      set global_role = ${role},
          status = 'active',
          auth_user_id = ${authUserId},
          person_id = coalesce(${personId}, users.person_id)
    returning id, global_role, person_id
  `;

  console.log(`ERP user ready: role=${appUser[0].global_role}, person_id=${appUser[0].person_id ?? "none"}`);
} finally {
  await sql.end();
}
