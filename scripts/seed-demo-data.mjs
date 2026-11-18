/**
 * Comprehensive demo data seeder for Supabase & production demo deployments.
 * Seeds standard role accounts, pipeline companies, contacts, and call logs with audio recordings.
 */
import pg from 'pg';
import bcrypt from 'bcrypt';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDbUrlRaw, parseDbUrl } from './lib/dbUrl.mjs';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));

const raw = getDbUrlRaw();
const connectionString = parseDbUrl(raw);
const useSsl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

const pool = new pg.Pool({
  connectionString,
  ssl: useSsl,
});

export const USERS = [
  {
    email: 'founder.seed@skylance.local',
    password: 'TestSeed123!',
    name: 'Founder & CEO',
    role: 'founder',
  },
  {
    email: 'rahul.seed@skylance.local',
    password: 'TestSeed123!',
    name: 'Rahul Sharma (SDR)',
    role: 'sdr',
  },
  {
    email: 'neha.seed@skylance.local',
    password: 'TestSeed123!',
    name: 'Neha Gupta (SDR)',
    role: 'sdr',
  },
  {
    email: 'aman.seed@skylance.local',
    password: 'TestSeed123!',
    name: 'Aman Verma (SDR)',
    role: 'sdr',
  },
  {
    email: 'developer.seed@skylance.local',
    password: 'TestSeed123!',
    name: 'Skylance Lead Engineer',
    role: 'developer',
  },
];

async function seed() {
  console.log('Connecting to database...');
  const userMap = new Map();

  // 1. Seed users
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    const { rows } = await pool.query(
      `
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        updated_at = now()
      RETURNING id, email, role, name
      `,
      [u.email, hash, u.name, u.role]
    );
    userMap.set(u.email, rows[0]);
    console.log(`Seeded user: ${u.email} (${u.role})`);
  }

  const rahul = userMap.get('rahul.seed@skylance.local');
  const neha = userMap.get('neha.seed@skylance.local');
  const aman = userMap.get('aman.seed@skylance.local');

  // 2. Seed pipeline companies
  const companyData = [
    {
      company_name: 'Acme Cloud Technologies',
      stage: 'Discovery Call Done',
      industry: 'Cloud Infrastructure / B2B SaaS',
      location: 'Bengaluru, KA',
      assigned_to: rahul.id,
      notes: 'Evaluating automated outbound workflows and CRM dialer integrations.',
      source_link: 'https://linkedin.com/company/acme-cloud',
      contact: {
        name: 'Arjun Mehta',
        role: 'VP Sales Operations',
        phone: '+919876543210',
        email: 'arjun@acmecloud.tech',
        champion: true,
      },
    },
    {
      company_name: 'HealthPulse Solutions',
      stage: 'Follow-up',
      industry: 'Healthcare Tech',
      location: 'Hyderabad, TS',
      assigned_to: neha.id,
      notes: 'Interested in clinical appointment reminders and SDR follow-up workflows.',
      source_link: 'https://healthpulse.in',
      contact: {
        name: 'Pooja Iyer',
        role: 'Chief Medical Officer',
        phone: '+919876543211',
        email: 'pooja@healthpulse.in',
        champion: true,
      },
    },
    {
      company_name: 'Apex Retail Group',
      stage: 'Demo Scheduled',
      industry: 'Retail & Omnichannel',
      location: 'Mumbai, MH',
      assigned_to: aman.id,
      notes: 'Scheduled platform demonstration for store managers and franchise reps.',
      source_link: 'https://apexretail.co.in',
      contact: {
        name: 'Karan Kapoor',
        role: 'Head of Growth',
        phone: '+919876543212',
        email: 'karan@apexretail.co.in',
        champion: true,
      },
    },
    {
      company_name: 'FinEdge Capital',
      stage: 'POC Kickoff',
      industry: 'BFSI / Fintech',
      location: 'Gurugram, HR',
      assigned_to: rahul.id,
      notes: 'High intent prospect; reviewing API security and Exotel integration compliance.',
      source_link: 'https://finedge.capital',
      contact: {
        name: 'Siddharth Rao',
        role: 'Head of Product',
        phone: '+919876543213',
        email: 'siddharth@finedge.capital',
        champion: true,
      },
    },
    {
      company_name: 'Metro Fleet Logistics',
      stage: 'Lead Added',
      industry: 'Supply Chain & Freight',
      location: 'Chennai, TN',
      assigned_to: neha.id,
      notes: 'Cold lead imported from industry directory. Needs introductory outreach.',
      source_link: 'https://metrofleet.com',
      contact: {
        name: 'Vikram Seth',
        role: 'Director of Operations',
        phone: '+919876543214',
        email: 'vikram@metrofleet.com',
        champion: false,
      },
    },
  ];

  for (const c of companyData) {
    const { rows: compRows } = await pool.query(
      `
      INSERT INTO companies (
        company_name, stage, industry, location, assigned_to, notes, source_link
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (LOWER(company_name)) DO UPDATE SET
        stage = EXCLUDED.stage,
        industry = EXCLUDED.industry,
        assigned_to = EXCLUDED.assigned_to,
        notes = EXCLUDED.notes
      RETURNING id, company_name
      `,
      [c.company_name, c.stage, c.industry, c.location, c.assigned_to, c.notes, c.source_link]
    );
    const compId = compRows[0].id;

    // Contact
    const { rows: contRows } = await pool.query(
      `
      INSERT INTO contacts (
        contact_name, company_id, created_by, role, phone, email, champion, contact_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [
        c.contact.name,
        compId,
        c.assigned_to,
        c.contact.role,
        c.contact.phone,
        c.contact.email,
        c.contact.champion,
        'Connected',
      ]
    );

    let contactId = contRows[0]?.id;
    if (!contactId) {
      const { rows: existingCont } = await pool.query(
        `SELECT id FROM contacts WHERE company_id = $1 LIMIT 1`,
        [compId]
      );
      contactId = existingCont[0]?.id;
    }

    if (contactId && c.contact.champion) {
      await pool.query(`UPDATE companies SET primary_contact_id = $1 WHERE id = $2`, [
        contactId,
        compId,
      ]);
    }

    // 3. Seed realistic Call Logs with audio playback for demo
    if (contactId) {
      const sampleCalls = [
        {
          callerId: c.assigned_to,
          duration: 185,
          outcome: 'Connected',
          notes: `Spoke with ${c.contact.name} regarding current call handling volume. Expressed interest in automated dialer and live analytics. Scheduled follow-up.`,
          recordingUrl: '/demo-call-recording.wav',
          direction: 'outbound',
        },
        {
          callerId: c.assigned_to,
          duration: 94,
          outcome: 'Interested',
          notes: 'Product demo walkthrough requested for their sales team next Tuesday.',
          recordingUrl: '/demo-call-recording.wav',
          direction: 'outbound',
        },
      ];

      for (const call of sampleCalls) {
        await pool.query(
          `
          INSERT INTO call_logs (
            company_id, contact_id, caller_id, duration_seconds, outcome, notes, provider, recording_url, call_direction
          ) VALUES ($1, $2, $3, $4, $5, $6, 'exotel', $7, $8)
          `,
          [
            compId,
            contactId,
            call.callerId,
            call.duration,
            call.outcome,
            call.notes,
            call.recordingUrl,
            call.direction,
          ]
        );
      }
    }

    console.log(`Seeded company: ${c.company_name} with contact and call logs.`);
  }

  console.log('Seeding completed successfully!');
}

seed()
  .catch((err) => {
    console.error('Seeding error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
