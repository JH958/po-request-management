/**
 * 영업관리팀 계정 — 부서가 영업관리팀인 계정의 권한 상태, 고객처 담당자 표에 없는 인원 승인·해제 (관리자 전용)
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/context/LanguageContext';
import { fetchSalesAccessList, setSalesAccess, type SalesAccessRow } from '@/lib/sales-access-api';

export const SalesAccessSettings = () => {
  const { t } = useLanguage();
  const [rows, setRows] = useState<SalesAccessRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchSalesAccessList());
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('영업관리팀 계정 조회 실패:', error);
      }
      toast.error(error instanceof Error ? error.message : t('목록을 불러오지 못했습니다.', 'Could not load the list.'));
      setRows([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSet = async (row: SalesAccessRow, approved: boolean) => {
    try {
      setBusy(row.user_id);
      await setSalesAccess(row.user_id, approved);
      toast.success(approved ? t(`${row.full_name} 님을 승인했습니다.`, `Approved ${row.full_name}.`) : t(`${row.full_name} 님의 승인을 해제했습니다.`, `Revoked ${row.full_name}.`));
      await load();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('영업관리팀 승인 저장 실패:', error);
      }
      toast.error(error instanceof Error ? error.message : t('저장하지 못했습니다.', 'Could not save.'));
    } finally {
      setBusy(null);
    }
  };

  if (!rows) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const waiting = rows.filter((r) => !r.has_access).length;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-[#5A6778]">
        {t(
          '부서를 영업관리팀으로 가입해도, 로그인 메일이 고객처 담당자 표에 있거나 여기서 승인해야 PO 변경·PO 현황을 쓸 수 있습니다. 담당자 표에 없는 팀원(예: 담당 고객처가 없는 인원)만 승인하면 됩니다.',
          'Signing up as Sales Admin is not enough: the login email must be in the customer owner list or approved here before PO Changes and PO Status open. Approve only team members not in the owner list.'
        )}
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white py-12 text-center text-sm text-[#5A6778]">
          {t('영업관리팀으로 가입한 계정이 없습니다.', 'No accounts signed up as Sales Admin.')}
        </p>
      ) : (
        <div className="overflow-auto rounded-lg border bg-white">
          <p className="border-b px-4 py-2 text-sm text-[#253143]">
            {t(`${rows.length}명 · 승인 대기 ${waiting}명`, `${rows.length} accounts · ${waiting} waiting`)}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {[t('이름', 'Name'), t('메일', 'Email'), t('가입일', 'Signed up'), t('담당자 표', 'Owner list'), t('권한', 'Access'), ''].map((h, i) => (
                  <TableHead key={`${h}-${i}`} className="whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell className="whitespace-nowrap font-medium">{r.full_name}</TableCell>
                  <TableCell className="whitespace-nowrap text-[#5A6778]">{r.email}</TableCell>
                  <TableCell className="whitespace-nowrap text-[#5A6778]">{format(new Date(r.created_at), 'yyyy-MM-dd')}</TableCell>
                  <TableCell>{r.in_manager_list ? t('있음', 'Listed') : <span className="text-[#8E98A8]">{t('없음', 'Not listed')}</span>}</TableCell>
                  <TableCell>
                    {r.has_access ? (
                      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                        {r.approved ? t('승인됨', 'Approved') : t('사용 가능', 'Active')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{t('승인 대기', 'Waiting')}</Badge>
                    )}
                    {r.approved && r.approved_by_name ? (
                      <span className="ml-1 text-xs text-[#8E98A8]">{r.approved_by_name}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.in_manager_list ? null : r.approved ? (
                      <Button size="sm" variant="ghost" className="text-red-600" disabled={busy === r.user_id} onClick={() => void handleSet(r, false)}>
                        {t('승인 해제', 'Revoke')}
                      </Button>
                    ) : (
                      <Button size="sm" className="bg-[#8B1538] hover:bg-[#74112F]" disabled={busy === r.user_id} onClick={() => void handleSet(r, true)}>
                        {t('승인', 'Approve')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
