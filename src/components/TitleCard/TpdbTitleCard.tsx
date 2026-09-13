import TitleCard from '@app/components/TitleCard';
import { Permission, useUser } from '@app/hooks/useUser';
import type { SceneDetails } from '@server/models/Scene';
import type { SiteDetails } from '@server/models/Site';
import { useInView } from 'react-intersection-observer';
import useSWR from 'swr';

export interface TpdbTitleCardProps {
  /** Local Media row id (for the error card's clear-data action) */
  id: number;
  tpdbId: number;
  type: 'scene' | 'site';
  canExpand?: boolean;
}

// Lazy card for lists that only carry ids (recently added, user profile).
const TpdbTitleCard = ({ id, tpdbId, type, canExpand }: TpdbTitleCardProps) => {
  const { hasPermission } = useUser();
  const { ref, inView } = useInView({ triggerOnce: true });
  const { data, error } = useSWR<SceneDetails | SiteDetails>(
    inView ? `/api/v1/${type}/${tpdbId}` : null
  );

  if (!data && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder canExpand={canExpand} />
      </div>
    );
  }

  if (!data) {
    return hasPermission(Permission.ADMIN) ? (
      <TitleCard.ErrorCard id={id} tpdbId={tpdbId} type={type} />
    ) : null;
  }

  return (
    <TitleCard
      id={data.id}
      image={data.posterPath}
      status={data.mediaInfo?.status}
      summary={'title' in data ? data.overview : data.description}
      title={'title' in data ? data.title : data.name}
      year={'releaseDate' in data ? data.releaseDate : undefined}
      mediaType={type}
      canExpand={canExpand}
    />
  );
};

export default TpdbTitleCard;
