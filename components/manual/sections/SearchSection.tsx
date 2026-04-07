/**
 * 매뉴얼: 검색·필터 탭 콘텐츠
 */
import { ManualImage } from '@/components/manual/ManualImage';

export const SearchSection = () => {
  return (
    <div className="space-y-6 py-2" role="region" aria-label="검색 및 필터 안내">
      <ManualImage src="/manual/photo8.png" alt="요청 접수 내역 검색·필터 예시" />

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">검색</h3>
        <p className="text-sm text-[#4B4F5A]">
          검색창에 <strong className="text-[#101820]">SO 번호</strong>, <strong className="text-[#101820]">고객명</strong>,{' '}
          <strong className="text-[#101820]">품목명</strong> 등 일부만 입력해도 목록이 필터됩니다.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">필터</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-[#4B4F5A]">
          <li>상태별(검토 대기, 승인, 반려 등)로 좁혀 볼 수 있습니다.</li>
          <li>요청 구분·고객·기간 등 화면에 제공되는 조건을 조합해 활용하세요.</li>
        </ul>
      </div>
    </div>
  );
};
