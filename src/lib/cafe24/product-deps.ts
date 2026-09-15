import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { cafe24Admin } from './client';
import { LAB } from './lab-config';
import type { Cafe24Product, ProductState, SyncDeps } from './product-sync';

// product-sync.ts가 사용할 실제 카페24·Supabase 연결부
export function productDeps(actorId: string): SyncDeps {
  const { productNo, productCode, categoryNo, displayGroup, indexKey } = LAB.product;
  const key = { mall_id: LAB.mallId, shop_no: LAB.shopNo, product_no: productNo };

  return {
    async getProduct() {
      const data = await cafe24Admin<{ product: Cafe24Product }>(`/api/v2/admin/products/${productNo}`, {
        query: {
          shop_no: LAB.shopNo,
          fields: 'product_no,product_code,product_name,price,summary_description',
        },
      });
      return data.product;
    },

    async getCategoryProductNos() {
      const data = await cafe24Admin<{ products: { product_no: number }[] }>(
        `/api/v2/admin/categories/${categoryNo}/products`,
        { query: { shop_no: LAB.shopNo, display_group: displayGroup } },
      );
      return data.products.map((p) => Number(p.product_no));
    },

    async putProduct(fields) {
      const data = await cafe24Admin<{ product?: Partial<Cafe24Product> } | null>(`/api/v2/admin/products/${productNo}`, {
        method: 'PUT',
        body: { shop_no: LAB.shopNo, request: fields },
      });
      return data?.product ?? null;
    },

    async loadState() {
      const { data, error } = await supabaseAdmin()
        .from('cafe24_products')
        .select('baseline, applied, scenario')
        .match(key)
        .maybeSingle<ProductState>();
      if (error) throw new Error(`DB_READ_FAILED:${error.code}`);
      return data;
    },

    async saveState(state) {
      const { error } = await supabaseAdmin()
        .from('cafe24_products')
        .upsert({
          ...key,
          product_code: productCode,
          category_no: categoryNo,
          display_group: displayGroup,
          index_key: indexKey,
          baseline: state.baseline,
          applied: state.applied,
          scenario: state.scenario,
          updated_at: new Date().toISOString(),
        });
      if (error) throw new Error(`DB_SAVE_FAILED:${error.code}`);
    },

    async log(entry) {
      const { error } = await supabaseAdmin()
        .from('cafe24_change_log')
        .insert({
          ...key,
          actor_id: actorId,
          action: entry.action,
          scenario: entry.scenario ?? null,
          before_value: entry.before ?? null,
          target_value: entry.target ?? null,
          result: entry.result,
          error_code: entry.errorCode ?? null,
        });
      if (error) throw new Error(`DB_LOG_FAILED:${error.code}`);
    },
  };
}
