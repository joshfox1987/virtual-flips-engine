const USER_ID_STORAGE_KEY = 'vf_user_id';

export function ensureLocalUserId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const existing = window.localStorage.getItem(USER_ID_STORAGE_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(USER_ID_STORAGE_KEY, created);
  return created;
}
