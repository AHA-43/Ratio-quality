// Shows a photo/video whose data may live in the device's media store or in the cloud (loaded on demand).
import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { getMedia, type Attachment } from '../data';

type Ref = Pick<Attachment, 'id' | 'data' | 'storagePath'> & { type?: string };
export function useMedia(a: Ref | undefined | null): string {
  const [src, setSrc] = useState(a?.data ?? '');
  useEffect(() => {
    if (!a) { setSrc(''); return; }
    if (a.data) { setSrc(a.data); return; }
    let live = true; setSrc('');
    getMedia(a).then(d => { if (live) setSrc(d); }).catch(() => {});
    return () => { live = false; };
  }, [a?.id, a?.data, a?.storagePath]);
  return src;
}
export function MediaImg({ att, ...rest }: { att: Ref } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const src = useMedia(att);
  return src ? <img src={src} {...rest}/> : <span className={`media-wait ${rest.className ?? ''}`} aria-busy="true"/>;
}
export function MediaVideo({ att, className }: { att: Ref; className?: string }) {
  const src = useMedia(att);
  return src ? <video className={className} src={src} controls playsInline preload="metadata"/> : <span className={`media-wait ${className ?? ''}`} aria-busy="true"/>;
}
