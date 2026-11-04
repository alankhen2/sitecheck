import type { Site } from '@sitecheck/shared';
import type { ReactNode } from 'react';
import { PlantCountLink, SiteStatusBadge } from './SiteTable';

interface Props {
  sites: Site[];
  /** The buttons of each card (Edit / Delete), only passed for an admin. */
  actions?: (site: Site) => ReactNode;
}

/** The site list for narrow screens: the same facts as SiteTable, without sideways scrolling. */
export function SiteCards({ sites, actions }: Props) {
  return (
    // role="list": Safari drops list semantics when a list has no bullets.
    <ul role="list" aria-label="Sites" className="flex flex-col gap-3">
      {sites.map((site) => (
        <li key={site.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 font-medium break-words text-slate-900">{site.name}</h2>
            <SiteStatusBadge isActive={site.isActive} />
          </div>
          <p className="mt-1 text-sm break-words text-slate-700">{site.address}</p>
          <PlantCountLink site={site} className="inline-flex min-h-11 items-center text-sm" />
          {actions && (
            <div className="mt-1 flex justify-end border-t border-slate-100 pt-2">
              {actions(site)}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
