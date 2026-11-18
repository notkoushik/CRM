import type { Page } from '../types';

export const NAV_ITEMS: {
  id: Page;
  label: string;
  hint: string;
  short: string;
  adminOnly?: boolean;
}[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'Today at a glance', short: 'Home' },
  { id: 'calls', label: 'Call Desk', hint: 'Daily call queue & dialer', short: 'Calls' },
  { id: 'pipeline', label: 'Leads', hint: 'Client lead stages', short: 'Leads' },
  { id: 'import', label: 'Import Leads', hint: 'Paste daily table', short: 'Import' },
  { id: 'handoffs', label: 'Handoffs', hint: 'Lead submissions for review', short: 'Handoffs' },
  { id: 'projects', label: 'Projects', hint: 'Project delivery and progress', short: 'Projects' },
  { id: 'contacts', label: 'Contacts', hint: 'Client contact details', short: 'Contacts' },
  {
    id: 'activity',
    label: 'Caller Activity',
    hint: 'Calls · sessions · targets',
    short: 'Activity',
    adminOnly: true,
  },
  { id: 'users', label: 'Users', hint: 'Add team accounts', short: 'Users', adminOnly: true },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'Brand · stages · stage automation',
    short: 'Settings',
    adminOnly: true,
  },
];

export const PAGE_TITLE: Record<Page, string> = {
  dashboard: 'Dashboard',
  calls: 'Call Desk',
  import: 'Import Leads',
  pipeline: 'Leads',
  handoffs: 'Handoffs',
  projects: 'Projects',
  contacts: 'Contacts',
  activity: 'Caller Activity',
  users: 'Users',
  settings: 'Settings',
};

export function navItemsForRole(role?: string) {
  if (role === 'developer') {
    return [{ id: 'projects' as const, label: 'Assigned Projects', hint: 'Your assigned work', short: 'Projects' }];
  }
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === 'admin' || role === 'founder');
  if (role === 'sdr') {
    return items.map((item) => {
      if (item.id === 'calls') return { ...item, label: 'Call Desk', hint: 'Your live call queue & dialer' };
      if (item.id === 'pipeline') return { ...item, label: 'My Leads', hint: 'Your assigned leads' };
      if (item.id === 'contacts') return { ...item, label: 'Clients', hint: 'People you work with' };
      if (item.id === 'import') return { ...item, label: 'Add Leads', hint: 'Register new clients' };
      if (item.id === 'handoffs') return { ...item, label: 'My Handoffs', hint: 'Your submitted leads' };
      if (item.id === 'projects') return { ...item, label: 'My Projects', hint: 'Your converted leads' };
      return item;
    });
  }
  return items;
}
