import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { BREAD_INDEXES, LAB, SCENARIOS, isScenarioKey } from '@/lib/cafe24/lab-config';
import { describeChange } from '@/lib/cafe24/policy';
import { supabaseAdmin } from '@/lib/supabase/admin';

// 자사몰 방문자 브라우저가 부르는 공개 API. 공개해도 되는 값만 새로 만들어 반환한다.
function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = (LAB.storefrontOrigins as readonly string[]).includes(origin ?? '');
  return allowed && origin
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  const cors = corsHeaders(request);
  const productNo = request.nextUrl.searchParams.get('product_no') ?? '';
  if (!/^\d{1,10}$/.test(productNo) || Number(productNo) !== LAB.product.productNo) {
    return Response.json({ error: 'NOT_REGISTERED' }, { status: 404, headers: cors });
  }

  const { data, error } = await supabaseAdmin()
    .from('cafe24_products')
    .select('scenario')
    .match({ mall_id: LAB.mallId, shop_no: LAB.shopNo, product_no: LAB.product.productNo })
    .maybeSingle<{ scenario: string | null }>();
  if (error) return Response.json({ error: 'UNAVAILABLE' }, { status: 503, headers: cors });

  const scenario = SCENARIOS[isScenarioKey(data?.scenario) ? data.scenario : 'up'];
  const index = BREAD_INDEXES[LAB.product.indexKey];
  const { direction, changePct } = describeChange(scenario.previous, scenario.current);
  const cta = new URL('/', env.appBaseUrl);
  cta.search = new URLSearchParams({
    utm_source: 'cafe24',
    utm_medium: 'product_widget',
    utm_campaign: 'bread_market',
    utm_content: `product_${productNo}`,
  }).toString();

  return Response.json(
    {
      productNo: Number(productNo),
      indexName: index.name,
      market: index.market,
      value: scenario.current,
      direction,
      changePct,
      demo: true,
      ctaUrl: cta.toString(),
    },
    { headers: { ...cors, 'Cache-Control': 'public, max-age=60' } },
  );
}
