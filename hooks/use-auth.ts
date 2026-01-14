/**
 * 인증 상태 관리 훅 - 단순화 버전
 */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  full_name: string;
  department: string;
  role: 'requester' | 'reviewer' | 'admin';
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
 * 인증 상태를 관리하는 커스텀 훅
 */
export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    
    // 초기 세션 확인
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
        setLoading(false);
      } catch (error) {
        console.error('세션 확인 오류:', error);
        setLoading(false);
      }
    };

    checkSession();

    // 인증 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setProfile(null); // 프로필 초기화
    });

    return () => {
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

  return {
    user,
    profile,
    loading,
    isRequester: profile?.role === 'requester',
    isReviewer: profile?.role === 'reviewer',
    isAdmin: profile?.role === 'admin',
  };
};
