/**
 * 매뉴얼: 알림 확인 탭 콘텐츠
 */
import { Bell, CheckCircle2, XCircle } from 'lucide-react';
import { ManualImage } from '@/components/manual/ManualImage';

export const NotificationSection = () => {
  return (
    <div className="space-y-6 py-2" role="region" aria-label="알림 안내">
      <ManualImage src="/manual/photo1.png" alt="헤더 알림 아이콘 위치 예시" />

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-[#971B2F]">
          <Bell className="h-5 w-5 shrink-0" aria-hidden />
          알림 아이콘
        </h3>
        <p className="text-sm text-[#4B4F5A]">
          헤더 오른쪽 종 모양 아이콘을 누르면 최근 알림 목록이 열립니다. 읽지 않은 알림이 있으면 빨간 뱃지로
          개수가 표시됩니다.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-[#101820]">알림 유형</p>
        <ul className="space-y-2 text-sm text-[#4B4F5A]">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
            승인 완료 알림
          </li>
          <li className="flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
            반려 알림
          </li>
        </ul>
        <p className="text-xs text-[#67767F]">
          항목을 클릭하면 읽음 처리되며, 상세 내용을 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
};
