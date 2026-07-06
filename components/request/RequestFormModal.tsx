/**
 * 통합 PO 변경 요청 작성 팝업
 */
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { sendUrgentRequestNotification, sendNewRequestNotification } from '@/lib/notification-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package } from 'lucide-react';
import { RequestReasonSelect } from '@/components/request/RequestReasonSelect';
import {
  ALL_CUSTOMERS,
  HEADQUARTERS_TEAMS,
  DOMESTIC_BRANCH_SHIPPING_METHODS,
  OVERSEAS_CUSTOMER_SHIPPING_METHODS,
  ALL_SHIPPING_METHODS,
  FORM_PRODUCT_CATEGORIES,
} from '@/lib/request-constants';
import type { RequestTypeCard } from '@/lib/request-constants';
import {
  isAddTypeValue,
  isItemListVisible,
  needsProductCategory,
  validateSONumber,
  validateERPCode,
  asApiError,
} from '@/lib/request-helpers';
import { fetchFrozenSettingByCustomer } from '@/lib/frozen-date-api';
import { resolveFrozenStatus } from '@/lib/frozen-date';
import type { FrozenStatus } from '@/types/frozen-date';
import { cn } from '@/lib/utils';

interface UserProfile {
  id: string;
  full_name: string;
  department: string;
  role: string;
}

interface RequestFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestType: RequestTypeCard | null;
  userId: string;
  profile: UserProfile;
  isAdmin: boolean;
  onSuccess: () => void;
}

interface FormState {
  customer: string;
  so_number: string;
  factory_shipment_date: string;
  desired_shipment_date: string;
  priority: '긴급' | '보통';
  shipping_method: string;
  reason_for_request: string;
  request_details: string;
  items: Array<{ erp_code: string; item_name: string; quantity: number }>;
}

const getInitialForm = (): FormState => ({
  customer: '',
  so_number: '',
  factory_shipment_date: '',
  desired_shipment_date: '',
  priority: '보통',
  shipping_method: '',
  reason_for_request: '수요 예측 오류',
  request_details: '',
  items: [],
});

/** 완전한 출하일(YYYY-MM-DD) 입력 여부 */
const isCompleteShipDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
};

export const RequestFormModal = ({
  open,
  onOpenChange,
  requestType,
  userId,
  profile,
  isAdmin,
  onSuccess,
}: RequestFormModalProps) => {
  const [form, setForm] = useState<FormState>(getInitialForm);
  const [currentItem, setCurrentItem] = useState({ erp_code: '', item_name: '', quantity: 0 });
  const [productCategory, setProductCategory] = useState<string[]>([]);
  const [soNumberError, setSONumberError] = useState('');
  const [erpCodeError, setERPCodeError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [frozenStatus, setFrozenStatus] = useState<FrozenStatus>('unset');
  const [frozenWarningOpen, setFrozenWarningOpen] = useState(false);
  const lastFrozenWarnedDateRef = useRef('');
  const shipDateRef = useRef('');

  const categoryLabel = requestType?.label ?? '';
  const isAddType = requestType ? isAddTypeValue(requestType.value) : false;
  const isSoRequired = !isAddType;
  const showItemList = categoryLabel ? isItemListVisible(categoryLabel) : true;
  const showShippingMethod = categoryLabel === '운송방법 변경';

  const availableCustomers = useMemo((): string[] => {
    if (isAdmin) return [...ALL_CUSTOMERS];
    const dept = profile.department;
    if (dept && HEADQUARTERS_TEAMS.includes(dept as (typeof HEADQUARTERS_TEAMS)[number])) {
      return [...ALL_CUSTOMERS];
    }
    if (dept) return [dept];
    return [...ALL_CUSTOMERS];
  }, [isAdmin, profile.department]);

  const availableShippingMethods = useMemo((): string[] => {
    const department = (profile.department ?? '').trim();
    if (!department) return [...ALL_SHIPPING_METHODS];
    if (department.endsWith('지사')) return [...DOMESTIC_BRANCH_SHIPPING_METHODS];
    if ((ALL_CUSTOMERS as readonly string[]).includes(department)) {
      return [...OVERSEAS_CUSTOMER_SHIPPING_METHODS];
    }
    return [...ALL_SHIPPING_METHODS];
  }, [profile.department]);

  const resetForm = useCallback(() => {
    setForm(getInitialForm());
    setCurrentItem({ erp_code: '', item_name: '', quantity: 0 });
    setProductCategory([]);
    setSONumberError('');
    setERPCodeError('');
    setFrozenStatus('unset');
    setFrozenWarningOpen(false);
    lastFrozenWarnedDateRef.current = '';
    shipDateRef.current = '';
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    if (availableCustomers.length === 1) {
      setForm((prev) => ({ ...prev, customer: availableCustomers[0] }));
    }
  }, [open, availableCustomers, resetForm]);

  useEffect(() => {
    const shipDate = form.factory_shipment_date;

    if (!open || !form.customer || !requestType || !profile.department || !isCompleteShipDate(shipDate)) {
      setFrozenStatus('unset');
      setFrozenWarningOpen(false);
      return;
    }

    let cancelled = false;

    const checkFrozen = async () => {
      const setting = await fetchFrozenSettingByCustomer(form.customer);
      if (cancelled || shipDateRef.current !== shipDate) return;

      const status = resolveFrozenStatus({
        setting,
        requesterDepartment: profile.department,
        requestTypeValue: requestType.value,
        shipDate,
        requestDate: new Date().toISOString().split('T')[0],
      });

      if (cancelled || shipDateRef.current !== shipDate) return;

      setFrozenStatus(status);

      if (status === 'after' && lastFrozenWarnedDateRef.current !== shipDate) {
        lastFrozenWarnedDateRef.current = shipDate;
        setFrozenWarningOpen(true);
      }
    };

    void checkFrozen();
    return () => {
      cancelled = true;
    };
  }, [open, form.customer, form.factory_shipment_date, requestType, profile.department]);

  const handleFactoryShipmentDateChange = (value: string) => {
    shipDateRef.current = value;

    if (!value) {
      lastFrozenWarnedDateRef.current = '';
      setFrozenStatus('unset');
      setFrozenWarningOpen(false);
    }

    setForm((prev) => ({ ...prev, factory_shipment_date: value }));
  };

  const handleSONumberChange = (value: string) => {
    setForm((prev) => ({ ...prev, so_number: value }));
    if (isSoRequired && value && !validateSONumber(value)) {
      setSONumberError('SO 번호를 다시 확인해주세요. (형식: SO + 9자리 숫자, 예: SO123456789)');
    } else {
      setSONumberError('');
    }
  };

  const handleERPCodeChange = (value: string) => {
    setCurrentItem((prev) => ({ ...prev, erp_code: value }));
    if (value && !validateERPCode(value)) {
      setERPCodeError('ERP 코드를 다시 확인해주세요. (9자리 영문+숫자)');
    } else {
      setERPCodeError('');
    }
  };

  const handleAddItem = () => {
    if (currentItem.erp_code && !validateERPCode(currentItem.erp_code)) {
      toast.error('ERP 코드를 다시 확인해주세요. (9자리 영문+숫자)');
      return;
    }
    if (!currentItem.erp_code || !currentItem.item_name) {
      toast.error('품목코드와 품목명을 입력해주세요.');
      return;
    }
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...currentItem }] }));
    setCurrentItem({ erp_code: '', item_name: '', quantity: 0 });
    setERPCodeError('');
  };

  const handleRemoveItem = (index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) return;
          const items: FormState['items'] = [];
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'xlsx' || ext === 'xls') {
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false }) as unknown[][];
            for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (!row?.length) continue;
              const erpCode = String(row[0] || '').trim();
              const itemName = String(row[1] || '').trim();
              const quantity = parseInt(String(row[2] || '0')) || 0;
              if (erpCode || itemName) items.push({ erp_code: erpCode, item_name: itemName, quantity });
            }
          }
          if (items.length > 0) {
            setForm((prev) => ({ ...prev, items: [...prev.items, ...items] }));
            toast.success(`${items.length}개의 품목이 추가되었습니다.`);
          } else {
            toast.error('유효한 데이터가 없습니다.');
          }
        } catch {
          toast.error('Excel 파일을 읽는 중 오류가 발생했습니다.');
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      toast.error('파일 업로드 중 오류가 발생했습니다.');
    } finally {
      event.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!requestType || !categoryLabel) return;

    if (!form.customer) {
      toast.error('고객은 필수 항목입니다.');
      return;
    }
    if (!form.factory_shipment_date) {
      toast.error('현재 출하일을 입력해주세요.');
      return;
    }
    if (isSoRequired && !form.so_number) {
      toast.error('SO번호는 필수 항목입니다.');
      return;
    }
    if (isSoRequired && form.so_number && !validateSONumber(form.so_number)) {
      toast.error('SO 번호 형식을 확인해주세요.');
      return;
    }
    if (showItemList && erpCodeError) {
      toast.error('ERP 코드를 확인해주세요.');
      return;
    }
    if (needsProductCategory(categoryLabel) && productCategory.length === 0) {
      toast.error('품목 구분을 선택해주세요.');
      return;
    }
    if (showShippingMethod && !form.shipping_method) {
      toast.error('운송방법을 선택해주세요.');
      return;
    }
    if (!form.request_details.trim()) {
      toast.error('요청상세는 필수 항목입니다.');
      return;
    }
    if (showItemList && form.items.length === 0) {
      toast.error('최소 1개 이상의 품목을 추가해주세요.');
      return;
    }
    if (!profile.department) {
      toast.error('사용자 프로필의 부서 정보가 없습니다.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const firstItem = form.items[0] ?? null;
      const dbRequestType = isAddType ? 'new' : 'existing';
      const requestDate = new Date().toISOString().split('T')[0];
      const frozenSetting = await fetchFrozenSettingByCustomer(form.customer);
      const frozen_status = resolveFrozenStatus({
        setting: frozenSetting,
        requesterDepartment: profile.department,
        requestTypeValue: requestType.value,
        shipDate: form.factory_shipment_date,
        requestDate,
      });

      const requestData: Record<string, unknown> = {
        customer: form.customer,
        requesting_dept: profile.department,
        requester_id: userId,
        requester_name: profile.full_name,
        request_date: requestDate,
        category_of_request: categoryLabel,
        priority: form.priority,
        reason_for_request: form.reason_for_request,
        request_details: form.request_details,
        status: 'pending',
        completed: false,
        frozen_status,
        request_type: dbRequestType,
        so_number: isAddType ? form.so_number || null : form.so_number,
        factory_shipment_date: form.factory_shipment_date,
        erp_code: firstItem?.erp_code || '',
        item_name: firstItem?.item_name || '',
        quantity: firstItem?.quantity ?? 0,
      };

      if (form.desired_shipment_date) {
        requestData.desired_shipment_date = form.desired_shipment_date;
      }
      if (showShippingMethod && form.shipping_method) {
        requestData.shipping_method = form.shipping_method;
      }
      if (needsProductCategory(categoryLabel) && productCategory.length > 0) {
        requestData.product_category = productCategory.join(', ');
      }
      if (form.items.length > 0) {
        requestData.items = form.items;
      }

      const { data: createdRequest, error } = await supabase
        .from('requests')
        .insert(requestData)
        .select()
        .single();

      if (error) throw error;

      toast.success('새 요청이 생성되었습니다.');
      onOpenChange(false);
      resetForm();
      onSuccess();

      if (createdRequest) {
        try {
          if (form.priority === '긴급') {
            await sendUrgentRequestNotification(
              createdRequest.id,
              form.so_number,
              form.customer,
              profile.full_name
            );
          } else {
            await sendNewRequestNotification(
              createdRequest.id,
              form.so_number,
              form.customer,
              profile.full_name,
              form.priority
            );
          }
        } catch {
          /* 알림 실패 무시 */
        }
      }
    } catch (error: unknown) {
      const err = asApiError(error);
      console.error('요청 생성 오류:', error);
      toast.error(err.message ? `요청 생성 실패: ${err.message}` : '요청 생성 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!requestType) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#101820]">
            PO 변경 요청 - {requestType.label}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {requestType.label} 유형의 PO 변경 요청을 작성합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>고객 <span className="text-red-500">*</span></Label>
              <Select
                value={form.customer}
                onValueChange={(v) => {
                  lastFrozenWarnedDateRef.current = '';
                  setFrozenWarningOpen(false);
                  setForm((p) => ({ ...p, customer: v }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="고객을 선택하세요" /></SelectTrigger>
                <SelectContent>
                  {availableCustomers.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SO 번호 {isSoRequired && <span className="text-red-500">*</span>}</Label>
              <Input
                value={form.so_number}
                onChange={(e) => handleSONumberChange(e.target.value)}
                placeholder="예: SO123456789"
                className={cn(isSoRequired && soNumberError && 'border-red-500')}
              />
              {soNumberError && <p className="text-xs text-red-500">{soNumberError}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>현재 출하일 <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={form.factory_shipment_date}
                onChange={(e) => handleFactoryShipmentDateChange(e.target.value)}
              />
              {isCompleteShipDate(form.factory_shipment_date) && frozenStatus === 'before' && (
                <span className="text-xs text-gray-500">프로즌 이전</span>
              )}
              {isCompleteShipDate(form.factory_shipment_date) && frozenStatus === 'unset' && (
                <span className="text-xs text-gray-400">프로즌 기준 미설정</span>
              )}
            </div>
            <div className="space-y-2">
              <Label>희망 출하일</Label>
              <Input
                type="date"
                value={form.desired_shipment_date}
                onChange={(e) => setForm((p) => ({ ...p, desired_shipment_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>요청구분</Label>
            <div className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium">{requestType.label}</div>
          </div>

          {showShippingMethod && (
            <div className="space-y-2">
              <Label>변경 운송방법 <span className="text-red-500">*</span></Label>
              <Select value={form.shipping_method} onValueChange={(v) => setForm((p) => ({ ...p, shipping_method: v }))}>
                <SelectTrigger><SelectValue placeholder="운송방법 선택" /></SelectTrigger>
                <SelectContent>
                  {availableShippingMethods.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>우선순위 <span className="text-red-500">*</span></Label>
            <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as '긴급' | '보통' }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="긴급">긴급</SelectItem>
                <SelectItem value="보통">보통</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showItemList && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>품목 목록 <span className="text-red-500">*</span></Label>
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('excel-upload-modal')?.click()}>
                  Excel 업로드
                </Button>
                <input id="excel-upload-modal" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
              </div>

              {needsProductCategory(categoryLabel) && (
                <div className="rounded-lg border-2 border-[#971B2F]/20 bg-[#971B2F]/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="font-semibold">품목 구분 <span className="text-[#971B2F]">*</span></Label>
                    <Package className="h-4 w-4 text-[#971B2F]" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {FORM_PRODUCT_CATEGORIES.map((cat) => {
                      const checked = productCategory.includes(cat.value);
                      return (
                        <div
                          key={cat.value}
                          className={cn(
                            'flex cursor-pointer items-center space-x-2 rounded-md border px-3 py-2',
                            checked ? 'border-[#971B2F] bg-[#971B2F]/10' : 'border-gray-200 bg-white'
                          )}
                          onClick={() =>
                            setProductCategory((prev) =>
                              prev.includes(cat.value)
                                ? prev.filter((v) => v !== cat.value)
                                : [...prev, cat.value]
                            )
                          }
                        >
                          <Checkbox checked={checked} className="border-[#971B2F]" />
                          <span className="text-sm">{cat.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">품목 코드 *</Label>
                  <Input
                    value={currentItem.erp_code}
                    onChange={(e) => handleERPCodeChange(e.target.value)}
                    placeholder="예: I9U800002"
                    className={cn('text-sm', erpCodeError && 'border-red-500')}
                  />
                </div>
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">품목명</Label>
                  <Input
                    value={currentItem.item_name}
                    onChange={(e) => setCurrentItem((p) => ({ ...p, item_name: e.target.value }))}
                    className="text-sm"
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">수량</Label>
                  <Input
                    type="number"
                    value={currentItem.quantity}
                    onChange={(e) =>
                      setCurrentItem((p) => ({
                        ...p,
                        quantity: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="text-sm"
                  />
                </div>
                <div className="col-span-1">
                  <Button type="button" size="sm" className="w-full bg-[#971B2F] hover:bg-[#7A1626]" onClick={handleAddItem}>
                    +
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">품목코드</th>
                      <th className="px-3 py-2 text-left">품목명</th>
                      <th className="px-3 py-2 text-right">수량</th>
                      <th className="w-16 px-3 py-2 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {form.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-gray-500">품목을 추가해주세요.</td>
                      </tr>
                    ) : (
                      form.items.map((item, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{item.erp_code}</td>
                          <td className="px-3 py-2">{item.item_name}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-center">
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveItem(i)} className="text-red-600">
                              ×
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>요청사유 <span className="text-red-500">*</span></Label>
            <RequestReasonSelect
              value={form.reason_for_request}
              onChange={(v) => setForm((p) => ({ ...p, reason_for_request: v }))}
            />
          </div>

          <div className="space-y-2">
            <Label>요청상세 <span className="text-red-500">*</span></Label>
            <Textarea
              value={form.request_details}
              onChange={(e) => setForm((p) => ({ ...p, request_details: e.target.value }))}
              placeholder="요청 상세 내용을 입력해주세요"
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>취소</Button>
          <Button className="bg-[#971B2F] hover:bg-[#7A1626]" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? '제출 중...' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={frozenWarningOpen}
      onOpenChange={(next) => {
        if (next) setFrozenWarningOpen(true);
      }}
    >
      <DialogContent
        className="z-[60] max-w-md"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[#971B2F]">프로즌 이후</DialogTitle>
          <DialogDescription className="text-base text-[#101820]" role="alert">
            프로즌 이후 - 프로즌된 발주 건이라 변경이 불가합니다. 그럼에도 변경 요청을 하시겠습니까?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            className="bg-[#971B2F] hover:bg-[#7A1626]"
            onClick={() => setFrozenWarningOpen(false)}
          >
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};
