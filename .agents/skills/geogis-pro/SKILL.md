---
name: geogis-pro
description: >-
  Expert GIS and civil infrastructure engineering assistant for GeoGIS Pro (Map-Tools).
  Use to parse and dissect raw AutoCAD DXF subdivisions, extract street centerlines (Medial Axis),
  perform Manning gravity sewer hydraulic calculations, validate Saudi Building Code (SBC 701/702/1001),
  detect 3D spatial utility clashes, compute earthwork and asphalt cutting BOQ, and export to Metric UTM DXF, KML, and Shapefiles.
---

# GeoGIS Pro (Map-Tools) Engineering Skill

This skill equips the agent with domain-specific algorithms, mathematical formulas, and service contracts for the **Map-Tools (GeoGIS Pro)** spatial platform.

---

## 1. Core Data Model (`GeoPoint`)

All entities (pipes, manholes, parcels, property blocks, points, polylines) follow the unified `GeoPoint` specification:

```typescript
export interface GeoPoint {
  id: string;                          // Unique ID (e.g. 'SEWER_ST_001', 'MH-102')
  name?: string;
  x: number;                           // Lng in WGS84 or Metric UTM X
  y: number;                           // Lat in WGS84 or Metric UTM Y
  z?: number;                          // Ground Elevation (GL)
  type?: 'Point' | 'LineString' | 'Polygon';
  path?: { x: number; y: number; z?: number }[];
  color?: string;                      // HEX color (#3b82f6 = water, #ef4444 = sewer)
  layer?: string;                      // CAD / GIS Layer name
  description?: string;
  attributes?: Record<string, any>;    // Diameter, Material, Permit No, Length, etc.
  hydraulicProperties?: {
    invertLevelIn?: number;            // Invert Level upstream (IL In)
    invertLevelOut?: number;           // Invert Level downstream (IL Out)
    groundLevel?: number;              // Natural Ground Level (GL)
    slopePercent?: number;             // Slope % (e.g. 0.5%)
    velocityMps?: number;              // Manning velocity (m/s)
    capacityM3ps?: number;             // Flow capacity (mÂ³/s)
    isDropManhole?: boolean;           // Drop manhole flag (drop >= 0.60m)
    dropHeightM?: number;
  };
}
```

---

## 2. Subsystem Capabilities & Calling Guidelines

### A. Raw AutoCAD DXF Subdivision Dissection (`cadSubdivisionService.ts`)
* **When to use:** When processing raw, unplanned, or un-centered DXF subdivision plans.
* **Core Principles:**
  1. **Purge Transverse Lot Dividers:** Automatically ignore short divider lines ($L \le 45\text{m}$) meeting boundaries at ~90Â° T-junctions.
  2. **Medial Axis Street Pairing:** Pair facing parallel block frontages across open corridors ($9\text{m} \le W \le 50\text{m}$) and compute the midline:
     $$\text{Centerline}(t) = \frac{\text{Frontage}_A(t) + \text{Frontage}_B(t)}{2}$$
  3. **Outfall Cascading:** Automatically direct gravity flow from high nodes to the lowest boundary outfall.

### B. Metric UTM AutoCAD DXF Exporter (`dxfExportService.ts`)
* **When to use:** When exporting points/lines to `.DXF` for AutoCAD / Civil 3D.
* **Rules:**
  * Always auto-project WGS84 degrees to **Metric UTM Coordinates in Meters** ($X \approx 698,000\text{m}, Y \approx 2,754,000\text{m}$) using the detected UTM Zone.
  * Always write standards-compliant AutoCAD 2000 (AC1015) headers, `$EXTMIN`, `$EXTMAX`, and active `*ACTIVE VPORT` centered on the drawing to prevent blank/empty files on open.
  * Write `LWPOLYLINE` for pipes and boundary perimeters, `POINT` + `CIRCLE` for manholes, and clean `TEXT` labels.

### C. Hydraulic Gravity Sewer Engine (`gravitySewerEngine.ts`)
* **Manning's Equation:**
  $$V = \frac{1}{n} R^{2/3} S^{1/2}$$
  * Manning's $n = 0.010$ for uPVC/HDPE smooth plastic pipes, $0.013$ for Concrete.
  * Minimum self-cleansing velocity: $V \ge 0.60\text{ m/s}$.
  * Maximum scour velocity: $V \le 2.50\text{ m/s}$.
  * Slope guidelines:
    * DN 200 mm: Min slope $0.50\%$ ($1:200$).
    * DN 250 mm: Min slope $0.40\%$ ($1:250$).
    * DN 300 mm: Min slope $0.33\%$ ($1:300$).
  * Minimum soil cover depth: $1.20\text{m}$ (under roads) to $6.00\text{m}$ max standard trench.

### D. Saudi Building Code (SBC 701/702/1001) Auditor (`SbcValidator.tsx`)
* **SBC 701 (Sanitary Sewer):**
  * Manhole maximum spacing: $50\text{m}$ for pipes $\le 200\text{mm}$, $80\text{m}$ for pipes $250-400\text{mm}$.
  * Drop manhole required if elevation drop exceeds $0.60\text{m}$.
* **SBC 702 (Potable Water):**
  * Minimum horizontal separation between water and sewer pipes: $3.00\text{m}$.
  * Minimum vertical crossing clearance: $0.50\text{m}$ (Water must always be placed ABOVE sewer).

### E. 3D Spatial Clash Detection (`clashDetectionService.ts`)
* Detects 2D polyline intersections across different utility layers.
* Calculates net vertical separation clearance:
  $$\Delta Z = |Z_1 - Z_2| - \frac{D_1 + D_2}{2}$$
* Flags hard clash if $\Delta Z \le 0.0\text{m}$, and soft warning if $0.0\text{m} < \Delta Z < 0.50\text{m}$.

### F. Trench & Asphalt BOQ Engine (`asphaltCalculationService.ts`, `earthworkService.ts`)
* Trench width: $W = D_{\text{pipe}} + 0.60\text{m}$.
* Asphalt cutting area: $A = \text{Length} \times W$.
* Excavation volume: $V = A \times \text{Depth}_{\text{avg}}$.
* Sand bedding volume ($15\text{cm}$ layer) and sub-base backfill volume.

---

## 3. Recommended Implementation Workflows

1. **For DXF Import:** Call `analyzeSubdivisionDxf()` -> Choose placement mode (`street_centerline` / `connected_frontage`) -> Call `generateSubdivisionUtilities()`.
2. **For Hydraulics:** Call `orientNetworkTowardsOutfall(pipes)` -> Call `computeGravityPipeSegment()`.
3. **For DXF Export:** Call `downloadDXF(data, filename, { forceUtm: true })`.
4. **For Code Audit:** Run SBC 701/702 checks -> Focus problematic elements using `setFocusedPoint()`.