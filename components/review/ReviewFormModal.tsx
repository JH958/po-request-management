/**
 * 검토 팝업 (승인/반려/확정수량)
 */
'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package } from 'lucide-react';
import type { PORequest, FeasibilityStatus, RequestStatus } from '@/types/request';
import {
  isItemAdditionCategory,
  needsProductCategory,
  validateApproveConfirmedQuantity,
  validateRejectConfirmedQuantity,
  getReadableErrorMessage,
} from '@/lib/request-helpers';
import { ProductCategoryBadges } from '@/components/common/ProductCategoryBadges';

interface ReviewFormModalProps {
  request: PORequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  profile: { full_name: string; department: string };
  isReviewer: boolean;
  isAdmin: boolean;
  onSuccess: () => void;
}

export const ReviewFormModal = ({
  request,
  open,
  onOpenChange,
  userId,
  profile,
  isReviewer,
  isAdmin,
  onSuccess,
}: ReviewFormModalProps) => {
  const [editingFeasibility, setEditingFeasibility] = useState<FeasibilityStatus | null>(null);
  const [editingReviewDetails, setEditingReviewDetails] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reviewDetails, setReviewDetails] = useState('');
  const [confirmedQuantity, setConfirmedQuantity] = useState<number | null>(null);

  const canReview = (isReviewer || isAdmin) && request?.requester_id !== userId;
  const isItemAddition = request ? isItemAdditionCategory(request.category_of_request) : false;

  useEffect(() => {
    if (request && open) {
      setEditingFeasibility(request.feasibility || null);
      setEditingReviewDetails(request.review_details || '');
      setConfirmedQuantity(request.confirmed_quantity ?? null);
      setReviewDetails('');
    }
  }, [request, open]);

  const handleFeasibilityChange = async () => {
    if (!request || !canReview) return;
    if (!editingReviewDetails.trim()) {
      toast.error('검토상세 내용을 입력해주세요.');
      return;
    }
    if (!editingFeasibility) {
      toast.error('가능여부를 선택해주세요.');
      return;
    }

    try {
      const supabase = createClient();
      let newStatus: RequestStatus = 'pending';
      if (editingFeasibility === 'approved') newStatus = 'approved';
      else if (editingFeasibility === 'rejected') newStatus = 'rejected';

      const { error } = await supabase
        .from('requests')
        .update({
          feasibility: editingFeasibility,
          status: newStatus,
          review_details: editingReviewDetails,
          reviewer_id: userId,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (error) throw error;
      toast.success('가능여부가 변경되었습니다.');
      setConfirmDialogOpen(false);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('가능여부 변경 오류:', error);
      toast.error('가능여부 변경 중 오류가 발생했습니다.');
    }
  };

  const handleConfirmApprove = async () => {
    if (!request || !canReview) return;
    if (!reviewDetails.trim()) {
      toast.error('검토 상세 내용을 입력해주세요.');
      return;
    }
    if (isItemAddition && !validateApproveConfirmedQuantity(confirmedQuantity, request.quantity ?? 0)) {
      toast.error('승인 시 확정 수량은 1개 이상이어야 합니다.');
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('requests')
        .update({
          feasibility: 'approved',
          status: 'approved',
          review_details: reviewDetails,
          confirmed_quantity: isItemAddition ? confirmedQuantity : null,
          reviewer_id: userId,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (error) throw error;
      toast.success('요청이 승인되었습니다.');
      setApproveDialogOpen(false);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
  };

  const handleConfirmReject = async () => {
    if (!request || !canReview) return;
    if (!reviewDetails.trim()) {
      toast.error('검토 상세 내용을 입력해주세요.');
      return;
    }
    if (isItemAddition && !validateRejectConfirmedQuantity(confirmedQuantity, request.quantity ?? 0)) {
      toast.error('확정 수량을 확인해주세요.');
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('requests')
        .update({
          feasibility: 'rejected',
          status: 'rejected',
          review_details: reviewDetails,
          confirmed_quantity: isItemAddition ? confirmedQuantity : null,
          reviewer_id: userId,
          reviewer_name: profile.full_name,
          reviewing_dept: profile.department,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (error) throw error;
      toast.success('요청이 반려되었습니다.');
      setRejectDialogOpen(false);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getReadableErrorMessage(error));
    }
  };

  if (!request) return null;

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>요청 상세 정보</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {canReview && request.product_category && (
              <div className="rounded-lg border-2 border-[#971B2F]/30 bg-gradient-to-r from-[#971B2F]/5 to-[#971B2F]/10 p-4">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-[#971B2F]" />
                  <ProductCategoryBadges category={request.product_category} size="md" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-[#67767F]">고객</p><p>{request.customer}</p></div>
              <div><p className="text-[#67767F]">SO번호</p><p>{request.so_number || '-'}</p></div>
              <div><p className="text-[#67767F]">요청부서</p><p>{request.requesting_dept}</p></div>
              <div><p className="text-[#67767F]">요청자</p><p>{request.requester_name}</p></div>
              <div><p className="text-[#67767F]">출하일</p><p>{request.factory_shipment_date}</p></div>
              <div><p className="text-[#67767F]">요청구분</p><p>{request.category_of_request}</p></div>
              {needsProductCategory(request.category_of_request) && (
                <div>
                  <p className="text-[#67767F]">품목구분</p>
                  <ProductCategoryBadges category={request.product_category} size="md" />
                </div>
              )}
              <div><p className="text-[#67767F]">품목코드</p><p>{request.erp_code}</p></div>
              <div><p className="text-[#67767F]">품목명</p><p>{request.item_name}</p></div>
              <div><p className="text-[#67767F]">수량</p><p>{request.quantity}</p></div>
              <div><p className="text-[#67767F]">요청사유</p><p>{request.reason_for_request}</p></div>
              <div className="col-span-2">
                <p className="text-[#67767F]">요청상세</p>
                <p className="whitespace-pre-wrap">{request.request_details || '-'}</p>
              </div>
              {canReview && (
                <>
                  <div>
                    <Label className="mb-2 block">가능여부</Label>
                    <Select
                      value={
                        editingFeasibility === 'approved' ? '가능' :
                        editingFeasibility === 'rejected' ? '불가능' :
                        editingFeasibility === 'pending' ? '보류' : ''
                      }
                      onValueChange={(v) =>
                        setEditingFeasibility(
                          v === '가능' ? 'approved' : v === '불가능' ? 'rejected' : 'pending'
                        )
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="가능">가능</SelectItem>
                        <SelectItem value="불가능">불가능</SelectItem>
                        <SelectItem value="보류">보류</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="mb-2 block">검토상세 *</Label>
                    <Textarea
                      value={editingReviewDetails}
                      onChange={(e) => setEditingReviewDetails(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
          <AlertDialogFooter className="flex-wrap gap-2">
            {canReview && (
              <>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => { setReviewDetails(''); setApproveDialogOpen(true); }}
                >
                  승인
                </Button>
                <Button variant="destructive" onClick={() => { setReviewDetails(''); setRejectDialogOpen(true); }}>
                  반려
                </Button>
                <Button
                  className="bg-[#971B2F] hover:bg-[#7A1626]"
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={!editingFeasibility || !editingReviewDetails.trim()}
                >
                  가능여부 확정
                </Button>
              </>
            )}
            <AlertDialogCancel>닫기</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>가능여부 변경 확인</AlertDialogTitle></AlertDialogHeader>
          <p className="text-sm text-[#67767F]">입력한 검토 내용으로 가능여부를 변경하시겠습니까?</p>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button className="bg-[#971B2F]" onClick={() => void handleFeasibilityChange()}>확인</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>요청 승인</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>검토 상세 *</Label>
              <Textarea value={reviewDetails} onChange={(e) => setReviewDetails(e.target.value)} className="mt-1" />
            </div>
            {isItemAddition && (
              <div>
                <Label>확정 수량</Label>
                <Input
                  type="number"
                  value={confirmedQuantity ?? ''}
                  onChange={(e) =>
                    setConfirmedQuantity(e.target.value === '' ? null : parseInt(e.target.value))
                  }
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-[#67767F]">요청 수량: {request.quantity}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>취소</Button>
            <Button className="bg-green-600" onClick={() => void handleConfirmApprove()}>승인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>요청 반려</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>검토 상세 *</Label>
              <Textarea value={reviewDetails} onChange={(e) => setReviewDetails(e.target.value)} className="mt-1" />
            </div>
            {isItemAddition && (
              <div>
                <Label>확정 수량 (0 허용)</Label>
                <Input
                  type="number"
                  value={confirmedQuantity ?? ''}
                  onChange={(e) =>
                    setConfirmedQuantity(e.target.value === '' ? null : parseInt(e.target.value))
                  }
                  className="mt-1"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={() => void handleConfirmReject()}>반려</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
