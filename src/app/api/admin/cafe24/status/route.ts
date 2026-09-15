import { guardAdmin } from '@/lib/auth/admin';
import { toErrorResponse } from '@/lib/cafe24/errors';
import { getConnectionStatus } from '@/lib/cafe24/token-store';

export async function GET(request: Request) {
  const guard = await guardAdmin(request, { write: false });
  if (guard.response) return guard.response;
  try {
    return Response.json(await getConnectionStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return toErrorResponse(e);
  }
}
