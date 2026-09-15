import { guardAdmin } from '@/lib/auth/admin';
import { toErrorResponse } from '@/lib/cafe24/errors';
import { productDeps } from '@/lib/cafe24/product-deps';
import { restoreBaseline } from '@/lib/cafe24/product-sync';

// 처음 저장한 기준값으로 되돌린다. 다른 곳에서 수정된 흔적이 있으면 409로 멈춘다.
export async function POST(request: Request) {
  const guard = await guardAdmin(request, { write: true });
  if (guard.response) return guard.response;
  try {
    const result = await restoreBaseline(productDeps(guard.userId));
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return toErrorResponse(e);
  }
}
