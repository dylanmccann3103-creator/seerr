import PersonCard from '@app/components/PersonCard';
import TitleCard from '@app/components/TitleCard';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import globalMessages from '@app/i18n/globalMessages';
import type { PerformerResult } from '@server/models/Performer';
import type { SceneResult } from '@server/models/Scene';
import type { SiteResult } from '@server/models/Site';
import { useIntl } from 'react-intl';

type ListViewProps = {
  items?: (SceneResult | SiteResult | PerformerResult)[];
  isEmpty?: boolean;
  isLoading?: boolean;
  isReachingEnd?: boolean;
  onScrollBottom: () => void;
};

const ListView = ({
  items,
  isEmpty,
  isLoading,
  onScrollBottom,
  isReachingEnd,
}: ListViewProps) => {
  const intl = useIntl();
  useVerticalScroll(onScrollBottom, !isLoading && !isEmpty && !isReachingEnd);

  return (
    <>
      {isEmpty && (
        <div className="mt-64 w-full text-center text-2xl text-gray-400">
          {intl.formatMessage(globalMessages.noresults)}
        </div>
      )}
      <ul className="cards-vertical">
        {items?.map((title, index) => {
          let titleCard: React.ReactNode;

          switch (title.mediaType) {
            case 'scene':
              titleCard = (
                <TitleCard
                  key={title.id}
                  id={title.id}
                  image={title.posterPath}
                  status={title.mediaInfo?.status}
                  title={title.title}
                  mediaType={title.mediaType}
                  inProgress={
                    (title.mediaInfo?.downloadStatus ?? []).length > 0
                  }
                  canExpand
                />
              );
              break;
            case 'site':
              titleCard = (
                <TitleCard
                  key={title.id}
                  id={title.id}
                  image={title.posterPath}
                  status={title.mediaInfo?.status}
                  title={title.name}
                  mediaType={title.mediaType}
                  inProgress={
                    (title.mediaInfo?.downloadStatus ?? []).length > 0
                  }
                  canExpand
                />
              );
              break;
            case 'performer':
              titleCard = (
                <PersonCard
                  personId={title.id}
                  name={title.name}
                  profilePath={title.posterPath}
                  canExpand
                />
              );
              break;
          }

          return <li key={`${title.id}-${index}`}>{titleCard}</li>;
        })}
        {isLoading &&
          !isReachingEnd &&
          [...Array(20)].map((_item, i) => (
            <li key={`placeholder-${i}`}>
              <TitleCard.Placeholder canExpand />
            </li>
          ))}
      </ul>
    </>
  );
};

export default ListView;
