import pg from 'pg';
import bcrypt from 'bcrypt';
import { assertSafeTestingDb } from './assert-safe-db.mjs';

const info = assertSafeTestingDb();
const pool = new pg.Pool({ connectionString: info.connectionString, ssl: false });

/** Password for all fixture accounts: TestSeed123! */
export const SEED_USERS = [
  {
    email: 'founder.seed@skylance.local',
    password: 'TestSeed123!',
    name: 'Founder Seed',
    role: 'founder',
  },
  { email: 'rahul.seed@skylance.local', password: 'TestSeed123!', name: 'Rahul', role: 'sdr' },
  { email: 'neha.seed@skylance.local', password: 'TestSeed123!', name: 'Neha', role: 'sdr' },
  { email: 'aman.seed@skylance.local', password: 'TestSeed123!', name: 'Aman', role: 'sdr' },
  {
    email: 'developer.seed@skylance.local',
    password: 'TestSeed123!',
    name: 'Developer Seed',
    role: 'developer',
  },
];

const ALLOWED = new Set(SEED_USERS.map((u) => u.email));

try {
  for (const u of SEED_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        updated_at = now()
      `,
      [u.email, hash, u.name, u.role]
    );
    console.log(`Seeded ${u.email} (${u.role})`);
  }

  const { rows } = await pool.query('SELECT id, email FROM users');
  for (const row of rows) {
    if (!ALLOWED.has(row.email)) {
      // Calls require a caller; the schema's ON DELETE SET NULL cannot satisfy that column.
      await pool.query('DELETE FROM conversations WHERE called_by = $1', [row.id]);
      await pool.query('DELETE FROM users WHERE id = $1', [row.id]);
      console.log(`Removed non-seed user ${row.email}`);
    }
  }
  console.log('testing/functional/seed-users complete. Password: TestSeed123!');
} finally {
  await pool.end();
}
