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
  onAdd?: () => void;
  onSave?: (request: PORequest) => void;
  onCancel?: (id: string) => void;
  onDelete?: (id: string) => void;
}

/**
 * Mock 데이터 - 드롭다운 옵션
 */
const customers = ['ABC Corp', 'XYZ Inc', 'DEF Ltd', 'GHI Co', 'JKL Inc'];
const departments = ['영업팀', '생산팀', '품질팀', '물류팀', '구매팀'];
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
  
  // 현재 사용자의 역할
  const userRole = profile?.role || 'requester';
  
  /**
   * 역할별 필드 편집 가능 여부 확인
   */
  const canEditRequesterFields = (request: PORequest) => {
    // 요청자: 자신의 요청이고 pending 상태일 때만 편집 가능
    return userRole === 'requester' && request.requester_id === user?.id && request.status === 'pending';
  };
  
  const canEditReviewerFields = () => {
    // 검토자 및 관리자: 검토 필드 편집 가능
    return userRole === 'reviewer' || userRole === 'admin';
  };
  
  const canEditAdminFields = () => {
    // 관리자: 완료여부 편집 가능
    return userRole === 'admin';
  };

  /**
   * 새 행 추가 핸들러
   */
  const handleAdd = () => {
    if (onAdd) {
      onAdd();
    } else {
      // 임시: 새 행 추가 로직
      console.log('Add new row');
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
          <Button
            onClick={handleAdd}
            className="bg-[#971B2F] hover:bg-[#7A1626] text-white"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            추가
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">고객</TableHead>
                <TableHead className="min-w-[150px]">요청부서</TableHead>
                <TableHead className="min-w-[120px]">요청자</TableHead>
                <TableHead className="min-w-[180px]">SO번호</TableHead>
                <TableHead className="min-w-[150px]">출하일</TableHead>
                <TableHead className="min-w-[150px]">요청일</TableHead>
                <TableHead className="min-w-[100px]">리드타임</TableHead>
                <TableHead className="min-w-[150px]">요청구분</TableHead>
                <TableHead className="min-w-[100px]">우선순위</TableHead>
                <TableHead className="min-w-[180px]">품목코드</TableHead>
                <TableHead className="min-w-[220px]">품목명</TableHead>
                <TableHead className="min-w-[100px]">수량</TableHead>
                <TableHead className="min-w-[150px]">요청사유</TableHead>
                <TableHead className="min-w-[300px]">요청상세</TableHead>
                <TableHead className="min-w-[120px]">가능여부</TableHead>
                <TableHead className="min-w-[300px]">검토상세</TableHead>
                <TableHead className="min-w-[150px]">검토부서</TableHead>
                <TableHead className="min-w-[120px]">검토자</TableHead>
                <TableHead className="min-w-[100px]">완료여부</TableHead>
                <TableHead className="min-w-[140px]">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={20} className="text-center py-8 text-[#67767F]">
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

                  return (
                    <TableRow key={request.id}>
                      <TableCell>
                        {isEditing && canEditRequester ? (
                          <Select defaultValue={request.customer}>
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
                      <TableCell>
                        <span className="text-[#4B4F5A]">{formatDate(request.request_date)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[#4B4F5A]">
                          {request.leadtime ?? daysLeft}일
                        </span>
                      </TableCell>
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
                      <TableCell>
                        {isEditing && canEditReviewer ? (
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
                      <TableCell>
                        {isEditing && canEditReviewer ? (
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
                      <TableCell>
                        {isEditing && canEditReviewer ? (
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
                      <TableCell>
                        {isEditing && canEditReviewer ? (
                          <Input
                            value={currentData.reviewer_name || ''}
                            onChange={(e) => handleFieldChange('reviewer_name', e.target.value)}
                            className="w-full"
                          />
                        ) : (
                          <span className="text-[#4B4F5A]">{request.reviewer_name || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing && canEditAdmin ? (
                          <Checkbox
                            checked={currentData.completed || false}
                            onCheckedChange={(checked) => handleFieldChange('completed', checked)}
                          />
                        ) : (
                          <Checkbox checked={request.completed} disabled />
                        )}
                      </TableCell>
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
                              disabled={request.status !== 'pending' || request.requester_id !== user?.id}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4 text-[#971B2F]" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(request.id)}
                              disabled={request.status !== 'pending' || request.requester_id !== user?.id}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4 text-[#971B2F]" />
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
      </CardContent>
    </Card>
  );
};
