/**
 * 매뉴얼: 요청 기능 탭 콘텐츠
 */
import { ManualImage } from '@/components/manual/ManualImage';

export const RequestSection = () => {
  return (
    <div className="space-y-8 py-2" role="region" aria-label="요청 기능 안내">
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">PO 수정 요청</h3>
        <ManualImage src="/manual/photo2.png" alt="PO 수정 요청 폼 예시" />
        <ul className="list-inside list-disc space-y-1 text-sm text-[#4B4F5A]">
          <li>SO 번호, 고객, 요청 구분, 품목·수량 등 필수 항목을 입력합니다.</li>
          <li>요청 구분에 따라 품목 목록 입력란이 달라질 수 있습니다.</li>
          <li>실시간 형식 검증(SO 번호, ERP 품목코드 등)에 맞춰 입력해 주세요.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">PO 추가 요청</h3>
        <ManualImage src="/manual/photo3.png" alt="PO 추가 요청 폼 예시" />
        <p className="text-sm text-[#4B4F5A]">
          <strong className="text-[#101820]">품목 구분</strong>은 담당 부서 배정과 알림에 반영됩니다. 해당하는
          요청 구분에서는 반드시 선택(복수 선택 가능)해 주세요.
        </p>
      </section>
    </div>
  );
};
