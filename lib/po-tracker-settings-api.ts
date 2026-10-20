/**
 * PO Tracker 관리자 설정 Supabase API — 변경 유형·판정 기준 연결·품목 구분 예외·고객처 담당자·요청 부서
 */
import { createClient } from '@/lib/supabase/client';
import { formatPoTrackerError } from '@/lib/po-changes-api';
import { translateNow as tn } from '@/lib/i18n';
import type {
  CustomerAccount,
  ViewGrant,
  CustomerManager,
  ItemClassOverride,
  PoChangeTypeRule,
  PoChangeTypeSetting,
  PoRequestOrigin,
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

/**
 * 요청 부서 추가·수정 (code가 없으면 새로 추가 — code는 DB가 만든다)
 */
export const saveRequestOrigin = async (
  origin: Omit<PoRequestOrigin, 'code' | 'function_group'> & { code?: string },
  userId: string
): Promise<void> => {
  const supabase = createClient();
  const values = {
    department: origin.department,
    company: origin.company,
    display_name: origin.display_name,
    category: origin.category,
    sort_order: origin.sort_order,
    is_active: origin.is_active,
    updated_by: userId,
  };
  const { error } = origin.code
    ? await supabase.from('po_request_origins').update(values).eq('code', origin.code)
    : await supabase.from('po_request_origins').insert(values);
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 요청 부서 삭제 — 사유에 쓰인 부서는 DB가 막음 (대신 사용 중을 끔)
 */
export const deleteRequestOrigin = async (code: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('po_request_origins').delete().eq('code', code);
  if (error) {
    if (error.code === '23503') {
      throw new Error(tn(
        '이미 변경 사유에 쓰인 부서라 삭제할 수 없습니다. 수정에서 "사용 중"을 꺼주세요.',
        'This department is used in change reasons and cannot be deleted. Turn off "Active" instead.'
      ));
    }
    throw new Error(formatPoTrackerError(error));
  }
};

/**
 * 고객처 계정 목록 조회 (순서대로)
 * @param activeOnly true면 사용 중인 것만
 */
export const fetchCustomerAccounts = async (activeOnly = false): Promise<CustomerAccount[]> => {
  const supabase = createClient();
  let query = supabase
    .from('po_customer_accounts')
    .select('customer_name, account_no, sort_order, is_active')
    .order('sort_order')
    .order('customer_name');
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as CustomerAccount[];
};

/**
 * 고객처 계정 추가·수정 (고객처 이름 기준)
 */
export const saveCustomerAccount = async (account: CustomerAccount, userId: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase
    .from('po_customer_accounts')
    .upsert({ ...account, updated_by: userId }, { onConflict: 'customer_name' });
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 고객처 계정 삭제 — 이미 가입한 계정은 그대로 두고 목록에서만 빠짐
 */
export const deleteCustomerAccount = async (customerName: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('po_customer_accounts').delete().eq('customer_name', customerName);
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 추가 조회 권한 목록 (부서·고객처 순)
 */
export const fetchViewGrants = async (): Promise<ViewGrant[]> => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('po_view_grants')
    .select('id, origin_code, customer_name, note, granted_by_name, created_at')
    .order('origin_code')
    .order('customer_name');
  if (error) throw new Error(formatPoTrackerError(error));
  return (data ?? []) as ViewGrant[];
};

/**
 * 추가 조회 권한 부여 (한 부서에 여러 고객처, 이미 있는 것은 건너뜀)
 */
export const addViewGrants = async (originCode: string, customerNames: string[], note: string | null): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase
    .from('po_view_grants')
    .upsert(
      customerNames.map((customer_name) => ({ origin_code: originCode, customer_name, note })),
      { onConflict: 'origin_code,customer_name', ignoreDuplicates: true }
    );
  if (error) throw new Error(formatPoTrackerError(error));
};

/**
 * 추가 조회 권한 회수
 */
export const deleteViewGrant = async (id: string): Promise<void> => {
  const supabase = createClient();
  const { error } = await supabase.from('po_view_grants').delete().eq('id', id);
  if (error) throw new Error(formatPoTrackerError(error));
};
