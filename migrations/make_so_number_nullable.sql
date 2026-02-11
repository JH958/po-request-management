-- ============================================
-- 데이터베이스 마이그레이션: so_number를 nullable로 변경
-- ============================================
-- 생성일: 2026-01-15
-- 설명: 신규 PO 추가 시 SO 번호가 없어도 되도록 so_number를 nullable로 변경
-- ============================================

-- 1. 기존 NOT NULL 제약 조건 제거
ALTER TABLE public.requests 
ALTER COLUMN so_number DROP NOT NULL;

-- 2. 코멘트 업데이트
COMMENT ON COLUMN public.requests.so_number IS 'SO 번호 (기존 PO 수정 시 필수, 신규 PO 추가 시 선택)';

-- 3. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE 'so_number 컬럼이 nullable로 변경되었습니다!';
END $$;
