/**
 * 매뉴얼: 검토 기능 탭 콘텐츠
 */
import { ManualImage } from '@/components/manual/ManualImage';

export const ReviewSection = () => {
  return (
    <div className="space-y-8 py-2" role="region" aria-label="검토 기능 안내">
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">검토 대기</h3>
        <ManualImage src="/manual/photo4.png" alt="검토 대기 카드 예시" />
        <p className="text-sm text-[#4B4F5A]">
          대기 중인 요청 카드를 선택하면 상세 내용을 확인하고 승인·반려 절차를 진행할 수 있습니다.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">승인 처리</h3>
        <ManualImage src="/manual/photo5.png" alt="요청 상세·승인 화면 예시" />
        <ManualImage src="/manual/photo6.png" alt="승인 사유·확정 수량 입력 예시" />
        <p className="text-sm text-[#4B4F5A]">
          재고 등 사유로 수량 조정이 필요하면 <strong className="text-[#101820]">확정 수량</strong>을 입력한 뒤
          승인합니다. 검토 내용(사유)은 요청자에게 전달됩니다.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">반려 처리</h3>
        <ManualImage src="/manual/photo7.png" alt="반려 사유 입력 예시" />
        <p className="text-sm text-[#4B4F5A]">
          반려 시 사유를 명확히 입력하면 요청자가 재접수·소통할 때 도움이 됩니다.
        </p>
      </section>
    </div>
  );
};
