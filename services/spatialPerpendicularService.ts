// Geometric helper functions for perpendicular snap and projection onto polyline networks

export interface Point2D {
  x: number; // Longitude
  y: number; // Latitude
}

/**
 * Calculates Euclidean distance in approximate meters between two WGS84 coordinates.
 */
export function geoDistanceMeters(p1: Point2D, p2: Point2D): number {
  const R = 6378137; // Earth radius in meters
  const dLat = ((p2.y - p1.y) * Math.PI) / 180;
  const dLon = ((p2.x - p1.x) * Math.PI) / 180;
  const lat1 = (p1.y * Math.PI) / 180;
  const lat2 = (p2.y * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Projects a house point P(x, y) perpendicularly onto a line segment AB.
 * Returns the projected perpendicular point on the segment, the distance in meters,
 * and the segment bearing/normal.
 */
export function projectPointOntoSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): { projectedPoint: Point2D; distanceMeters: number; t: number; isInsideSegment: boolean } {
  // Convert lat/lng to local Cartesian approximation (meters) centered at A
  const cosLat = Math.cos((((a.y + b.y) / 2) * Math.PI) / 180);
  const degToMetersY = 111320;
  const degToMetersX = 111320 * cosLat;

  // Cartesian coordinates in meters relative to A
  const ax = 0;
  const ay = 0;
  const bx = (b.x - a.x) * degToMetersX;
  const by = (b.y - a.y) * degToMetersY;
  const px = (p.x - a.x) * degToMetersX;
  const py = (p.y - a.y) * degToMetersY;

  const dx = bx - ax;
  const dy = by - ay;
  const segmentLengthSq = dx * dx + dy * dy;

  if (segmentLengthSq === 0) {
    const dist = geoDistanceMeters(p, a);
    return { projectedPoint: { x: a.x, y: a.y }, distanceMeters: dist, t: 0, isInsideSegment: true };
  }

  // Projection parameter t = (AP . AB) / |AB|^2
  let t = (px * dx + py * dy) / segmentLengthSq;

  // Clamp t to segment bounds [0, 1] so connection lands squarely on the line
  const clampedT = Math.max(0, Math.min(1, t));
  const isInsideSegment = t >= 0 && t <= 1;

  // Cartesian coordinates of projected point
  const projX = clampedT * dx;
  const projY = clampedT * dy;

  // Convert back to WGS84
  const projectedWGS84: Point2D = {
    x: a.x + projX / degToMetersX,
    y: a.y + projY / degToMetersY
  };

  const distMeters = Math.hypot(px - projX, py - projY);

  return {
    projectedPoint: projectedWGS84,
    distanceMeters: distMeters,
    t: clampedT,
    isInsideSegment
  };
}

export interface NearestStreetProjection {
  projectedPoint: Point2D;
  distanceMeters: number;
  streetId: string | number;
  streetName?: string;
  streetLayer?: string;
  segmentIndex: number;
}

/**
 * Finds the nearest street or pipeline polyline in the dataset and computes
 * the exact perpendicular projection point on that line for a given house/property point.
 */
export function findNearestPerpendicularPoint(
  housePoint: Point2D,
  candidateLines: { id: string | number; name?: string; layer?: string; path?: Point2D[] }[],
  maxSearchDistanceMeters: number = 500
): NearestStreetProjection | null {
  let closest: NearestStreetProjection | null = null;
  let minDistance = Infinity;

  for (const line of candidateLines) {
    const path = line.path;
    if (!path || path.length < 2) continue;

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];

      const { projectedPoint, distanceMeters } = projectPointOntoSegment(housePoint, p1, p2);

      if (distanceMeters < minDistance && distanceMeters <= maxSearchDistanceMeters) {
        minDistance = distanceMeters;
        closest = {
          projectedPoint,
          distanceMeters,
          streetId: line.id,
          streetName: line.name,
          streetLayer: line.layer,
          segmentIndex: i
        };
      }
    }
  }

  return closest;
}
