import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { allowedEmailError, config, isAllowedEmail } from './config.js';
import * as cookie from "cookie";
import crypto from "node:crypto"

function verifyCsrfToken(
  cookieToken: string | undefined,
  headerToken: string | undefined
): boolean {
  if (!cookieToken || !headerToken) return false;

  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/** Must match users.role CHECK in sql/schema.sql */
export const USER_ROLES = ['founder', 'sdr', 'developer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function isAdminRole(role?: string): boolean {
  return role === 'admin' || role === 'founder';
}

/** Existing `sdr` accounts are presented as Callers in Skylance. */
export function isCallerRole(role?: string): boolean {
  return role === 'sdr';
}

/** Developers receive project access only; lead routes must not treat them as callers. */
export function isDeveloperRole(role?: string): boolean {
  return role === 'developer';
}

export function canAccessAssignedLead(
  role: string | undefined,
  userId: string | undefined,
  assignedTo: string | null | undefined
): boolean {
  if (isAdminRole(role)) return true;
  return isCallerRole(role) && Boolean(userId && assignedTo && userId === assignedTo);
}

export function displayRole(role?: string): string {
  if (role === 'sdr') return 'Caller';
  if (role === 'founder' || role === 'admin') return 'Admin';
  if (role === 'developer') return 'Developer';
  return role ?? 'Unknown';
}

export { allowedEmailError, isAllowedEmail };

export interface AuthPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  /** user_sessions.id */
  sid?: string;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, config.jwtSecret) as AuthPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = cookie.parseCookie(req.headers.cookie || "");
  const token = cookies.token;
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminRole(req.user?.role)) {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}

export function requireCallerOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (isAdminRole(req.user?.role) || isCallerRole(req.user?.role)) {
    next();
    return;
  }
  res.status(403).json({ error: 'Caller access required.' });
}

export function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction
) {

  const cookies = cookie.parseCookie(req.headers.cookie || '');

  const cookieToken = cookies.csrfToken;

  const headerValue = req.headers['x-csrf-token'];
  const headerToken =
    typeof headerValue === 'string'
      ? headerValue
      : undefined;

  if (!cookieToken || !headerToken) {
    res.status(403).json({ error: 'CSRF token required' });
    return;
  }

  if (!verifyCsrfToken(cookieToken, headerToken)) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}


