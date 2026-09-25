import { listAllAuthUsers } from './auth-admin.mjs';
import { namedAccounts } from './admin-metrics.mjs';
import { getCachedShared, setCachedShared, TTL_HEAVY } from './admin-cache.mjs';

export async function loadAccountLedger(fresh = false) {
  const key = 'admin-accounts:v1';
  const cached = fresh ? null : await getCachedShared(key);
  if (cached) return cached;
  const users = await listAllAuthUsers();
  const accounts = namedAccounts(users);
  const result = { accounts, anonymous: users.length - accounts.length, generatedAt: new Date().toISOString() };
  await setCachedShared(key, result, TTL_HEAVY);
  return result;
}
