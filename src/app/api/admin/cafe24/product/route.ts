import { guardAdmin } from '@/lib/auth/admin';
import { toErrorResponse } from '@/lib/cafe24/errors';
import { LAB, storefrontProductUrl } from '@/lib/cafe24/lab-config';
import { productDeps } from '@/lib/cafe24/product-deps';
import { saveBaseline, toFields } from '@/lib/cafe24/product-sync';

const noStore = { 'Cache-Control': 'no-store' };

// GET: 카페24의 현재 상품값 + 분류 배정 여부 + 저장된 기준값을 한 번에 보여준다.
export async function GET(request: Request) {
  const guard = await guardAdmin(request, { write: false });
  if (guard.response) return guard.response;
  try {
    const deps = productDeps(guard.userId);
    const [product, categoryProductNos, state] = await Promise.all([
      deps.getProduct(),
      deps.getCategoryProductNos(),
      deps.loadState(),
    ]);
    return Response.json(
      {
        lab: LAB.product,
        product,
        current: toFields(product),
        inCategory: categoryProductNos.includes(LAB.product.productNo),
        state,
        storefrontUrl: storefrontProductUrl('admin_check'),
      },
      { headers: noStore },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}

// POST: 처음 한 번 기준값(원래 판매가·요약설명)을 저장한다. 이미 있으면 덮어쓰지 않는다.
export async function POST(request: Request) {
  const guard = await guardAdmin(request, { write: true });
  if (guard.response) return guard.response;
  try {
    return Response.json(await saveBaseline(productDeps(guard.userId)), { headers: noStore });
  } catch (e) {
    return toErrorResponse(e);
  }
}
