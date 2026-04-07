/**
 * 매뉴얼: 메인 페이지 탭 콘텐츠
 */
import { LayoutGrid, Database, Globe, Bell } from 'lucide-react';
import { ManualImage } from '@/components/manual/ManualImage';

export const MainPageSection = () => {
  return (
    <div className="space-y-6 py-2" role="region" aria-label="메인 페이지 안내">
      <ManualImage src="/manual/photo1.png" alt="메인 페이지 화면 예시" />

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-[#971B2F]">
          <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden />
          요약 카드 영역
        </h3>
        <p className="text-sm text-[#67767F]">
          상단 카드에서 전체·검토 대기·승인·반려 건수를 한눈에 확인할 수 있습니다.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { title: '전체 요청', desc: '접수된 전체 건수' },
            { title: '검토 대기', desc: '아직 처리되지 않은 건' },
            { title: '승인', desc: '승인 완료된 건' },
            { title: '반려', desc: '반려된 건' },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-md border border-[#E5E7EB] bg-[#F8F9FA] p-3"
            >
              <p className="text-sm font-medium text-[#101820]">{card.title}</p>
              <p className="mt-1 text-xs text-[#67767F]">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">상단 헤더 아이콘</h3>
        <ul className="space-y-2 text-sm text-[#4B4F5A]">
          <li className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-[#67767F]" aria-hidden />
            <span>
              <strong className="text-[#971B2F]">D365</strong> — ERP(Dynamics 365) 바로가기
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Globe className="mt-0.5 h-5 w-5 shrink-0 text-[#67767F]" aria-hidden />
            <span>
              <strong className="text-[#971B2F]">GM</strong> — 해외 발주(GM) 사이트 바로가기
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[#67767F]" aria-hidden />
            <span>
              <strong className="text-[#971B2F]">알림</strong> — 승인·반려 알림 확인, 읽지 않은 건수 뱃지 표시
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};
