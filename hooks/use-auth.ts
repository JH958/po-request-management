/**
 * 인증 상태 관리 훅 - Refresh Token 오류 처리 강화 버전
 */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  full_name: string;
  department: string;
  role: string; // 콤마로 구분된 역할들 (예: "reviewer,requester" 또는 "admin")
  created_at: string;
  updated_at: string;
}

interface UseAuthReturn {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isRequester: boolean;
  isReviewer: boolean;
  isAdmin: boolean;
}

/**
 * 브라우저에 저장된 Supabase 세션 관련 데이터를 모두 정리
 * 만료된/유효하지 않은 토큰이 남아있을 때 사용
 */
const clearSupabaseSessionData = () => {
  try {
    // localStorage에서 Supabase 관련 항목 삭제
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // 쿠키에서 Supabase 관련 쿠키 삭제
    document.cookie.split(';').forEach((cookie) => {
      const cookieName = cookie.split('=')[0].trim();
      if (cookieName.startsWith('sb-')) {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('🧹 Supabase 세션 데이터 정리 완료');
    }
  } catch (error) {
    console.warn('세션 데이터 정리 중 오류:', error);
  }
};

/**
 * 인증 상태를 관리하는 커스텀 훅
 */
export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    
    // 초기 세션 확인
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        // Refresh Token 관련 오류 처리
        if (error) {
          console.warn('세션 확인 오류 - 세션 정리 및 로그아웃 처리:', error.message);
          // 만료/유효하지 않은 토큰인 경우 브라우저 저장소까지 정리
          clearSupabaseSessionData();
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // signOut 실패 시 무시 (이미 세션 데이터를 수동으로 정리했으므로)
          }
          if (mounted) {
            setUser(null);
            setProfile(null);
            setLoading(false);
          }
          return;
        }
        
        if (mounted) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } catch (error) {
        console.error('세션 확인 오류:', error);
        // 예외 발생 시에도 세션 정리
        clearSupabaseSessionData();
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // signOut 실패 시 무시
        }
        if (mounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    };

    checkSession();

    // 인증 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // TOKEN_REFRESHED 실패 또는 SIGNED_OUT 이벤트 처리
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('토큰 갱신 실패 - 세션 정리 및 로그아웃 처리');
        clearSupabaseSessionData();
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // signOut 실패 시 무시
        }
        if (mounted) {
          setUser(null);
          setProfile(null);
        }
        return;
      }
      
      if (mounted) {
        setUser(session?.user ?? null);
        if (!session?.user) {
          setProfile(null);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 프로필 조회는 별도로 처리 (user가 있을 때만)
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const supabase = createClient();
    
    const fetchProfile = async () => {
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (data) {
          setProfile(data as UserProfile);
        }
      } catch (error) {
        // 프로필이 없어도 계속 진행
        console.warn('프로필 조회 실패:', error);
      }
    };

    fetchProfile();
  }, [user]);

  // 역할 체크 헬퍼 함수
  const hasRole = (role: string): boolean => {
    if (!profile?.role) return false;
    // 콤마로 구분된 역할들을 체크
    const roles = profile.role.split(',').map(r => r.trim());
    return roles.includes(role);
  };

  return {
    user,
    profile,
    loading,
    isRequester: hasRole('requester') || user?.email === 'jhee105@inbody.com',
    isReviewer: hasRole('reviewer') || hasRole('admin') || user?.email === 'jhee105@inbody.com',
    isAdmin: hasRole('admin'),
  };
};
