/**
 * 요청 접수 추가/등록/수정 테이블 컴포넌트
 */
'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { PORequest } from '@/types/request';
import { formatDate, calculateDaysLeft } from '@/lib/dashboard-utils';

interface RequestFormTableProps {
  requests: PORequest[];
  onAdd?: (type: 'existing' | 'new') => void;
  onSave?: (request: PORequest) => void;
  onCancel?: (id: string) => void;
  onDelete?: (id: string) => void;
}

/**
 * Mock 데이터 - 드롭다운 옵션
 */
const customers = ['미국법인', '중국법인', '중국생산법인', '일본법인', '유럽법인'];
const departments = ['제조관리팀', '영업관리팀', '미국법인'];
const categories = ['제품/상품 추가', '자재 추가', '제품/상품 삭제', '자재 삭제', '품목 코드 변경', '일정 변경', '운송방법 변경'];
const reasons = ['수요 예측 오류', '재고 확인 부족', '영업적 이슈(이벤트 등)', '재고 부족', '적재공간 과부족', '품질 이슈', '선적스케줄 변경', '기타'];
const feasibilities = ['approved', 'rejected', 'pending'];

export const RequestFormTable = ({
  requests,
  onAdd,
  onSave,
  onCancel,
  onDelete,
}: RequestFormTableProps) => {
  const { user, profile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<PORequest>>({});
  
  // 역할 체크 헬퍼 함수
  const hasRole = (role: string): boolean => {
    if (!profile?.role) return false;
    // 콤마로 구분된 역할들을 체크
    const roles = profile.role.split(',').map(r => r.trim());
    return roles.includes(role);
  };
  
  // jhee105@inbody.com 계정은 요청자와 검토자 권한 모두 가짐
  const isRequester = hasRole('requester') || user?.email === 'jhee105@inbody.com';
  const isReviewer = hasRole('reviewer') || hasRole('admin') || user?.email === 'jhee105@inbody.com';
  const isAdmin = hasRole('admin');
  
  // 현재 사용자의 역할 (기본값: requester)
  const userRole = isAdmin ? 'admin' : isReviewer ? 'reviewer' : isRequester ? 'requester' : 'requester';
  
  /**
   * 역할별 필드 편집 가능 여부 확인
   */
  const canEditRequesterFields = (request: PORequest) => {
    // 요청자: 자신의 요청이고 pending 상태일 때만 편집 가능
    return isRequester && request.requester_id === user?.id && request.status === 'pending';
  };
  
  const canEditReviewerFields = () => {
    // 검토자 및 관리자: 검토 필드 편집 가능
    return isReviewer || isAdmin;
  };
  
  const canEditAdminFields = () => {
    // 관리자: 완료여부 편집 가능
    return isAdmin;
  };
  
  /**
   * 특정 필드 수정 권한 확인
   */
  const canEditField = (fieldName: string, request: PORequest, isEditingMode: boolean = false) => {
    // 관리자는 모든 필드 수정 가능
    if (isAdmin) return true;
    
    // 요청자 권한 필드
    const requesterFields = [
      'request_type', 'customer', 'requesting_dept', 'requester_name', 
      'so_number', 'factory_shipment_date', 'desired_shipment_date', 
      'shipping_method', 'category_of_request', 'priority', 
      'erp_code', 'item_name', 'quantity', 'reason_for_request', 'request_details'
    ];
    
    // 검토자 권한 필드 (요청자가 수정할 때는 비활성화)
    const reviewerFields = [
      'confirmed_shipment_date', 'feasibility', 'review_details', 
      'reviewing_dept', 'reviewer_name'
    ];
    
    // 요청자가 편집 중일 때는 검토자 필드 편집 불가
    if (isEditingMode && canEditRequesterFields(request)) {
      if (reviewerFields.includes(fieldName)) {
        return false;
      }
      if (fieldName === 'completed') {
        return false;
      }
    }
    
    if (requesterFields.includes(fieldName)) {
      return canEditRequesterFields(request);
    }
    
    if (reviewerFields.includes(fieldName)) {
      return canEditReviewerFields();
    }
    
    // 완료여부는 관리자만
    if (fieldName === 'completed') {
      return canEditAdminFields();
    }
    
    return false;
  };

  /**
   * 새 행 추가 핸들러
   */
  const handleAdd = (type: 'existing' | 'new') => {
    if (onAdd) {
      onAdd(type);
    } else {
      // 임시: 새 행 추가 로직
      console.log('Add new row:', type);
    }
  };

  /**
   * 저장 핸들러
   */
  const handleSave = (request: PORequest) => {
    if (onSave) {
      onSave(request);
    } else {
      console.log('Save request:', request);
    }
    setEditingId(null);
  };

  /**
   * 취소 핸들러
   */
  const handleCancel = (id: string) => {
    if (onCancel) {
      onCancel(id);
    }
    setEditingId(null);
  };

  /**
   * 삭제 핸들러
   */
  const handleDelete = (id: string) => {
    if (onDelete) {
      onDelete(id);
    } else {
      console.log('Delete request:', id);
    }
  };

  /**
   * 편집 시작 핸들러
   */
  const handleEdit = (id: string) => {
    const request = requests.find((r) => r.id === id);
    if (request) {
      setEditingId(id);
      setEditingData({ ...request });
    }
  };

  /**
   * 편집 중 데이터 변경 핸들러
   */
  const handleFieldChange = (field: keyof PORequest, value: any) => {
    setEditingData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * 저장 핸들러 (수정)
   */
  const handleSaveEdit = () => {
    if (editingId && editingData) {
      const request = requests.find((r) => r.id === editingId);
      if (request && onSave) {
        onSave({ ...request, ...editingData } as PORequest);
      }
      setEditingId(null);
      setEditingData({});
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-[#4B4F5A]">요청 접수</CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={() => handleAdd('existing')}
              className="bg-[#4B5563] hover:bg-[#374151] text-white"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              PO 수정 요청
            </Button>
            <Button
              onClick={() => handleAdd('new')}
              className="bg-[#971B2F] hover:bg-[#7A1626] text-white"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              PO 추가 요청
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-scroll">
          <div className="max-h-[600px] overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* 구분 - 모든 역할 */}
                  <TableHead className="min-w-[80px]">구분</TableHead>
                  {/* 우선순위 - 모든 역할 */}
                  <TableHead className="min-w-[100px]">우선순위</TableHead>
                  {/* 고객 - Admin만 */}
                  {isAdmin && (
                    <TableHead className="min-w-[180px]">고객</TableHead>
                  )}
                  {/* Requester/Reviewer/Admin 모두 보이는 필드 */}
                  <TableHead className="min-w-[150px]">요청부서</TableHead>
                  <TableHead className="min-w-[120px]">요청자</TableHead>
                  <TableHead className="min-w-[150px]">요청일</TableHead>
                  <TableHead className="min-w-[180px]">SO번호</TableHead>
                  <TableHead className="min-w-[150px]">현재 출하일</TableHead>
                  <TableHead className="min-w-[150px]">요청구분</TableHead>
                  <TableHead className="min-w-[180px]">품목코드</TableHead>
                  <TableHead className="min-w-[220px]">품목명</TableHead>
                  <TableHead className="min-w-[100px]">수량</TableHead>
                  <TableHead className="min-w-[150px]">희망 출하일</TableHead>
                  <TableHead className="min-w-[150px]">확정 출하일</TableHead>
                  <TableHead className="min-w-[120px]">변경 운송방법</TableHead>
                  <TableHead className="min-w-[150px]">요청사유</TableHead>
                  <TableHead className="min-w-[300px]">요청상세</TableHead>
                  <TableHead className="min-w-[100px]">리드타임</TableHead>
                  <TableHead className="min-w-[120px]">진행상태</TableHead>
                  {/* 가능여부 - Admin만 */}
                  {isAdmin && (
                    <TableHead className="min-w-[120px]">가능여부</TableHead>
                  )}
                  {/* 검토상세 - Admin만 */}
                  {isAdmin && (
                    <TableHead className="min-w-[300px]">검토상세</TableHead>
                  )}
                  {/* 검토부서 - Admin만 */}
                  {isAdmin && (
                    <TableHead className="min-w-[150px]">검토부서</TableHead>
                  )}
                  {/* 검토자 - Admin만 */}
                  {isAdmin && (
                    <TableHead className="min-w-[120px]">검토자</TableHead>
                  )}
                  {/* Requester/Reviewer/Admin 모두 보이는 필드 */}
                  <TableHead className="min-w-[100px]">완료여부</TableHead>
                  <TableHead className="min-w-[140px]">액션</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={(isRequester || isReviewer) && !isAdmin ? 20 : 25} className="text-center py-8 text-[#67767F]">
                    요청 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => {
                  const isEditing = editingId === request.id;
                  const daysLeft = calculateDaysLeft(request.factory_shipment_date);
                  const currentData = isEditing ? { ...request, ...editingData } : request;
                  
                  // 역할별 편집 권한
                  const canEditRequester = canEditRequesterFields(request);
                  const canEditReviewer = canEditReviewerFields();
                  const canEditAdmin = canEditAdminFields();

                  // 수정 가능 여부 확인 (등록 후 1일 내)
                  const createdAt = new Date(request.created_at);
                  const now = new Date();
                  const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
                  const canEditWithinOneDay = daysSinceCreation <= 1;
                  
                  // 삭제 불가 (요청자는 삭제 불가)
                  const canDelete = false;

                  return (
                    <TableRow key={request.id}>
                      {/* 1. 구분 - 모든 역할 */}
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          request.request_type === 'existing' 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {request.request_type === 'existing' ? '기존' : request.request_type === 'new' ? '신규' : '-'}
                        </span>
                      </TableCell>
                      {/* 2. 우선순위 - 모든 역할 */}
                      <TableCell>
                        {isEditing ? (
                          <Select
                            value={currentData.priority || '일반'}
                            onValueChange={(value) => handleFieldChange('priority', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="긴급">긴급</SelectItem>
                              <SelectItem value="일반">일반</SelectItem>
                              <SelectItem value="보통">보통</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={`text-[#4B4F5A] ${request.priority === '긴급' ? 'font-bold text-red-600' : ''}`}>
                            {request.priority || '일반'}
                          </span>
                        )}
                      </TableCell>
                      {/* 3. 고객 - Admin만 */}
                      {isAdmin && (
                        <TableCell>
                          {isEditing && canEditRequester ? (
                            <Select
                              value={currentData.customer}
                              onValueChange={(value) => handleFieldChange('customer', value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {customers.map((customer) => (
                                  <SelectItem key={customer} value={customer}>
                                    {customer}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[#4B4F5A]">{request.customer}</span>
                          )}
                        </TableCell>
                      )}
                      {/* 4. 요청부서 - 모든 역할 */}
                      <TableCell>
                        {isEditing && canEditRequester ? (
                          <Select
                            value={currentData.requesting_dept}
                            onValueChange={(value) => handleFieldChange('requesting_dept', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((dept) => (
                                <SelectItem key={dept} value={dept}>
                                  {dept}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-[#4B4F5A]">{request.requesting_dept}</span>
                        )}
                      </TableCell>
                      {/* 5. 요청자 - 모든 역할 */}
                      <TableCell>
                        {isEditing && canEditRequester ? (
                          <Input
                            value={currentData.requester_name}
                            onChange={(e) => handleFieldChange('requester_name', e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-[#4B4F5A]">{request.requester_name}</span>
                        )}
                      </TableCell>
                      {/* 6. 요청일 - 모든 역할 */}
                      <TableCell>
                        <span className="text-[#4B4F5A]">{formatDate(request.request_date)}</span>
                      </TableCell>
                      {/* 7. SO번호 - 모든 역할 */}
                      <TableCell>
                        {isEditing && canEditRequester ? (
                          <Input
                            value={currentData.so_number}
                            onChange={(e) => handleFieldChange('so_number', e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          <span className="font-medium text-[#101820]">{request.so_number}</span>
                        )}
                      </TableCell>
                      {/* 8. 현재 출하일 - 모든 역할 */}
                      <TableCell>
                        {isEditing && canEditRequester ? (
                          <Input
                            type="date"
                            value={currentData.factory_shipment_date}
                            onChange={(e) => handleFieldChange('factory_shipment_date', e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-[#4B4F5A]">
                            {formatDate(request.factory_shipment_date)}
                          </span>
                        )}
                      </TableCell>
                      {/* 9. 요청구분 - 모든 역할 */}
                      <TableCell>
                        {isEditing ? (
                          <Select
                            value={currentData.category_of_request}
                            onValueChange={(value) => handleFieldChange('category_of_request', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-[#4B4F5A]">{request.category_of_request}</span>
                        )}
                      </TableCell>
                      {/* 10. 품목코드 - 모든 역할 */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={currentData.erp_code || ''}
                            onChange={(e) => handleFieldChange('erp_code', e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-[#4B4F5A]">{request.erp_code}</span>
                        )}
                      </TableCell>
                      {/* 11. 품목명 - 모든 역할 */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={currentData.item_name}
                            onChange={(e) => handleFieldChange('item_name', e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-[#4B4F5A]">{request.item_name}</span>
                        )}
                      </TableCell>
                      {/* 12. 수량 - 모든 역할 */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            value={currentData.quantity}
                            onChange={(e) => handleFieldChange('quantity', parseInt(e.target.value) || 0)}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-[#4B4F5A]">{request.quantity}</span>
                        )}
                      </TableCell>
                      {/* 13. 희망 출하일 - 모든 역할 */}
                      <TableCell>
                        {isEditing && canEditField('desired_shipment_date', request, isEditing) ? (
                          <Input
                            type="date"
                            value={currentData.desired_shipment_date || ''}
                            onChange={(e) => handleFieldChange('desired_shipment_date', e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-[#4B4F5A]">
                            {request.desired_shipment_date ? formatDate(request.desired_shipment_date) : '-'}
                          </span>
                        )}
                      </TableCell>
                      {/* 14. 확정 출하일 - 모든 역할 */}
                      <TableCell>
                        {isEditing && canEditField('confirmed_shipment_date', request, isEditing) ? (
                          <Input
                            type="date"
                            value={currentData.confirmed_shipment_date || ''}
                            onChange={(e) => handleFieldChange('confirmed_shipment_date', e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-[#4B4F5A]">
                            {request.confirmed_shipment_date ? formatDate(request.confirmed_shipment_date) : '-'}
                          </span>
                        )}
                      </TableCell>
                      {/* 15. 변경 운송방법 - 모든 역할 */}
                      <TableCell>
                        <span className="text-[#4B4F5A]">
                          {request.shipping_method || '-'}
                        </span>
                      </TableCell>
                      {/* 16. 요청사유 - 모든 역할 */}
                      <TableCell>
                        {isEditing ? (
                          <Select
                            value={currentData.reason_for_request}
                            onValueChange={(value) => handleFieldChange('reason_for_request', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {reasons.map((reason) => (
                                <SelectItem key={reason} value={reason}>
                                  {reason}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-[#4B4F5A]">{request.reason_for_request}</span>
                        )}
                      </TableCell>
                      {/* 17. 요청상세 - 모든 역할 */}
                      <TableCell>
                        {isEditing && canEditRequester ? (
                          <Textarea
                            value={currentData.request_details || ''}
                            onChange={(e) => handleFieldChange('request_details', e.target.value)}
                            className="w-full min-h-[60px]"
                          />
                        ) : (
                          <span className="text-[#4B4F5A] text-sm">
                            {request.request_details || '-'}
                          </span>
                        )}
                      </TableCell>
                      {/* 18. 리드타임 - 모든 역할 */}
                      <TableCell>
                        <span className="text-[#4B4F5A]">
                          {request.leadtime ?? daysLeft}일
                        </span>
                      </TableCell>
                      {/* 19. 진행상태 - 모든 역할 */}
                      <TableCell>
                        <span className="text-[#4B4F5A]">
                          {request.status === 'pending' ? '검토대기' :
                           request.status === 'approved' ? '승인' :
                           request.status === 'rejected' ? '반려' :
                           request.status === 'in_review' ? '검토중' :
                           request.status === 'completed' ? '완료' : '-'}
                        </span>
                      </TableCell>
                      {/* 20. 가능여부 - Admin만 */}
                      {isAdmin && (
                        <TableCell>
                          {isEditing && canEditField('feasibility', request, isEditing) ? (
                            <Select
                              value={currentData.feasibility || 'none'}
                              onValueChange={(value) => handleFieldChange('feasibility', value === 'none' ? null : value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">미검토</SelectItem>
                                {feasibilities.map((feasibility) => (
                                  <SelectItem key={feasibility} value={feasibility}>
                                    {feasibility === 'approved' ? '가능' : feasibility === 'rejected' ? '불가능' : '보류'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[#4B4F5A]">
                              {request.feasibility === 'approved'
                                ? '가능'
                                : request.feasibility === 'rejected'
                                  ? '불가능'
                                  : request.feasibility === 'pending'
                                    ? '보류'
                                    : '-'}
                            </span>
                          )}
                        </TableCell>
                      )}
                      {/* 21. 검토상세 - Admin만 */}
                      {isAdmin && (
                        <TableCell>
                          {isEditing && canEditField('review_details', request, isEditing) ? (
                            <Textarea
                              value={currentData.review_details || ''}
                              onChange={(e) => handleFieldChange('review_details', e.target.value)}
                              className="w-full min-h-[60px]"
                            />
                          ) : (
                            <span className="text-[#4B4F5A] text-sm">
                              {request.review_details || '-'}
                            </span>
                          )}
                        </TableCell>
                      )}
                      {/* 22. 검토부서 - Admin만 */}
                      {isAdmin && (
                        <TableCell>
                          {isEditing && canEditField('reviewing_dept', request, isEditing) ? (
                            <Select
                              value={currentData.reviewing_dept || ''}
                              onValueChange={(value) => handleFieldChange('reviewing_dept', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments.map((dept) => (
                                  <SelectItem key={dept} value={dept}>
                                    {dept}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[#4B4F5A]">{request.reviewing_dept || '-'}</span>
                          )}
                        </TableCell>
                      )}
                      {/* 23. 검토자 - Admin만 */}
                      {isAdmin && (
                        <TableCell>
                          {isEditing && canEditField('reviewer_name', request, isEditing) ? (
                            <Input
                              value={currentData.reviewer_name || ''}
                              onChange={(e) => handleFieldChange('reviewer_name', e.target.value)}
                              className="w-full"
                            />
                          ) : (
                            <span className="text-[#4B4F5A]">{request.reviewer_name || '-'}</span>
                          )}
                        </TableCell>
                      )}
                      {/* 24. 완료여부 - 모든 역할 */}
                      <TableCell>
                        {isEditing && canEditField('completed', request, isEditing) ? (
                          <Checkbox
                            checked={currentData.completed || false}
                            onCheckedChange={(checked) => handleFieldChange('completed', checked)}
                          />
                        ) : (
                          <Checkbox checked={request.completed} disabled />
                        )}
                      </TableCell>
                      {/* 25. 액션 - 모든 역할 */}
                      <TableCell>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleSaveEdit}
                              className="h-8 w-8 p-0"
                            >
                              <Save className="h-4 w-4 text-[#971B2F]" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null);
                                setEditingData({});
                                if (onCancel) {
                                  onCancel(request.id);
                                }
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4 text-[#67767F]" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(request.id)}
                              disabled={
                                request.status !== 'pending' || 
                                request.requester_id !== user?.id ||
                                !canEditWithinOneDay
                              }
                              className="h-8 w-8 p-0"
                              title={!canEditWithinOneDay ? '등록 후 1일이 지나 수정할 수 없습니다.' : ''}
                            >
                              <Edit2 className={`h-4 w-4 ${!canEditWithinOneDay ? 'text-gray-400' : 'text-[#971B2F]'}`} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(request.id)}
                              disabled={true}
                              className="h-8 w-8 p-0"
                              title="요청자는 삭제할 수 없습니다."
                            >
                              <Trash2 className="h-4 w-4 text-gray-400" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
