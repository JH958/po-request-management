/**
 * 매뉴얼 스크린샷 영역 (public/manual 이미지용)
 */
import Image from 'next/image';

interface ManualImageProps {
  src: string;
  alt: string;
}

export const ManualImage = ({ src, alt }: ManualImageProps) => {
  return (
    <figure className="mx-auto w-full max-w-[800px]">
      <Image
        src={src}
        alt={alt}
        width={800}
        height={600}
        style={{ width: '100%', height: 'auto' }}
        className="rounded-lg border border-[#E5E7EB] shadow-lg"
        sizes="(max-width: 800px) 100vw, 800px"
        unoptimized
      />
    </figure>
  );
};
