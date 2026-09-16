// 상품 기준값 저장 · 미리보기 · 적용 · 복원 흐름.
// 카페24와 DB 접근은 deps로 주입받으므로 실제 계정 없이 테스트할 수 있다.
import { BREAD_INDEXES, LAB, SCENARIOS, type ScenarioKey } from './lab-config';
import { buildTarget, type Baseline } from './policy';

export type Cafe24Product = {
  product_no: number;
  product_code: string;
  product_name: string;
  price: string | number;
  summary_description: string | null;
};

export type ProductState = {
  baseline: Baseline;
  applied: Baseline | null;
  scenario: ScenarioKey | null;
};

export type SyncResult = 'applied' | 'already' | 'failed' | 'unknown' | 'conflict';

export type LogEntry = {
  action: 'baseline' | 'apply' | 'restore';
  scenario?: ScenarioKey | null;
  before?: Baseline | null;
  target?: Baseline | null;
  result: SyncResult;
  errorCode?: string;
};

export type SyncDeps = {
  getProduct(): Promise<Cafe24Product>;
  getCategoryProductNos(): Promise<number[]>;
  // PUT 응답 본문의 product(카페24가 담아 줄 때). 없으면 null.
  putProduct(fields: Partial<Baseline>): Promise<Partial<Cafe24Product> | null>;
  loadState(): Promise<ProductState | null>;
  saveState(state: ProductState): Promise<void>;
  log(entry: LogEntry): Promise<void>;
  sleep?(ms: number): Promise<void>; // 테스트에서 기다리지 않도록 바꿔 끼운다.
};

// 카페24 조회 API는 수정 직후 한동안 이전 값을 돌려줄 수 있다(실제 몰에서 수십 초간 이전 값과 새 값이 번갈아 읽힘).
// PUT 응답으로 확인하지 못하면 이 간격(ms)을 기다리며 다시 조회한다: 최대 5번, 합계 약 10초.
export const VERIFY_READ_DELAYS_MS = [0, 1000, 2000, 3000, 4000] as const;

// 쓰기 전 현재값이 저장 상태와 어긋날 때 다시 조회하는 간격(ms). 합계 약 6초.
export const RECHECK_DELAYS_MS = [1000, 2000, 3000] as const;

export type VerifiedBy = 'put_response' | 'reread';

export class SyncError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
  }
}

export function toFields(product: Cafe24Product): Baseline {
  const price = Number(product.price); // 카페24는 가격을 "5200.00" 같은 문자열로 줄 수 있다.
  if (!Number.isFinite(price)) {
    throw new SyncError(502, 'PRICE_INVALID', '카페24 응답의 price를 숫자로 읽을 수 없습니다.');
  }
  return { price: Math.round(price), summary_description: product.summary_description ?? '' };
}

const same = (a: Baseline, b: Baseline) =>
  a.price === b.price && a.summary_description === b.summary_description;

export function diffFields(current: Baseline, target: Baseline): Partial<Baseline> {
  const changes: Partial<Baseline> = {};
  if (current.price !== target.price) changes.price = target.price;
  if (current.summary_description !== target.summary_description) {
    changes.summary_description = target.summary_description;
  }
  return changes;
}

function errorCodeOf(e: unknown): string {
  if (e && typeof e === 'object' && 'status' in e && 'code' in e) {
    return `HTTP_${String(e.status)}:${String(e.code)}`;
  }
  return e instanceof Error ? e.name : 'UNKNOWN_ERROR';
}

// 카페24가 4xx로 거절한 요청은 반영되지 않았다. 타임아웃·5xx·네트워크 오류는 반영됐을 수 있다.
function isRejected(e: unknown): boolean {
  const status = e && typeof e === 'object' && 'status' in e ? Number(e.status) : NaN;
  return status >= 400 && status < 500;
}

// PUT 응답의 상품 값. 다른 상품이거나, 이번에 바꾼 필드가 응답에 없으면 쓰지 않는다(null → 재조회로 확인).
// 바꾸지 않은 필드가 응답에 없으면 수정 전 값을 그대로 둔다.
function fieldsFromPutResponse(
  product: Partial<Cafe24Product> | null,
  before: Baseline,
  changes: Partial<Baseline>,
): Baseline | null {
  if (!product || Number(product.product_no) !== LAB.product.productNo) return null;
  if (product.product_code !== undefined && product.product_code !== LAB.product.productCode) return null;
  const hasPrice = product.price !== undefined && product.price !== null;
  const hasSummary = product.summary_description !== undefined;
  if ((changes.price !== undefined && !hasPrice) || (changes.summary_description !== undefined && !hasSummary)) {
    return null;
  }
  const price = hasPrice ? Number(product.price) : before.price;
  if (!Number.isFinite(price)) return null;
  return {
    price: Math.round(price),
    summary_description: hasSummary ? (product.summary_description ?? '') : before.summary_description,
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 번호만 믿지 않고 상품코드까지 대조한다. 다른 몰·다른 상품을 수정하는 사고를 막는다.
async function readVerifiedProduct(deps: SyncDeps): Promise<Cafe24Product> {
  const product = await deps.getProduct();
  const { productNo, productCode } = LAB.product;
  if (Number(product.product_no) !== productNo || product.product_code !== productCode) {
    throw new SyncError(
      409,
      'PRODUCT_MISMATCH',
      `상품번호 ${productNo}의 상품코드가 ${productCode}가 아닙니다. lab-config.ts 값을 확인하세요.`,
      { product_no: product.product_no, product_code: product.product_code },
    );
  }
  return product;
}

async function requireState(deps: SyncDeps): Promise<ProductState> {
  const state = await deps.loadState();
  if (!state) throw new SyncError(409, 'BASELINE_REQUIRED', '먼저 [기준값 저장]을 실행하세요.');
  return state;
}

export function planTarget(state: ProductState, scenario: ScenarioKey, applyDiscount: boolean) {
  const { previous, current } = SCENARIOS[scenario];
  const target = buildTarget({
    baseline: state.baseline,
    indexName: BREAD_INDEXES[LAB.product.indexKey].name,
    previous,
    current,
    applyDiscount,
  });
  const fields: Baseline = { price: target.price, summary_description: target.summary_description };
  return { ...target, fields };
}

// 이 앱이 만들 수 있는 값 목록(시나리오 × 할인 여부). 적용 기록이 없어도 우리가 쓴 값인지 가릴 때 쓴다.
function isAppTarget(state: ProductState, fields: Baseline): boolean {
  const keys = Object.keys(SCENARIOS) as ScenarioKey[];
  return keys.some((key) =>
    [true, false].some((discount) => same(planTarget(state, key, discount).fields, fields)),
  );
}

// 쓰기 없이 끝나는 판단(이미 같음·충돌) 앞에서만 쓴다. accept를 만족하는 값이 한 번이라도 읽히면 그 값을 믿는다.
async function recheckCurrent(
  deps: SyncDeps,
  first: Baseline,
  accept: (fields: Baseline) => boolean,
): Promise<Baseline> {
  const sleep = deps.sleep ?? wait;
  let latest = first;
  for (const delay of RECHECK_DELAYS_MS) {
    await sleep(delay);
    try {
      latest = toFields(await readVerifiedProduct(deps));
    } catch {
      return latest; // 조회가 실패하면 마지막으로 읽은 값으로 판단한다.
    }
    if (accept(latest)) return latest;
  }
  return latest;
}

export async function saveBaseline(deps: SyncDeps) {
  const product = await readVerifiedProduct(deps);
  const { productNo, categoryNo, displayGroup } = LAB.product;
  const inCategory = (await deps.getCategoryProductNos()).includes(productNo);
  if (!inCategory) {
    throw new SyncError(
      409,
      'NOT_IN_CATEGORY',
      `분류 ${categoryNo}(display_group ${displayGroup})에서 상품 ${productNo}를 찾지 못했습니다.`,
    );
  }
  const existing = await deps.loadState();
  if (existing) return { created: false, product, state: existing }; // 기준값은 덮어쓰지 않는다.

  const state: ProductState = { baseline: toFields(product), applied: null, scenario: null };
  await deps.saveState(state);
  await deps.log({ action: 'baseline', before: null, target: state.baseline, result: 'applied' });
  return { created: true, product, state };
}

export async function previewChange(deps: SyncDeps, scenario: ScenarioKey, applyDiscount: boolean) {
  const state = await requireState(deps);
  const current = toFields(await readVerifiedProduct(deps));
  const plan = planTarget(state, scenario, applyDiscount);
  return { current, target: plan.fields, direction: plan.direction, changePct: plan.changePct, changes: diffFields(current, plan.fields) };
}

async function writeAndVerify(
  deps: SyncDeps,
  input: {
    action: 'apply' | 'restore';
    scenario: ScenarioKey | null;
    before: Baseline;
    target: Baseline;
    onVerified: () => Promise<void>;
  },
) {
  const { action, scenario, before, target } = input;
  const changes = diffFields(before, target);
  let putError: unknown;
  let putResponse: Partial<Cafe24Product> | null = null;
  try {
    putResponse = await deps.putProduct(changes);
  } catch (e) {
    putError = e;
  }

  const verified = async (after: Baseline, verifiedBy: VerifiedBy, readAttempts: number) => {
    await input.onVerified();
    await deps.log({ action, scenario, before, target, result: 'applied' });
    return { result: 'applied' as const, before, after, target, verifiedBy, readAttempts };
  };

  // 1) PUT이 성공했고 응답에 수정된 값이 담겨 있으면 그것으로 확인한다. 조회 API의 늦은 반영을 피한다.
  if (!putError) {
    const fromResponse = fieldsFromPutResponse(putResponse, before, changes);
    if (fromResponse && same(fromResponse, target)) return verified(fromResponse, 'put_response', 0);
  }

  // 2) 그 밖에는 다시 조회해 대조한다. PUT 응답이 실패·타임아웃이어도 실제로는 반영됐을 수 있다.
  //    카페24가 4xx로 거절했으면 한 번만 조회하고, 아니면 목표값이 보일 때까지 간격을 두고 재시도한다.
  const delays = putError && isRejected(putError) ? [0] : VERIFY_READ_DELAYS_MS;
  const sleep = deps.sleep ?? wait;
  let after: Baseline | null = null;
  let readAttempts = 0;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    readAttempts++;
    try {
      after = toFields(await deps.getProduct());
    } catch {
      after = null;
    }
    if (after && same(after, target)) return verified(after, 'reread', readAttempts);
  }

  const result: SyncResult = after && same(after, before) ? 'failed' : 'unknown';
  const errorCode = putError ? errorCodeOf(putError) : 'VERIFY_MISMATCH';
  await deps.log({ action, scenario, before, target, result, errorCode });
  throw new SyncError(
    result === 'failed' ? 502 : 500,
    result === 'failed' ? 'WRITE_FAILED' : 'WRITE_UNKNOWN',
    result === 'failed'
      ? '카페24에 반영되지 않았습니다. errorCode를 확인하세요.'
      : '반영 여부를 확정하지 못했습니다. [상품 조회]로 현재값을 확인하세요.',
    { errorCode, after, readAttempts },
  );
}

export async function applyChange(deps: SyncDeps, scenario: ScenarioKey, applyDiscount: boolean) {
  const state = await requireState(deps);
  const first = toFields(await readVerifiedProduct(deps));
  const { fields: target } = planTarget(state, scenario, applyDiscount);

  // 적용한 적이 없는데 "이미 목표값"으로 읽히면 이전 값일 수 있다. 다른 값이 보이면 그것을 쓴다.
  const trustAlready = state.applied !== null && same(state.applied, target);
  const before =
    same(first, target) && !trustAlready ? await recheckCurrent(deps, first, (f) => !same(f, target)) : first;

  if (same(before, target)) {
    // 카페24는 같은 내용으로 수정하면 409를 돌려준다. 이미 같으면 PUT을 보내지 않는다.
    await deps.saveState({ ...state, applied: target, scenario });
    await deps.log({ action: 'apply', scenario, before, target, result: 'already' });
    return { result: 'already' as const, before, after: before, target };
  }
  return writeAndVerify(deps, {
    action: 'apply',
    scenario,
    before,
    target,
    onVerified: () => deps.saveState({ ...state, applied: target, scenario }),
  });
}

export async function restoreBaseline(deps: SyncDeps) {
  const state = await requireState(deps);
  const first = toFields(await readVerifiedProduct(deps));
  const target = state.baseline;

  // 적용한 값이 남아 있는데 "이미 기준값"으로 읽히면 이전 값일 수 있다.
  // 여기서 잘못 판단하면 applied가 지워져 다음 복원이 모두 충돌로 막힌다.
  const expected = state.applied;
  const before =
    expected && same(first, target) ? await recheckCurrent(deps, first, (f) => same(f, expected)) : first;

  if (same(before, target)) {
    await deps.saveState({ ...state, applied: null, scenario: null });
    await deps.log({ action: 'restore', before, target, result: 'already' });
    return { result: 'already' as const, before, after: before, target };
  }
  // 우리 앱이 만들 수 있는 값이면(적용 기록이 지워졌어도) 우리가 쓴 값이다. 그 밖의 값은 사람이 바꾼 것으로 보고 덮어쓰지 않는다.
  if (!isAppTarget(state, before)) {
    await deps.log({ action: 'restore', before, target, result: 'conflict' });
    throw new SyncError(409, 'EDITED_ELSEWHERE', '마지막 적용 이후 다른 곳에서 값이 바뀌었습니다. 카페24 관리자에서 확인하세요.', {
      current: before,
      lastApplied: state.applied,
    });
  }
  return writeAndVerify(deps, {
    action: 'restore',
    scenario: null,
    before,
    target,
    onVerified: () => deps.saveState({ ...state, applied: null, scenario: null }),
  });
}
