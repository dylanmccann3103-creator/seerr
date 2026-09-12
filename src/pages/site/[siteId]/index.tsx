import SiteDetails from '@app/components/SiteDetails';
import { getHostAndPort } from '@app/utils/urlHelper';
import type { SiteDetails as SiteDetailsType } from '@server/models/Site';
import axios from 'axios';
import type { GetServerSideProps, NextPage } from 'next';

interface SitePageProps {
  site?: SiteDetailsType;
}

const SitePage: NextPage<SitePageProps> = ({ site }) => {
  return <SiteDetails site={site} />;
};

export const getServerSideProps: GetServerSideProps<SitePageProps> = async (
  ctx
) => {
  const response = await axios.get<SiteDetailsType>(
    `http://${getHostAndPort()}/api/v1/site/${ctx.query.siteId}`,
    {
      headers: ctx.req?.headers?.cookie
        ? { cookie: ctx.req.headers.cookie }
        : undefined,
    }
  );

  return {
    props: {
      site: response.data,
    },
  };
};

export default SitePage;
