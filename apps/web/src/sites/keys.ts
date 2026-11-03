/** Cache keys for site data (see plants/keys.ts for why keys live in their own file). */
export const siteKeys = {
  all: ['sites'] as const,
  list: () => ['sites', 'list'] as const,
};
