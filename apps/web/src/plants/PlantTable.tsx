import type { Plant } from '@sitecheck/shared';
import { NextInspection } from './NextInspection';
import { StatusBadge } from './StatusBadge';

interface Props {
  plants: Plant[];
  /** Showing the previous results while new ones load. */
  stale: boolean;
}

/** The plant list as a table. On narrow screens it scrolls sideways (cards come in 3.5). */
export function PlantTable({ plants, stale }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table
        aria-busy={stale}
        className={`w-full text-left text-sm transition-opacity ${stale ? 'opacity-60' : ''}`}
      >
        <caption className="sr-only">Plants</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Name
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Serial number
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Site
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Next inspection
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {plants.map((plant) => (
            <tr key={plant.id}>
              <th scope="row" className="px-4 py-3 font-normal">
                <span className="block font-medium text-slate-900">{plant.name}</span>
                <span className="block text-slate-500">{plant.type}</span>
              </th>
              <td className="px-4 py-3 font-mono text-xs">{plant.serialNumber}</td>
              <td className="px-4 py-3">{plant.siteName}</td>
              <td className="px-4 py-3">
                <StatusBadge status={plant.status} />
              </td>
              <td className="px-4 py-3">
                <NextInspection iso={plant.nextInspectionAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
