import type { Site } from '@sitecheck/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface Props {
  sites: Site[];
  /** Extra cells for each row (Edit / Delete), only passed for an admin. */
  actions?: (site: Site) => ReactNode;
}

/** Active or inactive, as a word in a pill (the word carries the meaning, not the colour). */
export function SiteStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        isActive
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/20'
          : 'bg-slate-100 text-slate-700 ring-slate-500/20'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

const plantsLabel = (count: number) => `${String(count)} ${count === 1 ? 'plant' : 'plants'}`;

/** A site's plant count, linking to the plants page filtered to that site. */
export function PlantCountLink({ site, className = '' }: { site: Site; className?: string }) {
  return (
    <Link
      to={`/plants?siteId=${site.id}`}
      aria-label={`${plantsLabel(site.plantCount)} at ${site.name}`}
      className={`text-amber-700 underline-offset-2 hover:underline ${className}`}
    >
      {plantsLabel(site.plantCount)}
    </Link>
  );
}

/** Every site as a table, for wide screens (narrow ones get SiteCards). */
export function SiteTable({ sites, actions }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Sites</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Name
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Address
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Plants
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
            {actions && (
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sites.map((site) => (
            <tr key={site.id}>
              <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                {site.name}
              </th>
              <td className="px-4 py-3 text-slate-700">{site.address}</td>
              <td className="px-4 py-3">
                <PlantCountLink site={site} />
              </td>
              <td className="px-4 py-3">
                <SiteStatusBadge isActive={site.isActive} />
              </td>
              {actions && (
                <td className="px-4 py-3 text-right whitespace-nowrap">{actions(site)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
