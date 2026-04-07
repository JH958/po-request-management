/**
 * 매뉴얼: Excel 다운로드 탭 콘텐츠
 */
import { ManualImage } from '@/components/manual/ManualImage';

export const ExcelSection = () => {
  return (
    <div className="space-y-6 py-2" role="region" aria-label="Excel 다운로드 안내">
      <ManualImage src="/manual/photo12.png" alt="Excel 다운로드 화면 예시" />

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">다운로드 항목</h3>
        <p className="text-sm text-[#4B4F5A]">
          관리자 화면에서 현재 검색·필터 조건에 맞는 요청 목록을 Excel 파일로 저장할 수 있습니다. 파일에는 SO
          번호, 고객, 요청 구분, 상태, 품목 정보 등 표에 보이는 주요 컬럼이 포함됩니다.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-[#E5E7EB] bg-[#F8F9FA] p-4">
        <p className="text-sm font-medium text-[#101820]">활용 팁</p>
        <ul className="list-inside list-disc space-y-1 text-xs text-[#67767F]">
          <li>먼저 기간·상태·고객 등으로 범위를 좁힌 뒤 다운로드하면 보고서 작성에 유리합니다.</li>
          <li>파일명에 날짜가 포함되어 있어 이력 관리가 쉽습니다.</li>
        </ul>
      </div>
    </div>
  );
};
