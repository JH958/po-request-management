/**
 * 요청 접수 준비 중 안내 — 관리자 설정에서 요청 메뉴가 꺼져 있을 때 요청접수·검토대기 화면 대신 보여 줌
 */
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';

export const RequestMenuClosed = ({ showPoChangesLink }: { showPoChangesLink: boolean }) => {
  const { t } = useLanguage();
  return (
    <div className="mx-auto max-w-lg rounded-lg border bg-white px-6 py-12 text-center">
      <h1 className="text-lg font-semibold text-[#172132]">{t('요청 접수 준비 중입니다', 'Request intake is not open yet')}</h1>
      <p className="mt-2 text-sm text-[#5A6778]">
        {t(
          'PO 변경 요청 접수는 아직 PO Tracker에서 시작하지 않았습니다. 시작하면 이 화면에서 요청을 등록하고 검토할 수 있습니다.',
          'PO change requests are not taken in PO Tracker yet. Once intake opens, you can submit and review requests here.'
        )}
      </p>
      {showPoChangesLink ? (
        <Button asChild className="mt-6 bg-[#8B1538] hover:bg-[#74112F]">
          <Link href="/po-changes">{t('PO 변경으로 이동', 'Go to PO Changes')}</Link>
        </Button>
      ) : null}
    </div>
  );
};
