import type { GateType } from "@prisma/client";

/**
 * LPU-Batangas Main Campus deployment data (Capitol Site, Kumintang Ibaba,
 * Batangas City). Zones are the occupancy unit; the coordinates below are
 * documentation for installers only — ParkingZone/Camera carry no geometry,
 * and the single navigation destination is `ESTABLISHMENT_LOCATION`.
 *
 * Provenance (research dataset, 2026-09-14):
 *  - campus polygon / roads: OpenStreetMap way 91386590 + surrounding ways
 *  - gate and lot positions: Google satellite imagery (WGS84, ±3 m) cross-
 *    checked with Bing aerial imagery and OSM
 *  - capacities and gate roles: on-site knowledge supplied by the project
 *    owner; no striped slots are visible from imagery, so these are counts of
 *    vehicles the areas are known to hold, not painted-slot counts
 */

export type SeedZone = {
  name: string;
  code: string;
  capacity: number;
  description: string;
  /**
   * Per-zone Directions target (the zone's own access point on the public
   * road network). Admin-editable afterwards; the app never infers a point.
   */
  navigationLat: number;
  navigationLng: number;
};

export type SeedCamera = {
  zoneCode: string;
  identifier: string;
  name: string;
  location: string;
  gateType: GateType;
};

export const ESTABLISHMENT_LOCATION = {
  address:
    "LPU-Batangas Main Campus, P. Herrera St. cor. Doña Aurelia St., Kumintang Ibaba, Batangas City 4200",
  // Main vehicle gate (Zone A entrance) on the public road network. Turn-by-
  // turn navigation targets this point rather than a building centroid.
  latitude: 13.76447,
  longitude: 121.06462,
};

export const ZONES: SeedZone[] = [
  {
    name: "Main Loop",
    code: "A",
    capacity: 30,
    navigationLat: 13.76447,
    navigationLng: 121.06462,
    description:
      "Parking along the internal loop driveway around the JPL Building: main gate at P. Herrera St. cor. Doña Aurelia St. (13.76447, 121.06462), rotonda south of JPL, north gate on Doña Aurelia St. (13.76446, 121.06544).",
  },
  {
    name: "Back Parking",
    code: "B",
    capacity: 30,
    // Drivers enter through the main gate and follow the loop to the path.
    navigationLat: 13.76447,
    navigationLng: 121.06462,
    description:
      "Open lot at the south-west grounds beside the Mabini Building (centre 13.76295, 121.06460), reached from the Zone A rotonda by the tree-covered path (13.7632, 121.0648).",
  },
  {
    name: "Capitol Off-Campus Lot",
    code: "C",
    capacity: 100,
    navigationLat: 13.7678,
    navigationLng: 121.0627,
    description:
      "Off-campus lot (centre 13.767638, 121.062348) beside Laurel Park / Provincial Capitol, about 600 m by road from the main gate: P. Herrera St. north, left onto Pres. J.P. Laurel Hwy (National Road), entrance via the Oriental Garden Subdivision road.",
  },
];

export const CAMERAS: SeedCamera[] = [
  {
    zoneCode: "A",
    identifier: "cam-a-main-gate",
    name: "Main Loop Main Gate",
    location: "Main gate, P. Herrera St. cor. Doña Aurelia St. (13.76447, 121.06462)",
    gateType: "BIDIRECTIONAL",
  },
  {
    zoneCode: "A",
    identifier: "cam-a-north-gate",
    name: "Main Loop North Gate",
    location:
      "North gate on Doña Aurelia St. between the JPL Building and the College of Dentistry (13.76446, 121.06544)",
    gateType: "BIDIRECTIONAL",
  },
  {
    zoneCode: "B",
    identifier: "cam-b-access-path",
    name: "Back Parking Access Path",
    location:
      "Tree-covered path from the Zone A rotonda to the back lot beside the Mabini Building (13.7632, 121.0648) - candidate mount, verify on site",
    gateType: "BIDIRECTIONAL",
  },
  {
    zoneCode: "C",
    identifier: "cam-c-entrance",
    name: "Capitol Off-Campus Lot Entrance",
    location:
      "Lot entrance from the Oriental Garden Subdivision road off Pres. J.P. Laurel Hwy (approx. 13.7678, 121.0627) - candidate mount, verify on site",
    gateType: "BIDIRECTIONAL",
  },
];
