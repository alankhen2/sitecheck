import type { Plant } from '@sitecheck/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { NextInspection } from './NextInspection';
import { StatusBadge } from './StatusBadge';

interface Props {
  plants: Plant[];
  /** Showing the previous results while new ones load. */
  stale: boolean;
  /** The buttons of each card (Edit / Delete). */
  actions?: (plant: Plant) => ReactNode;
}

const term = 'text-slate-500';

/**
 * The plant list for narrow screens: the same facts as PlantTable, without
 * sideways scrolling. A list of headed cards, and <dl> pairs each value with
 * its label, which a table's column headers do on wide screens.
 */
export function PlantCards({ plants, stale, actions }: Props) {
  return (
    // role="list": Safari drops list semantics when a list has no bullets.
    <ul
      role="list"
      aria-label="Plants"
      aria-busy={stale}
      className={`flex flex-col gap-3 transition-opacity ${stale ? 'opacity-60' : ''}`}
    >
      {plants.map((plant) => (
        <li key={plant.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-medium break-words text-slate-900">
                <Link
                  to={`/plants/${plant.id}`}
                  className="underline decoration-slate-300 underline-offset-2"
                >
                  {plant.name}
                </Link>
              </h2>
              <p className="text-sm break-words text-slate-500">{plant.type}</p>
            </div>
            <StatusBadge status={plant.status} />
          </div>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className={term}>Serial number</dt>
            <dd className="font-mono text-xs break-all">{plant.serialNumber}</dd>
            <dt className={term}>Site</dt>
            <dd className="break-words">{plant.siteName}</dd>
            <dt className={term}>Next inspection</dt>
            <dd>
              <NextInspection iso={plant.nextInspectionAt} />
            </dd>
          </dl>
          {actions && (
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
              {actions(plant)}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
