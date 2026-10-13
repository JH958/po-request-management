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
import { useLanguage } from '@/context/LanguageContext';

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
  const { t } = useLanguage();
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
      setSONumberError(
        t(
          'SO 번호를 다시 확인해주세요. (형식: SO + 9자리 숫자, 예: SO123456789)',
          'Check the SO number. (Format: SO + 9 digits, e.g. SO123456789)'
        )
      );
    } else {
      setSONumberError('');
    }
  };

  const handleERPCodeChange = (value: string) => {
    setCurrentItem((prev) => ({ ...prev, erp_code: value }));
    if (value && !validateERPCode(value)) {
      setERPCodeError(t('ERP 코드를 다시 확인해주세요. (9자리 영문+숫자)', 'Check the ERP code. (9 letters/digits)'));
    } else {
      setERPCodeError('');
    }
  };

  const handleAddItem = () => {
    if (currentItem.erp_code && !validateERPCode(currentItem.erp_code)) {
      toast.error(t('ERP 코드를 다시 확인해주세요. (9자리 영문+숫자)', 'Check the ERP code. (9 letters/digits)'));
      return;
    }
    if (!currentItem.erp_code || !currentItem.item_name) {
      toast.error(t('품목코드와 품목명을 입력해주세요.', 'Enter the item code and item name.'));
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
            toast.success(t(`${items.length}개의 품목이 추가되었습니다.`, `${items.length} items added.`));
          } else {
            toast.error(t('유효한 데이터가 없습니다.', 'No valid rows found.'));
          }
        } catch {
          toast.error(t('Excel 파일을 읽는 중 오류가 발생했습니다.', 'An error occurred while reading the Excel file.'));
        }
      };
      reader.readAsArrayBuffer(file);
    } catch {
      toast.error(t('파일 업로드 중 오류가 발생했습니다.', 'An error occurred while uploading the file.'));
    } finally {
      event.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!requestType || !categoryLabel) return;

    if (!form.customer) {
      toast.error(t('고객은 필수 항목입니다.', 'Customer is required.'));
      return;
    }
    if (!form.factory_shipment_date) {
      toast.error(t('현재 출하일을 입력해주세요.', 'Enter the current ship date.'));
      return;
    }
    if (isSoRequired && !form.so_number) {
      toast.error(t('SO번호는 필수 항목입니다.', 'SO number is required.'));
      return;
    }
    if (isSoRequired && form.so_number && !validateSONumber(form.so_number)) {
      toast.error(t('SO 번호 형식을 확인해주세요.', 'Check the SO number format.'));
      return;
    }
    if (showItemList && erpCodeError) {
      toast.error(t('ERP 코드를 확인해주세요.', 'Check the ERP code.'));
      return;
    }
    if (needsProductCategory(categoryLabel) && productCategory.length === 0) {
      toast.error(t('품목 구분을 선택해주세요.', 'Select a product category.'));
      return;
    }
    if (showShippingMethod && !form.shipping_method) {
      toast.error(t('운송방법을 선택해주세요.', 'Select a shipping method.'));
      return;
    }
    if (!form.request_details.trim()) {
      toast.error(t('요청상세는 필수 항목입니다.', 'Request details are required.'));
      return;
    }
    if (showItemList && form.items.length === 0) {
      toast.error(t('최소 1개 이상의 품목을 추가해주세요.', 'Add at least one item.'));
      return;
    }
    if (!profile.department) {
      toast.error(t('사용자 프로필의 부서 정보가 없습니다.', 'Your profile has no department.'));
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

      toast.success(t('새 요청이 생성되었습니다.', 'Request created.'));
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
      toast.error(
        err.message
          ? `${t('요청 생성 실패', 'Failed to create request')}: ${err.message}`
          : t('요청 생성 중 오류가 발생했습니다.', 'An error occurred while creating the request.')
      );
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
          <DialogTitle className="text-xl font-bold text-[#172132]">
            {t('PO 변경 요청', 'PO Change Request')} - {requestType.label}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t(`${requestType.label} 유형의 PO 변경 요청을 작성합니다.`, `Create a ${requestType.label} PO change request.`)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('고객', 'Customer')} <span className="text-red-500">*</span></Label>
              <Select
                value={form.customer}
                onValueChange={(v) => {
                  lastFrozenWarnedDateRef.current = '';
                  setFrozenWarningOpen(false);
                  setForm((p) => ({ ...p, customer: v }));
                }}
              >
                <SelectTrigger><SelectValue placeholder={t('고객을 선택하세요', 'Select a customer')} /></SelectTrigger>
                <SelectContent>
                  {availableCustomers.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('SO 번호', 'SO No.')} {isSoRequired && <span className="text-red-500">*</span>}</Label>
              <Input
                value={form.so_number}
                onChange={(e) => handleSONumberChange(e.target.value)}
                placeholder={t('예: SO123456789', 'e.g. SO123456789')}
                className={cn(isSoRequired && soNumberError && 'border-red-500')}
              />
              {soNumberError && <p className="text-xs text-red-500">{soNumberError}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('현재 출하일', 'Current ship date')} <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={form.factory_shipment_date}
                onChange={(e) => handleFactoryShipmentDateChange(e.target.value)}
              />
              {isCompleteShipDate(form.factory_shipment_date) && frozenStatus === 'before' && (
                <span className="text-xs text-gray-500">{t('프로즌 이전', 'Before frozen date')}</span>
              )}
              {isCompleteShipDate(form.factory_shipment_date) && frozenStatus === 'unset' && (
                <span className="text-xs text-gray-400">{t('프로즌 기준 미설정', 'No frozen date rule')}</span>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('희망 출하일', 'Desired ship date')}</Label>
              <Input
                type="date"
                value={form.desired_shipment_date}
                onChange={(e) => setForm((p) => ({ ...p, desired_shipment_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('요청구분', 'Request type')}</Label>
            <div className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium">{requestType.label}</div>
          </div>

          {showShippingMethod && (
            <div className="space-y-2">
              <Label>{t('변경 운송방법', 'New shipping method')} <span className="text-red-500">*</span></Label>
              <Select value={form.shipping_method} onValueChange={(v) => setForm((p) => ({ ...p, shipping_method: v }))}>
                <SelectTrigger><SelectValue placeholder={t('운송방법 선택', 'Select shipping method')} /></SelectTrigger>
                <SelectContent>
                  {availableShippingMethods.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('우선순위', 'Priority')} <span className="text-red-500">*</span></Label>
            <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as '긴급' | '보통' }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="긴급">{t('긴급', 'Urgent')}</SelectItem>
                <SelectItem value="보통">{t('보통', 'Normal')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showItemList && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('품목 목록', 'Items')} <span className="text-red-500">*</span></Label>
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('excel-upload-modal')?.click()}>
                  {t('Excel 업로드', 'Upload Excel')}
                </Button>
                <input id="excel-upload-modal" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
              </div>

              {needsProductCategory(categoryLabel) && (
                <div className="rounded-lg border-2 border-[#8B1538]/20 bg-[#8B1538]/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="font-semibold">{t('품목 구분', 'Product category')} <span className="text-[#8B1538]">*</span></Label>
                    <Package className="h-4 w-4 text-[#8B1538]" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {FORM_PRODUCT_CATEGORIES.map((cat) => {
                      const checked = productCategory.includes(cat.value);
                      return (
                        <div
                          key={cat.value}
                          className={cn(
                            'flex cursor-pointer items-center space-x-2 rounded-md border px-3 py-2',
                            checked ? 'border-[#8B1538] bg-[#8B1538]/10' : 'border-gray-200 bg-white'
                          )}
                          onClick={() =>
                            setProductCategory((prev) =>
                              prev.includes(cat.value)
                                ? prev.filter((v) => v !== cat.value)
                                : [...prev, cat.value]
                            )
                          }
                        >
                          <Checkbox checked={checked} className="border-[#8B1538]" />
                          <span className="text-sm">{cat.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">{t('품목 코드', 'Item code')} *</Label>
                  <Input
                    value={currentItem.erp_code}
                    onChange={(e) => handleERPCodeChange(e.target.value)}
                    placeholder={t('예: I9U800002', 'e.g. I9U800002')}
                    className={cn('text-sm', erpCodeError && 'border-red-500')}
                  />
                </div>
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">{t('품목명', 'Item name')}</Label>
                  <Input
                    value={currentItem.item_name}
                    onChange={(e) => setCurrentItem((p) => ({ ...p, item_name: e.target.value }))}
                    className="text-sm"
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">{t('수량', 'Qty')}</Label>
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
                  <Button type="button" size="sm" className="w-full bg-[#8B1538] hover:bg-[#74112F]" onClick={handleAddItem}>
                    +
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('품목코드', 'Item code')}</th>
                      <th className="px-3 py-2 text-left">{t('품목명', 'Item name')}</th>
                      <th className="px-3 py-2 text-right">{t('수량', 'Qty')}</th>
                      <th className="w-16 px-3 py-2 text-center">{t('삭제', 'Delete')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {form.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                          {t('품목을 추가해주세요.', 'Add items.')}
                        </td>
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
            <Label>{t('요청사유', 'Request reason')} <span className="text-red-500">*</span></Label>
            <RequestReasonSelect
              value={form.reason_for_request}
              onChange={(v) => setForm((p) => ({ ...p, reason_for_request: v }))}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('요청상세', 'Request details')} <span className="text-red-500">*</span></Label>
            <Textarea
              value={form.request_details}
              onChange={(e) => setForm((p) => ({ ...p, request_details: e.target.value }))}
              placeholder={t('요청 상세 내용을 입력해주세요', 'Describe the request in detail')}
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('취소', 'Cancel')}
          </Button>
          <Button className="bg-[#8B1538] hover:bg-[#74112F]" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? t('제출 중...', 'Submitting...') : t('추가', 'Submit')}
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
          <DialogTitle className="text-[#8B1538]">{t('프로즌 이후', 'After frozen date')}</DialogTitle>
          <DialogDescription className="text-base text-[#172132]" role="alert">
            {t(
              '프로즌 이후 - 프로즌된 발주 건이라 변경이 불가합니다. 그럼에도 변경 요청을 하시겠습니까?',
              'After frozen date — this order is frozen and normally cannot be changed. Do you still want to submit a change request?'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            className="bg-[#8B1538] hover:bg-[#74112F]"
            onClick={() => setFrozenWarningOpen(false)}
          >
            {t('확인', 'OK')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};
