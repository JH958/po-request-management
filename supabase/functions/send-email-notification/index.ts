// Supabase Edge Function: 이메일 알람 전송
// 사용자에게 PO 변경 요청 관련 이메일 알람을 발송합니다.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRecipient {
  name: string;
  email: string;
}

interface EmailRequest {
  subject: string;
  message: string | ((userName: string) => string);
  requestId?: string;
  requestLink?: string;
  recipients?: EmailRecipient[];
  userIds?: string[]; // 사용자 ID 목록 (이메일 조회용)
}

serve(async (req) => {
  // CORS preflight 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { subject, message, requestId, requestLink, recipients, userIds }: EmailRequest = await req.json();

    let finalRecipients: EmailRecipient[] = [];

    // recipients가 제공된 경우 사용, 아니면 userIds로 조회
    if (recipients && recipients.length > 0) {
      finalRecipients = recipients;
    } else if (userIds && userIds.length > 0) {
      // user_profiles에서 사용자 정보 조회
      const { data: userProfiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profileError) {
        throw profileError;
      }

      // 각 사용자의 이메일 주소 가져오기
      for (const userProfile of userProfiles || []) {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(userProfile.id);
          if (authUser?.user?.email) {
            finalRecipients.push({
              name: userProfile.full_name,
              email: authUser.user.email,
            });
          }
        } catch (err) {
          console.warn(`사용자 ${userProfile.id}의 이메일을 가져올 수 없습니다:`, err);
        }
      }
    }

    if (finalRecipients.length === 0) {
      return new Response(
        JSON.stringify({ error: '수신자가 없습니다.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // 이메일 발송 로직
    const emailResults = [];
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'noreply@yourcompany.com';
    const fromName = Deno.env.get('FROM_NAME') || 'PO 요청 관리 시스템';

    if (!resendApiKey) {
      console.warn('RESEND_API_KEY가 설정되지 않았습니다. 이메일이 발송되지 않습니다.');
      return new Response(
        JSON.stringify({ 
          error: '이메일 서비스가 설정되지 않았습니다. RESEND_API_KEY를 설정해주세요.',
          recipients: finalRecipients.length 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    for (const recipient of finalRecipients) {
      try {
        // 메시지가 함수인 경우 사용자 이름으로 개인화
        const personalizedMessage = typeof message === 'function' 
          ? message(recipient.name)
          : message;

        // HTML 형식으로 변환 (줄바꿈 처리)
        const htmlMessage = personalizedMessage
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => `<p>${line.replace(/\s+/g, ' ')}</p>`)
          .join('');

        // Resend API를 사용하여 이메일 발송
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: [recipient.email],
            subject: subject,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background-color: #971B2F; color: white; padding: 20px; text-align: center; }
                  .content { padding: 20px; background-color: #f9f9f9; }
                  .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
                  .button { display: inline-block; padding: 10px 20px; background-color: #971B2F; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
                  a { color: #971B2F; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>PO 요청 관리 시스템</h1>
                  </div>
                  <div class="content">
                    ${htmlMessage}
                    ${requestLink ? `<p><a href="${requestLink}" class="button">요청 내역 확인하기</a></p>` : ''}
                  </div>
                  <div class="footer">
                    <p>이 이메일은 PO 요청 관리 시스템에서 자동으로 발송되었습니다.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
            text: personalizedMessage, // 텍스트 버전도 포함
          }),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(`Resend API 오류: ${errorData.message || emailResponse.statusText}`);
        }

        const emailData = await emailResponse.json();
        console.log(`이메일 전송 성공:`, {
          to: recipient.email,
          name: recipient.name,
          id: emailData.id,
        });

        emailResults.push({ 
          recipient: recipient.email, 
          status: 'sent',
          success: true,
          emailId: emailData.id
        });
      } catch (emailError: any) {
        console.error(`이메일 전송 실패 (${recipient.email}):`, emailError);
        emailResults.push({ 
          recipient: recipient.email, 
          status: 'error',
          success: false,
          error: emailError?.message || 'Unknown error'
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: '이메일 알람 전송 완료',
        totalRecipients: finalRecipients.length,
        results: emailResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('이메일 알람 전송 오류:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
