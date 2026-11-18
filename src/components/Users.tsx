import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { displayRole, type CrmUser, type UserRole } from '../types';
import { USER_ROLES } from '../types';
import { api } from '../lib/api';
import { Field, inputClass, btnPrimary, btnGhost } from './ui';

function roleLabel(role: string) {
  return displayRole(role);
}

function EyeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
    </svg>
  );
}

export function Users() {
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [roles, setRoles] = useState<readonly string[]>(USER_ROLES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'sdr' as UserRole,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api<{ users: CrmUser[] }>('/api/users'),
        api<{ roles: string[] }>('/api/users/roles'),
      ]);
      setUsers(usersRes.users);
      if (rolesRes.roles?.length) setRoles(rolesRes.roles);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match. Please verify both password fields.');
      setSubmitting(false);
      return;
    }
    try {
      const { user } = await api<{ user: CrmUser }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
        }),
      });
      setUsers((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', email: '', password: '', confirmPassword: '', role: 'sdr' });
      setShowPassword(false);
      setShowConfirmPassword(false);
      setSuccess(`Created ${user.name} (${roleLabel(user.role)}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-teal-700 uppercase">
          Team access
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-stone-900 sm:text-5xl">
          Users
        </h1>
        <p className="mt-2 max-w-xl text-sm text-stone-500">
          Add teammates with a role from the database ({roles.map(roleLabel).join(', ')}).
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">Add Team Member</h2>
        <p className="mt-1 text-xs text-slate-500">
          Provision team accounts for Callers, Developers, or Admins.
        </p>

        <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoComplete="off"
              placeholder="Full name"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
              autoComplete="off"
              placeholder="name@skylance.agency"
            />
          </Field>
          <Field label="Role">
            <select
              className={inputClass}
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </Field>
          <div className="hidden sm:block" />

          <Field label="Temporary password">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className={`${inputClass} pr-10`}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'View password'}
                title={showPassword ? 'Hide password' : 'View password'}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          <Field label="Confirm password">
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                className={`${inputClass} pr-10`}
                value={form.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Re-enter password to confirm"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                aria-label={showConfirmPassword ? 'Hide password' : 'View password'}
                title={showConfirmPassword ? 'Hide password' : 'View password'}
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {form.confirmPassword && form.password !== form.confirmPassword ? (
              <p className="mt-1 text-[11px] font-semibold text-rose-600">Passwords do not match</p>
            ) : null}
          </Field>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 pt-2">
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? 'Creating…' : 'Create User'}
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setForm({ name: '', email: '', password: '', confirmPassword: '', role: 'sdr' });
                setShowPassword(false);
                setShowConfirmPassword(false);
                setError(null);
                setSuccess(null);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs font-semibold text-teal-800">{success}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
              Active Team Members
            </h2>
            <p className="text-xs text-slate-500">Currently active accounts and their assigned CRM permissions.</p>
          </div>
          <button type="button" className={btnGhost} onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {loading && users.length === 0 ? (
          <p className="text-sm text-slate-500">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-500">No users yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3 font-bold text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        {roleLabel(user.role)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
