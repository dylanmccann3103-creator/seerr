import type DiscoverSlider from '@server/entity/DiscoverSlider';

// Numeric values are persisted in the discover_slider table; never renumber.
export enum DiscoverSliderType {
  RECENTLY_ADDED = 1,
  RECENT_REQUESTS = 2,
  RECENT_SCENES = 22,
  SITES = 23,
  PERFORMERS = 24,
}

export const defaultSliders: Partial<DiscoverSlider>[] = [
  {
    type: DiscoverSliderType.RECENT_SCENES,
    enabled: true,
    isBuiltIn: true,
    order: 0,
  },
  {
    type: DiscoverSliderType.SITES,
    enabled: true,
    isBuiltIn: true,
    order: 1,
  },
  {
    type: DiscoverSliderType.PERFORMERS,
    enabled: true,
    isBuiltIn: true,
    order: 2,
  },
  {
    type: DiscoverSliderType.RECENTLY_ADDED,
    enabled: true,
    isBuiltIn: true,
    order: 3,
  },
  {
    type: DiscoverSliderType.RECENT_REQUESTS,
    enabled: true,
    isBuiltIn: true,
    order: 4,
  },
];
