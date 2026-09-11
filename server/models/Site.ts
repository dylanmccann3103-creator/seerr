import type { TpdbSite } from '@server/api/tpdb/interfaces';
import type Media from '@server/entity/Media';

// A site's `network`/`parent` are full TpdbSite objects one level deep; we only
// ever need id + name for display, so keep the mapped shape minimal.
interface SiteRef {
  id: number;
  name: string;
}

export interface SiteDetails {
  id: number;
  name: string;
  shortName?: string;
  description?: string;
  url?: string;
  network?: SiteRef;
  parent?: SiteRef;
  posterPath?: string;
  logoPath?: string;
  mediaInfo?: Media;
}

const mapSiteRef = (site: TpdbSite): SiteRef => ({
  id: site.id,
  name: site.name,
});

export const mapSiteDetails = (site: TpdbSite, media?: Media): SiteDetails => ({
  id: site.id,
  name: site.name,
  shortName: site.short_name,
  description: site.description,
  url: site.url,
  network: site.network ? mapSiteRef(site.network) : undefined,
  parent: site.parent ? mapSiteRef(site.parent) : undefined,
  posterPath: site.poster ?? undefined,
  logoPath: site.logo ?? undefined,
  mediaInfo: media,
});

export interface SiteResult {
  id: number;
  name: string;
  posterPath?: string;
  mediaType: 'site';
  mediaInfo?: Media;
}

export const mapSiteResult = (site: TpdbSite, media?: Media): SiteResult => ({
  id: site.id,
  name: site.name,
  posterPath: site.poster ?? undefined,
  mediaType: 'site',
  mediaInfo: media,
});
