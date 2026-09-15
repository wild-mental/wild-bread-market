import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

// Supabase SQL Editor에 붙여 넣을 SQL이 오류 없이 실행되는지, 잠금 함수가 동작하는지 확인한다.
describe('supabase/migrations/0001_cafe24_lab.sql', () => {
  it('테이블·권한·잠금 함수가 만들어진다', async () => {
    const db = new PGlite();
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync('supabase/migrations/0001_cafe24_lab.sql', 'utf8'));

    await db.exec(`insert into public.cafe24_connections
      (mall_id, token_cipher, access_expires_at, refresh_expires_at)
      values ('wildmental', 'v1.x.y.z', now(), now() + interval '14 days')`);

    const lock = async () =>
      (await db.query<{ locked: boolean }>(`select public.cafe24_try_refresh_lock('wildmental', 30) as locked`)).rows[0].locked;
    expect(await lock()).toBe(true); // 첫 요청은 잠금 획득
    expect(await lock()).toBe(false); // 30초 안의 두 번째 요청은 대기

    await db.exec(`update public.cafe24_connections set refresh_lock_until = now() - interval '1 second'`);
    expect(await lock()).toBe(true); // 잠금이 만료되면 다시 획득

    const anonCanRead = await db.query<{ ok: boolean }>(
      `select has_table_privilege('anon', 'public.cafe24_connections', 'select') as ok`,
    );
    expect(anonCanRead.rows[0].ok).toBe(false);
    const anonCanLock = await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.cafe24_try_refresh_lock(text, integer)', 'execute') as ok`,
    );
    expect(anonCanLock.rows[0].ok).toBe(false);

    await expect(
      db.exec(`insert into public.cafe24_products (mall_id, shop_no, product_no, product_code, category_no, display_group, index_key, baseline, scenario)
               values ('wildmental', 1, 16, 'P000000Q', 81, 1, 'wheat', '{"price":5200}', 'sideways')`),
    ).rejects.toThrow();
    await db.close();
  });
});
