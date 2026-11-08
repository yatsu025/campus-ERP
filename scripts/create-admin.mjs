// To create the first admin (run once):
//   npm run create-admin -- you@example.com "Your Name" "StrongPass123"
// .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";

const [email, fullName, password] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) fail("Set NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local.");
if (!email || !fullName || !password) fail('Usage: npm run create-admin -- email "Full Name" "Password"');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Invalid email.");
if (fullName.length < 2) fail("Name must be at least 2 characters.");
if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  fail("Password must be 10+ characters and include an uppercase letter, a lowercase letter and a digit.");
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const mail = email.trim().toLowerCase();

const { data, error } = await db.auth.admin.createUser({ email: mail, password, email_confirm: true });
if (error) fail(`Could not create auth user: ${error.message}`);

const { error: e2 } = await db.from("users").insert({ id: data.user.id, email: mail, role: "admin", full_name: fullName.trim(), must_change_password: false });
if (e2) {
  await db.auth.admin.deleteUser(data.user.id);
  fail(`Could not create users row (did you run the migration?): ${e2.message}`);
}
console.log(`Admin created: ${mail}. Now sign in with this email at /login.`);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
