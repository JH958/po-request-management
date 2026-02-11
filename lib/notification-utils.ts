/**
 * 알람 및 이메일 전송 유틸리티 함수
 */
import { createClient } from './supabase/client';

/**
 * 모든 사용자에게 알람 전송
 */
export async function sendNotificationToAll(
  subject: string,
  message: string,
  requestId?: string,
  linkUrl?: string
) {
  try {
    const supabase = createClient();

    // 모든 사용자 조회 (이메일 포함)
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, full_name');

    if (usersError) {
      console.error('사용자 목록 조회 오류:', usersError);
      return;
    }

    if (!users || users.length === 0) {
      console.warn('알람을 받을 사용자가 없습니다.');
      return;
    }

    // Supabase Edge Function 호출하여 이메일 전송
    // Edge Function에서 사용자 이메일을 가져오도록 함
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const requestLink = linkUrl || `${appUrl}/requests/${requestId || ''}`;

    // Edge Function 호출 시도 (실패해도 조용히 처리)
    try {
      // Edge Function이 배포되어 있는지 확인 후 호출
      const { data, error: functionError } = await supabase.functions.invoke('send-email-notification', {
        body: {
          subject,
          message,
          requestId,
          requestLink,
          // 사용자 ID 목록만 전달 (Edge Function에서 이메일 조회)
          userIds: users.map(u => u.id),
        },
      }).catch((err) => {
        // Edge Function이 없거나 호출 실패 시 null 반환
        console.warn('Edge Function 호출 실패 (무시됨):', err.message);
        return { data: null, error: err };
      });

      if (functionError) {
        // 에러를 콘솔에만 로깅하고 계속 진행
        console.warn('이메일 전송 함수 오류 (무시됨):', functionError);
        console.log('이메일 알람 (콘솔):', {
          subject,
          message,
          requestId,
          requestLink,
          recipients: users.length,
        });
      } else if (data) {
        console.log('이메일 알람 전송 완료:', data);
      }
    } catch (invokeError: any) {
      // Edge Function이 없거나 오류가 발생하면 콘솔에만 로깅
      // 에러를 던지지 않아서 요청 생성은 계속 진행됨
      console.warn('이메일 알람 (Edge Function 미설정 - 콘솔에만 로깅):', {
        subject,
        message,
        requestId,
        requestLink,
        recipients: users.map(u => u.full_name).join(', '),
        error: invokeError?.message || 'Unknown error',
      });
    }
  } catch (error) {
    console.error('알람 전송 오류:', error);
    // 에러가 발생해도 요청 생성은 계속 진행되도록 에러를 던지지 않음
  }
}

/**
 * 긴급 요청 알람 전송
 */
export async function sendUrgentRequestNotification(
  requestId: string,
  soNumber: string,
  customer: string,
  requesterName: string
) {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const requestLink = `${appUrl}/requests/${requestId}`;
  
  // 각 사용자별로 개인화된 메시지 생성
  const subject = '[긴급] 새로운 긴급 PO 변경 요청';
  const baseMessage = (userName: string) => `
${userName} 님 안녕하세요.

PO 변경 요청 건이 접수되었습니다.

- 요청자: ${requesterName}
- 고객: ${customer}
- SO 번호: ${soNumber}
- 우선순위: 긴급

아래 링크로 접속하시어 내역 확인 및 검토 부탁드립니다.
${requestLink}

즉시 검토가 필요합니다.
  `;

  await sendNotificationToAll(subject, baseMessage, requestId, requestLink);
}

/**
 * 신규 요청 알람 전송
 */
export async function sendNewRequestNotification(
  requestId: string,
  soNumber: string,
  customer: string,
  requesterName: string,
  priority: string
) {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const requestLink = `${appUrl}/requests/${requestId}`;
  
  const subject = '[알림] 새로운 PO 변경 요청';
  const baseMessage = (userName: string) => `
${userName} 님 안녕하세요.

PO 변경 요청 건이 접수되었습니다.

- 요청자: ${requesterName}
- 고객: ${customer}
${soNumber ? `- SO 번호: ${soNumber}` : ''}
- 우선순위: ${priority}

아래 링크로 접속하시어 내역 확인 및 검토 부탁드립니다.
${requestLink}
  `;

  await sendNotificationToAll(subject, baseMessage, requestId, requestLink);
}

/**
 * 검토 대기 알람 (스케줄러에서 호출)
 * 이 함수는 Supabase Edge Functions 또는 외부 스케줄러에서 호출되어야 합니다.
 */
export async function sendPendingReviewReminder() {
  try {
    const supabase = createClient();

    // 검토 대기 중인 요청 조회
    const { data: pendingRequests, error } = await supabase
      .from('requests')
      .select('id, so_number, customer, requester_name, created_at, priority')
      .eq('status', 'pending')
      .is('deleted_at', null);

    if (error) {
      console.error('검토 대기 요청 조회 오류:', error);
      return;
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      return;
    }

    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const subject = '[알림] 검토 대기 중인 PO 변경 요청';
    const baseMessage = (userName: string) => `
${userName} 님 안녕하세요.

PO 변경 요청 건이 아직 검토 대기 상태로 남아 있습니다.

현재 ${pendingRequests.length}건의 요청이 검토 대기 중입니다.

${pendingRequests.slice(0, 5).map((req, idx) => `
${idx + 1}. ${req.so_number ? `SO: ${req.so_number} | ` : ''}고객: ${req.customer} | 요청자: ${req.requester_name}${req.priority === '긴급' ? ' | [긴급]' : ''}
`).join('')}
${pendingRequests.length > 5 ? `... 외 ${pendingRequests.length - 5}건` : ''}

아래 링크로 접속하시어 내역 확인 및 검토 부탁드립니다.
${appUrl}

검토를 완료해주세요.
    `;

    await sendNotificationToAll(subject, baseMessage);
  } catch (error) {
    console.error('검토 대기 알람 전송 오류:', error);
  }
}
