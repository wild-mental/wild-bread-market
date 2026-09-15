import { guardAdmin, jsonError } from '@/lib/auth/admin';
import { toErrorResponse } from '@/lib/cafe24/errors';
import { isScenarioKey } from '@/lib/cafe24/lab-config';
import { productDeps } from '@/lib/cafe24/product-deps';
import { previewChange } from '@/lib/cafe24/product-sync';

// 카페24에 쓰지 않고, 적용하면 무엇이 바뀌는지만 계산한다.
export async function POST(request: Request) {
  const guard = await guardAdmin(request, { write: true });
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as { scenario?: unknown; applyDiscount?: unknown } | null;
  if (!isScenarioKey(body?.scenario)) return jsonError(400, 'SCENARIO_INVALID', 'scenario는 up 또는 down입니다.');
  try {
    const result = await previewChange(productDeps(guard.userId), body.scenario, body.applyDiscount === true);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return toErrorResponse(e);
  }
}
