-- requests 테이블에 product_category 컬럼 추가
-- 품목 구분: InBody, BSM, BPBIO, Wellness, Spare parts, ALL (담당 부서 구분용)

-- Step 1: 컬럼 추가
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS product_category VARCHAR(50);

-- Step 2: 컬럼 설명 추가
COMMENT ON COLUMN requests.product_category 
IS '품목 구분: InBody, BSM, BPBIO, Wellness, Spare parts, ALL (담당 부서 구분용)';

-- Step 3: 추가 확인
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'requests' AND column_name = 'product_category';

-- Step 4: 알림 트리거 함수 업데이트 (품목 구분 정보 포함)
CREATE OR REPLACE FUNCTION create_notification_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  requester_id UUID;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  IF NEW.status IN ('approved', 'rejected') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    -- 요청자의 user_id 가져오기
    SELECT id INTO requester_id
    FROM user_profiles
    WHERE department = NEW.requesting_dept
    LIMIT 1;
    
    IF requester_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- 알림 제목과 메시지 설정
    IF NEW.status = 'approved' THEN
      notification_title := '요청이 승인되었습니다';
      notification_message := 'SO 번호 ' || COALESCE(NEW.so_number, '(신규)') || '의 요청이 승인되었습니다.';
      
      -- 품목 구분 정보 추가
      IF NEW.product_category IS NOT NULL THEN
        notification_message := notification_message || ' [품목구분: ' || NEW.product_category || ']';
      END IF;
      
      -- 확정 수량 정보 추가
      IF NEW.confirmed_quantity IS NOT NULL AND NEW.confirmed_quantity < NEW.quantity THEN
        notification_message := notification_message || ' 재고 부족으로 확정 수량 ' || 
                              NEW.confirmed_quantity || '개만 가능합니다.';
      END IF;
    ELSE
      notification_title := '요청이 반려되었습니다';
      notification_message := 'SO 번호 ' || COALESCE(NEW.so_number, '(신규)') || '의 요청이 반려되었습니다.';
      
      -- 품목 구분 정보 추가
      IF NEW.product_category IS NOT NULL THEN
        notification_message := notification_message || ' [품목구분: ' || NEW.product_category || ']';
      END IF;
      
      -- 확정 수량 정보 추가
      IF NEW.confirmed_quantity IS NOT NULL AND NEW.confirmed_quantity > 0 THEN
        notification_message := notification_message || ' 확정 수량 ' || 
                              NEW.confirmed_quantity || '개만 가능합니다.';
      END IF;
    END IF;
    
    -- 알림 생성
    INSERT INTO notifications (user_id, request_id, type, title, message)
    VALUES (requester_id, NEW.id, NEW.status, notification_title, notification_message);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
