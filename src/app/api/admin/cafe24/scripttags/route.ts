import { guardAdmin } from '@/lib/auth/admin';
import { env } from '@/lib/env';
import { cafe24Admin } from '@/lib/cafe24/client';
import { toErrorResponse } from '@/lib/cafe24/errors';
import { LAB } from '@/lib/cafe24/lab-config';

type ScriptTag = { script_no: string | number; src: string; display_location: string[] };

const noStore = { 'Cache-Control': 'no-store' };
const widgetSrc = () => `${env.appBaseUrl}/widgets/makji-bread.js`;

// 이 앱이 설치한 위젯 스크립트만 골라낸다(카페24가 src 뒤에 쿼리를 붙일 수 있어 ? 앞만 비교).
async function listMine(): Promise<ScriptTag[]> {
  const data = await cafe24Admin<{ scripttags: ScriptTag[] }>('/api/v2/admin/scripttags', {
    query: { shop_no: LAB.shopNo },
  });
  return data.scripttags.filter((tag) => tag.src.split('?')[0] === widgetSrc());
}

export async function GET(request: Request) {
  const guard = await guardAdmin(request, { write: false });
  if (guard.response) return guard.response;
  try {
    return Response.json({ src: widgetSrc(), installed: await listMine() }, { headers: noStore });
  } catch (e) {
    return toErrorResponse(e);
  }
}

// 상품 상세(PRODUCT_DETAIL) 화면에만 설치한다. 이미 있으면 새로 만들지 않는다.
export async function POST(request: Request) {
  const guard = await guardAdmin(request, { write: true });
  if (guard.response) return guard.response;
  try {
    const mine = await listMine();
    if (mine.length > 0) return Response.json({ result: 'already', installed: mine }, { headers: noStore });
    const created = await cafe24Admin<{ scripttag: ScriptTag }>('/api/v2/admin/scripttags', {
      method: 'POST',
      body: { shop_no: LAB.shopNo, request: { src: widgetSrc(), display_location: ['PRODUCT_DETAIL'] } },
    });
    return Response.json({ result: 'installed', installed: [created.scripttag] }, { headers: noStore });
  } catch (e) {
    return toErrorResponse(e);
  }
}

// 이 앱이 설치한 위젯만 삭제한다. 다른 앱의 스크립트는 건드리지 않는다.
export async function DELETE(request: Request) {
  const guard = await guardAdmin(request, { write: true });
  if (guard.response) return guard.response;
  try {
    const mine = await listMine();
    for (const tag of mine) {
      await cafe24Admin(`/api/v2/admin/scripttags/${tag.script_no}`, {
        method: 'DELETE',
        query: { shop_no: LAB.shopNo },
      });
    }
    return Response.json({ result: 'removed', removed: mine.map((t) => t.script_no) }, { headers: noStore });
  } catch (e) {
    return toErrorResponse(e);
  }
}
