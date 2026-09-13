import useSettings from '@app/hooks/useSettings';
import type { ImageLoader, ImageProps } from 'next/image';
import Image from 'next/image';

const imageLoader: ImageLoader = ({ src }) => src;

export type CachedImageProps = ImageProps & {
  src: string;
  type: 'avatar' | 'tpdb';
};

/**
 * The CachedImage component should be used wherever
 * we want to offer the option to locally cache images.
 **/
const CachedImage = ({ src, type, ...props }: CachedImageProps) => {
  const { currentSettings } = useSettings();

  let imageUrl: string;

  if (type === 'tpdb') {
    // TPDB serves images from two hosts: its main CDN and its imgproxy
    // thumbnail resizer. Both route through the proxy under a sub-path.
    imageUrl =
      currentSettings.cacheImages && !src.startsWith('/')
        ? src
            .replace(
              /^https:\/\/cdn\.theporndb\.net\//,
              '/imageproxy/tpdb/cdn/'
            )
            .replace(
              /^https:\/\/thumb\.theporndb\.net\//,
              '/imageproxy/tpdb/thumb/'
            )
        : src;
  } else if (type === 'avatar') {
    // jellyfin avatar (if any)
    imageUrl = src;
  } else {
    return null;
  }

  return <Image unoptimized loader={imageLoader} src={imageUrl} {...props} />;
};

export default CachedImage;
