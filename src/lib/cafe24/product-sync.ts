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
  putProduct(fields: Partial<Baseline>): Promise<void>;
  loadState(): Promise<ProductState | null>;
  saveState(state: ProductState): Promise<void>;
  log(entry: LogEntry): Promise<void>;
};

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
  let putError: unknown;
  try {
    await deps.putProduct(diffFields(before, target));
  } catch (e) {
    putError = e;
  }

  // PUT 응답이 실패·타임아웃이어도 실제로는 반영됐을 수 있다. 항상 다시 조회해 대조한다.
  let after: Baseline | null = null;
  try {
    after = toFields(await deps.getProduct());
  } catch {
    after = null;
  }

  if (after && same(after, target)) {
    await input.onVerified();
    await deps.log({ action, scenario, before, target, result: 'applied' });
    return { result: 'applied' as const, before, after, target };
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
    { errorCode, after },
  );
}

export async function applyChange(deps: SyncDeps, scenario: ScenarioKey, applyDiscount: boolean) {
  const state = await requireState(deps);
  const before = toFields(await readVerifiedProduct(deps));
  const { fields: target } = planTarget(state, scenario, applyDiscount);

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
  const before = toFields(await readVerifiedProduct(deps));
  const target = state.baseline;

  if (same(before, target)) {
    await deps.saveState({ ...state, applied: null, scenario: null });
    await deps.log({ action: 'restore', before, target, result: 'already' });
    return { result: 'already' as const, before, after: before, target };
  }
  // 마지막으로 우리가 적용한 값과 다르면, 누군가 관리자 화면에서 수정한 것이다. 덮어쓰지 않는다.
  if (!state.applied || !same(before, state.applied)) {
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
