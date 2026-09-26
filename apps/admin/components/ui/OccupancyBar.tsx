import { AVAILABILITY_BAR, type Availability } from "./Badge";

/**
 * Zone occupancy track, coloured by the backend's availability class. Purely
 * visual (`aria-hidden`): the row it sits in states the count as text. Shared
 * by the dashboard and the zones list, which used to carry verbatim copies.
 */
export function OccupancyBar({ pct, availability }: { pct: number; availability: Availability }) {
  return (
    <div className="occupancy-bar" aria-hidden="true">
      <div
        className={`h-full rounded-full ${AVAILABILITY_BAR[availability]} transition-[width] duration-500 ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}
