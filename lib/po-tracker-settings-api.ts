/**
 * PO Tracker 관리자 설정 Supabase API — 변경 유형·판정 기준 연결·품목 구분 예외·고객처 담당자
 */
import { createClient } from '@/lib/supabase/client';
import { formatPoTrackerError } from '@/lib/po-changes-api';
import type {
  CustomerManager,
  ItemClassOverride,
  PoChangeTypeRule,
  PoChangeTypeSetting,
  ProductClass,
} from '@/types/po-changes';

/** 연결 없는 기준이 모이는 변경 유형 코드 (지울 수 없음) */
export const OTHER_CHANGE_TYPE_CODE = 'other';

/**
 * 판정 기준 → 변경 유형 연결 조회
 */
export const fetchChangeTypeRules = async (): Promise<PoChangeTypeRule[]> => {
  const supabase = createClient();
  const { data, error } = await supabase.from('po_change_type_rules').select('rule_key, type_code');
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as PoChangeTypeRule[];
};

/**
 * 변경 유형 추가·수정 (code가 없으면 새로 추가 — code는 DB가 만든다)
 */
export const saveChangeType = async (
  setting: Omit<PoChangeTypeSetting, 'code'> & { code?: string },
  userId: string
): Promise<void> => {
  const supabase = createClient();
  const values = {
    label: setting.label,
    label_en: setting.label_en,
    description: setting.description,
    sort_order: setting.sort_order,
    is_active: setting.is_active,
    updated_by: userId,
  };
  const { error } = setting.code
    ? await supabase.from('po_change_type_settings').update(values).eq('code', setting.code)
    : await supabase.from('po_change_type_settings').insert(values);
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 변경 유형 삭제 — 연결된 판정 기준은 기타로 셈 (외래키 ON DELETE SET NULL)
 */
export const deleteChangeType = async (code: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('po_change_type_settings').delete().eq('code', code);
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 판정 기준 하나를 변경 유형에 연결
 */
export const saveChangeTypeRule = async (rule: PoChangeTypeRule, userId: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase
    .from('po_change_type_rules')
    .upsert({ rule_key: rule.rule_key, type_code: rule.type_code, updated_by: userId }, { onConflict: 'rule_key' });
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 품목 구분 예외 목록 (품목명·카테고리 구분 포함)
 */
export const fetchItemClassOverrides = async (): Promise<ItemClassOverride[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('item_class_overrides')
    .select('item_no, product_class, note, updated_at')
    .order('item_no');
  if (error) throw new Error(formatPoTrackerError(error));

  const rows = data ?? [];
  if (rows.length === 0) return [];
  const items = await lookupItems(rows.map((r) => r.item_no as string));
  return rows.map((r) => {
    const item = items.get(r.item_no as string);
    return {
      item_no: r.item_no as string,
      product_class: r.product_class as ItemClassOverride['product_class'],
      note: (r.note as string | null) ?? null,
      updated_at: r.updated_at as string,
      item_name: item?.item_name ?? null,
      category_model: item?.category_model ?? null,
      category_class: item?.category_class ?? '미분류',
    };
  });
};

/**
 * 품목번호로 품목명·카테고리·카테고리 구분 조회 (판매주문조회 업로드로 쌓인 품목만)
 */
export const lookupItems = async (
  itemNos: string[]
): Promise<Map<string, { item_name: string | null; category_model: string | null; category_class: ProductClass }>> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('item_category_map')
    .select('item_no, item_name, category_model')
    .in('item_no', itemNos);
  if (error) throw new Error(formatPoTrackerError(error));

  const categories = [...new Set((data ?? []).map((r) => r.category_model as string | null).filter(Boolean))] as string[];
  const classes = new Map<string, ProductClass>();
  if (categories.length) {
    const res = await supabase
      .from('category_class_settings')
      .select('category_model, product_class')
      .in('category_model', categories);
    if (res.error) throw new Error(formatPoTrackerError(res.error));
    (res.data ?? []).forEach((c) => classes.set(c.category_model as string, c.product_class as ProductClass));
  }

  return new Map(
    (data ?? []).map((r) => [
      r.item_no as string,
      {
        item_name: (r.item_name as string | null) ?? null,
        category_model: (r.category_model as string | null) ?? null,
        category_class: classes.get(r.category_model as string) ?? '미분류',
      },
    ])
  );
};

/**
 * 품목 구분 예외 추가·수정
 */
export const saveItemClassOverride = async (
  override: Pick<ItemClassOverride, 'item_no' | 'product_class' | 'note'>,
  userId: string
): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase
    .from('item_class_overrides')
    .upsert({ ...override, updated_by: userId }, { onConflict: 'item_no' });
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 품목 구분 예외 삭제 — 다시 카테고리 구분을 따름
 */
export const deleteItemClassOverride = async (itemNo: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('item_class_overrides').delete().eq('item_no', itemNo);
  if (error) throw new Error(formatPoTrackerError(error));
};

/** 담당자 미지정 고객처 (판매주문조회에는 있으나 담당자 없음) */
export interface UnassignedCustomer {
  account_no: string;
  customer_name: string | null;
  order_count: number;
  last_seen_date: string | null;
}

/** PostgREST 한 번에 받는 최대 행 수 */
const PAGE_SIZE = 1000;

/**
 * 고객처 담당자 전체 조회 (고객처 이름순)
 */
export const fetchCustomerManagers = async (): Promise<CustomerManager[]> => {
  const supabase = createClient();
  const rows: CustomerManager[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('customer_managers')
      .select('account_no, customer_name, manager_name, manager_email, note, updated_at')
      .order('customer_name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(formatPoTrackerError(error));
    rows.push(...((data ?? []) as CustomerManager[]));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
};

/**
 * 담당자 미지정 고객처 조회
 */
export const fetchUnassignedCustomers = async (): Promise<UnassignedCustomer[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('v_customers_without_manager')
    .select('account_no, customer_name, order_count, last_seen_date')
    .order('last_seen_date', { ascending: false });
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as UnassignedCustomer[];
};

/**
 * 고객처 담당자 추가·수정 (계정 번호 기준, 여러 건 한 번에 가능)
 */
export const saveCustomerManagers = async (
  rows: Pick<CustomerManager, 'account_no' | 'customer_name' | 'manager_name' | 'manager_email' | 'note'>[],
  userId: string
): Promise<void> => {
  const supabase = createClient();
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const chunk = rows.slice(i, i + PAGE_SIZE).map((r) => ({
      ...r,
      manager_email: r.manager_email.trim().toLowerCase(),
      updated_by: userId,
    }));
    const { error } = await supabase.from('customer_managers').upsert(chunk, { onConflict: 'account_no' });
    if (error) throw new Error(formatPoTrackerError(error));
  }
};

/**
 * 고객처 담당자 삭제 — 담당자 미지정으로 돌아감
 */
export const deleteCustomerManager = async (accountNo: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('customer_managers').delete().eq('account_no', accountNo);
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 담당자 일괄 변경 — 한 담당자의 고객처를 모두 다른 담당자에게 넘김
 * @returns 바뀐 고객처 수
 */
export const reassignCustomerManager = async (
  fromEmail: string,
  to: { manager_name: string; manager_email: string },
  userId: string
): Promise<number> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('customer_managers')
    .update({ manager_name: to.manager_name, manager_email: to.manager_email.trim().toLowerCase(), updated_by: userId })
    .eq('manager_email', fromEmail)
    .select('account_no');
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []).length;
};
