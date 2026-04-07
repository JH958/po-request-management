/**
 * 매뉴얼: 관리자 대시보드 탭 콘텐츠
 */
import { ManualImage } from '@/components/manual/ManualImage';

export const DashboardSection = () => {
  return (
    <div className="space-y-6 py-2" role="region" aria-label="대시보드 안내">
      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">관리자 인증</h3>
        <ManualImage src="/manual/photo9.png" alt="관리자 인증 화면 예시" />
        <p className="text-sm text-[#4B4F5A]">
          관리자 페이지에 접근하려면 비밀번호를 입력해 인증합니다.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">관리자 대시보드</h3>
        <ManualImage src="/manual/photo10.png" alt="관리자 대시보드 예시" />
        <ManualImage src="/manual/photo11.png" alt="차트 분석 예시" />
      </section>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">필터</h3>
        <p className="text-sm text-[#4B4F5A]">
          고객처/본사 구분, 기간(일/주/월) 등으로 범위를 지정하면 차트와 집계가 해당 조건에 맞게 갱신됩니다.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-[#971B2F]">차트 활용</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-[#4B4F5A]">
          <li>고객·부서별 요청 건수, 요청 구분·사유별 분포를 확인할 수 있습니다.</li>
          <li>승인/반려/대기 비율을 도넛 차트로 파악할 수 있습니다.</li>
          <li>데이터가 없을 때는 안내 문구가 표시됩니다.</li>
        </ul>
      </div>
    </div>
  );
};
