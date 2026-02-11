// Supabase Edge Function: 스케줄 알람
// 매일 오전 10시, 오후 5시에 실행되어 검토 대기 중인 요청에 대한 알람을 전송합니다.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // CORS preflight 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 검토 대기 중인 요청 조회
    const { data: pendingRequests, error } = await supabase
      .from('requests')
      .select('id, so_number, customer, requester_name, created_at, priority')
      .eq('status', 'pending')
      .is('deleted_at', null);

    if (error) {
      throw error;
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      return new Response(
        JSON.stringify({ message: '검토 대기 중인 요청이 없습니다.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // 모든 사용자 조회 (알람을 받을 대상)
    const { data: userProfiles, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, full_name');

    if (usersError) {
      throw usersError;
    }

    if (!userProfiles || userProfiles.length === 0) {
      return new Response(
        JSON.stringify({ message: '알람을 받을 사용자가 없습니다.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // 각 사용자의 이메일 주소 가져오기
    const recipients: Array<{ name: string; email: string }> = [];
    for (const userProfile of userProfiles) {
      try {
        // auth.users에서 이메일 조회
        const { data: authUser } = await supabase.auth.admin.getUserById(userProfile.id);
        if (authUser?.user?.email) {
          recipients.push({
            name: userProfile.full_name,
            email: authUser.user.email,
          });
        }
      } catch (err) {
        console.warn(`사용자 ${userProfile.id}의 이메일을 가져올 수 없습니다:`, err);
      }
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ message: '이메일 주소를 가진 사용자가 없습니다.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:3000';
    const subject = '[알림] 검토 대기 중인 PO 변경 요청';
    
    // 개인화된 메시지 생성 함수
    const createMessage = (userName: string) => `
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

    // 이메일 발송 함수 호출
    try {
      const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-email-notification', {
        body: {
          subject,
          message: createMessage,
          requestLink: appUrl,
          recipients,
        },
      });

      if (emailError) {
        console.error('이메일 발송 함수 오류:', emailError);
      } else {
        console.log('이메일 알람 전송 완료:', emailResult);
      }
    } catch (invokeError) {
      console.error('이메일 발송 함수 호출 오류:', invokeError);
    }

    return new Response(
      JSON.stringify({
        message: '알람이 전송되었습니다.',
        pendingCount: pendingRequests.length,
        recipientCount: users?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('알람 전송 오류:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
