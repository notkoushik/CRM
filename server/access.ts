import type { Pool } from 'pg';
import { canAccessAssignedLead, isAdminRole } from './auth.js';

export interface AccessUser {
  sub: string;
  role: string;
}

export async function canAccessCompany(
  pool: Pick<Pool, 'query'>,
  user: AccessUser,
  companyId: string
): Promise<boolean> {
  if (isAdminRole(user.role)) return true;
  const { rows } = await pool.query('SELECT assigned_to FROM companies WHERE id = $1', [companyId]);
  if (!rows[0]) return false;
  return canAccessAssignedLead(user.role, user.sub, rows[0].assigned_to?.toString() ?? null);
}

export async function canAccessContact(
  pool: Pick<Pool, 'query'>,
  user: AccessUser,
  contactId: string
): Promise<boolean> {
  if (isAdminRole(user.role)) return true;
  const { rows } = await pool.query(
    `SELECT co.assigned_to, ct.created_by
     FROM contacts ct
     LEFT JOIN companies co ON co.id = ct.company_id
     WHERE ct.id = $1`,
    [contactId]
  );
  if (!rows[0]) return false;
  const owner = rows[0].assigned_to?.toString() ?? rows[0].created_by?.toString() ?? null;
  return canAccessAssignedLead(user.role, user.sub, owner);
}

/** SQL predicate for lead-level reads. `alias` must be a fixed internal SQL alias. */
export function companyScope(role: string, userId: string, alias = 'c', parameter = 1) {
  if (isAdminRole(role)) return { sql: '', values: [] as string[] };
  if (role === 'sdr') {
    return { sql: ` AND ${alias}.assigned_to = $${parameter}`, values: [userId] };
  }
  return { sql: ' AND FALSE', values: [] as string[] };
}
