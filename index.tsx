import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, CircleMarker, Polyline, Circle, useMap, Polygon, useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';
import { 
  ChevronLeft,
  Navigation2,
  Layers,
  Target,
  Trash2,
  Ruler,
  Zap,
  BookOpen,
  Info,
  MapPin,
  RotateCcw,
  Download,
  Upload,
  HelpCircle,
  X,
  AlertCircle,
  Cpu,
  Eye,
  Diameter,
  Plus,
  Minus,
  CaseSensitive,
  Gauge,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

/** --- TYPES --- **/
type AppView = 'landing' | 'track' | 'green' | 'manual' | 'stimp';
type UnitSystem = 'Yards' | 'Metres';
type FontSize = 'small' | 'medium' | 'large';

interface GeoPoint {
  lat: number;
  lng: number;
  alt: number | null;
  accuracy: number;
  altAccuracy: number | null;
  timestamp: number;
  type?: 'green' | 'bunker';
}

interface SavedRecord {
  id: string;
  type: 'Track' | 'Green';
  date: number;
  primaryValue: string;
  secondaryValue?: string;
  egdValue?: string;
  points: GeoPoint[];
  pivots?: GeoPoint[];
  holeNumber?: number;
}

/** --- DOCUMENTATION CONTENT --- **/
const USER_MANUAL = [
  {
    title: "Introduction",
    color: "text-white",
    icon: <BookOpen className="text-white" />,
    content: "Scottish Golf Course Rating Toolkit is designed to provide an alternative to roadwheels and barometers when rating a course. Ensure 'High Accuracy' location is enabled on your device. For best results, keep the app active and in-hand while walking. The App is web-based, so an internet connection is required to launch. A trick is to open the app where you have Internet, open the 'Distance Tracker' section and zoom out so you see the whole of the course you are working on. This should cache the images or maps locally, so you can still see them when Internet is lost. But if you lose connection the App will still work, though you may not see the background mapping."
  },
   
  {
    title: "Location services",
    color: "text-rose-500",
    icon: <MapPin className="text-rose-500" />,
    content: (
      <>
        If your location isn't showing when you're trying to track a distance or map a green, try the following help sources 1) <a href="https://support.google.com/nexus/topic/6143651" target="_blank" rel="noopener noreferrer" className="text-yellow-400 underline">Android devices</a>  2) <a href="https://support.apple.com/en-gb/102647" target="_blank" rel="noopener noreferrer" className="text-emerald-500 underline">iOS (Apple) devices</a>
      </>
    )
  },
  
  {
    title: "Distance Tracker",
    color: "text-blue-400",
    icon: <Navigation2 className="text-blue-400" />,
    content: "Tap 'Start' when you are ready to start tracking the distance. Use 'Pivot' (max 3) at dog-leg corners to measure the true path of the hole. Total distance and elevation change are calculated from the start through all pivots to your current position. GNSS (GPS) is really only accurate to 2m at best, so keep an eye on the Horiz value and the indicative coloured circle around the current location. It shows you the absolute positioning accuracy of the GPS, however, don't confuse this with the accuracy of distance measurements. They will always be better than this as they are relative to each other."
  },
  {
    title: "Green Mapper",
    color: "text-emerald-400",
    icon: <Target className="text-emerald-400" />,
    content: "Start at any point on the edge of the green. Walk the perimeter. The app automatically 'Closes' the loop when you return to within 1m of your start point, or you can force it to close by hitting the button. Results show total Area and Perimeter length."
  },
  {
    title: "Recording Bunkers",
    color: "text-orange-400",
    icon: <AlertCircle className="text-orange-400" />,
    content: "While walking the green edge, hold the 'Bunker' button when passing a bunker segment and release when you get to the end. This marks those points as sand. The panel will show what percentage of the green's perimeter is guarded by sand."
  },
  {
    title: "Effective Green Diameter",
    color: "text-emerald-400",
    icon: <Diameter className="text-emerald-400" />,
    content: "Effective Green Diameter (EGD) is required when measuring a green. When a green is mapped and closed the EGD will automatically be displayed, together with the raw data and dashed lines showing the dimensions used. Oddly-shaped greens are more tricky, but by using a \"concave hull check\" it should at least recognise an L-shaped green. In these circumstances, EGD should show the raw dimension data to allow the rater to make their weighting adjustments - as per Course Rating System Manual (Jan 2024 Section 13D [two portions]). In those cases when a green cannot be automatically identified by the App, it will draw a curved line right up the centre of the green with perpendicular widths at 0.25, 0.50 and 0.75 of the green depth. The raw data will be shown for manual analysis."
  },
   {
    title: "Stimping sloped greens",
    color: "text-blue-400",
    icon: <Gauge className="text-blue-400" />,
    content: "While the best procedure is to find a level area on the green on which to stimp, when it is not possible to find a flat area to measure, refer to 'Course Rating Manual 9.Green Surface'. Find the most uniform area. Roll balls down and then up. Enter the averaged values into the App and it will calculate the corrected speed and contour category based on those values. Refer to the 'Green Surface Rating Table' to determine the rating."
  },
  {
    title: "Sensor Diagnostics",
    color: "text-blue-400",
    icon: <Cpu className="text-blue-400" />,
    content: (
      <>
        GPS alone isn't accurate enough for determining altitude changes, but if your mobile device contains a barometer sensor this App should use it by default. If it does exist it will indicate its use as follows... <span className="text-blue-500 font-black">Blue Light</span> (Barometric): Highest precision elevation using your phone's pressure sensor (if it has one). <span className="text-emerald-500 font-black">Emerald Light</span> (GNSS 3D): Standard GPS altitude. <span className="text-amber-500 font-black">Amber Light</span>: Searching for vertical lock.
      </>
    )
  },
  {
    title: "Data import/export",
    color: "text-yellow-400",
    icon: <BookOpen className="text-yellow-400" />,
    content: "Whenever you save a track or green area, the data appears at the bottom of the homescreen. Select a result and it will show you the results again. Hitting the bin icon will delete an individual record. You can also save all results to a KML file, which will be stored in your downloads folder. The filename will be the current date and time. KML files can be opened in GIS packages, such as Google Earth or Google Maps for analysis and archiving purposes. If you already have a KML file from a previous rating, or have digitised greens in Google Earth and wish to import them for EGD processing, you can do this using 'Import KML'"
  },
  {
    title: "Help and suggestions",
    color: "text-red-400",
    icon: <Eye className="text-red-400" />,
    content: "This App is under development. If you require assistance or have any suggestions, please email me at nigel.lorriman@gmail.com  Version - Jan 2026"
  }
];

/** --- UTILITIES --- **/
const calculateDistance = (p1: {lat: number, lng: number}, p2: {lat: number, lng: number}): number => {
  const R = 6371e3;
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
  const Δλ = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const calculateArea = (points: GeoPoint[]): number => {
  if (points.length < 3) return 0;
  const R = 6371e3;
  const lat0 = points[0].lat * Math.PI / 180;
  const coords = points.map(p => ({
    x: p.lng * Math.PI / 180 * R * Math.cos(lat0),
    y: p.lat * Math.PI / 180 * R
  }));
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    area += coords[i].x * coords[j].y - coords[j].x * coords[i].y;
  }
  return Math.abs(area) / 2;
};

const getConvexHull = (points: GeoPoint[]): GeoPoint[] => {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.lng !== b.lng ? a.lng - b.lng : a.lat - b.lat);
  const cp = (a: GeoPoint, b: GeoPoint, c: GeoPoint) => (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cp(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cp(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return [...lower, ...upper];
};

const getWidthAtAxisPoint = (midX: number, midY: number, nx: number, ny: number, polyPoints: any[], toX: any, toY: any) => {
  const intersections: number[] = [];
  for (let i = 0; i < polyPoints.length - 1; i++) {
    const x1 = toX(polyPoints[i]), y1 = toY(polyPoints[i]);
    const x2 = toX(polyPoints[i+1]), y2 = toY(polyPoints[i+1]);
    const sx = x2 - x1, sy = y2 - y1;
    const det = -sx * ny + sy * nx;
    if (Math.abs(det) < 1e-10) continue; 
    const u = (-(midX - x1) * ny + (midY - y1) * nx) / det;
    const t = (sx * (midY - y1) - sy * (midX - x1)) / det;
    if (u >= 0 && u <= 1) intersections.push(t);
  }
  if (intersections.length < 2) return null;
  return { minT: Math.min(...intersections), maxT: Math.max(...intersections) };
};

const isPointInPolygon = (p: {x: number, y: number}, polygon: {x: number, y: number}[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const getEGDAnalysis = (points: GeoPoint[], forceSimpleAverage: boolean = false) => {
  if (points.length < 3) return null;
  const R = 6371e3;
  let maxD = 0;
  let pA = points[0], pB = points[0];
  
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = calculateDistance(points[i], points[j]);
      if (d > maxD) { maxD = d; pA = points[i]; pB = points[j]; }
    }
  }

  const latRef = pA.lat * Math.PI / 180;
  const toX = (p: {lat: number, lng: number}) => p.lng * Math.PI / 180 * R * Math.cos(latRef);
  const toY = (p: {lat: number, lng: number}) => p.lat * Math.PI / 180 * R;
  const fromXY = (x: number, y: number): GeoPoint => ({
    lat: (y / R) * (180 / Math.PI),
    lng: (x / (R * Math.cos(latRef))) * (180 / Math.PI),
    alt: null, accuracy: 0, altAccuracy: 0, timestamp: 0
  });

  const xA = toX(pA), yA = toY(pA);
  const xB = toX(pB), yB = toY(pB);
  const dx = xB - xA, dy = yB - yA;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return null;

  const nx = -dy / mag;
  const ny = dx / mag;
  const polyPoints = [...points, points[0]];

  // Standard Midpoint Width
  const midX = (xA + xB) / 2;
  const midY = (yA + yB) / 2;
  const midW = getWidthAtAxisPoint(midX, midY, nx, ny, polyPoints, toX, toY);
  const widthMeters = midW ? (midW.maxT - midW.minT) : 0;

  // Multi-Width Check (25% and 75% along the axis)
  const q1X = xA + (xB - xA) * 0.25;
  const q1Y = yA + (yB - yA) * 0.25;
  const q3X = xA + (xB - xA) * 0.75;
  const q3Y = yA + (yB - yA) * 0.75;
  const w1 = getWidthAtAxisPoint(q1X, q1Y, nx, ny, polyPoints, toX, toY);
  const w3 = getWidthAtAxisPoint(q3X, q3Y, nx, ny, polyPoints, toX, toY);

  const L_yds = maxD * 1.09361;
  const W_yds = widthMeters * 1.09361;
  const ratio = W_yds === 0 ? 0 : L_yds / W_yds;

  // Determine Method
  let egd_yds = 0;
  let method = "Average (L+W)/2";
  let isInconsistent = false;
  let w1_yds = 0, w3_yds = 0;
  let pC1, pD1, pC3, pD3;

  if (forceSimpleAverage) {
    egd_yds = (L_yds + W_yds) / 2;
    method = "Average (L+W)/2";
  } else {
    if (w1 && w3) {
      w1_yds = (w1.maxT - w1.minT) * 1.09361;
      w3_yds = (w3.maxT - w3.minT) * 1.09361;
      if (Math.abs(w1_yds - w3_yds) / Math.max(w1_yds, w3_yds) > 0.25) {
        isInconsistent = true;
        method = "One dimension not consistent";
        const avgShort = (w1_yds + w3_yds) / 2;
        egd_yds = (L_yds + avgShort) / 2;
        pC1 = fromXY(q1X + nx * w1.maxT, q1Y + ny * w1.maxT);
        pD1 = fromXY(q1X + nx * w1.minT, q1Y + ny * w1.minT);
        pC3 = fromXY(q3X + nx * w3.maxT, q3Y + ny * w3.maxT);
        pD3 = fromXY(q3X + nx * w3.minT, q3Y + ny * w3.minT);
      }
    }

    if (!isInconsistent) {
      if (ratio >= 3) {
        egd_yds = (3 * W_yds + L_yds) / 4;
        method = "One dimension three times the other";
      } else if (ratio >= 2) {
        egd_yds = (2 * W_yds + L_yds) / 3;
        method = "One dimension twice the other";
      } else {
        egd_yds = (L_yds + W_yds) / 2;
      }
    }
  }
  
  const pC = fromXY(midX + nx * (midW?.maxT || 0), midY + ny * (midW?.maxT || 0));
  const pD = fromXY(midX + nx * (midW?.minT || 0), midY + ny * (midW?.minT || 0));

  return { 
    egd: Math.round(egd_yds * 10) / 10, 
    L: L_yds, 
    W: W_yds, 
    ratio, pA, pB, pC, pD, method,
    isInconsistent, w1_yds, w3_yds, pC1, pD1, pC3, pD3
  };
};

/** --- NEW ANOMALOUS GREEN ANALYSIS CODE --- **/
const performAnomalousAnalysis = (points: GeoPoint[], pA: GeoPoint, pB: GeoPoint) => {
  const R = 6371e3;
  const latRef = pA.lat * Math.PI / 180;
  const toX = (p: {lat: number, lng: number}) => p.lng * Math.PI / 180 * R * Math.cos(latRef);
  const toY = (p: {lat: number, lng: number}) => p.lat * Math.PI / 180 * R;
  const fromXY = (x: number, y: number): GeoPoint => ({
    lat: (y / R) * (180 / Math.PI),
    lng: (x / (R * Math.cos(latRef))) * (180 / Math.PI),
    alt: null, accuracy: 0, altAccuracy: 0, timestamp: 0
  });

  const xA = toX(pA), yA = toY(pA);
  const xB = toX(pB), yB = toY(pB);
  const dx = xB - xA, dy = yB - yA;
  const straightDist = Math.sqrt(dx * dx + dy * dy);
  const mag = straightDist;
  
  if (mag === 0) return null;

  const nx = -dy / mag;
  const ny = dx / mag;
  const polyPoints = [...points, points[0]];

  // 1. Skeleton Generation (The Curved Spine / Medial Axis)
  const steps = 15;
  const spinePoints: GeoPoint[] = [];
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curX = xA + dx * t;
    const curY = yA + dy * t;
    
    // Find cross-section intersections at this interval
    const res = getWidthAtAxisPoint(curX, curY, nx, ny, polyPoints, toX, toY);
    if (res) {
      // Find the center point between the nearest left and right perimeters (equidistant)
      const midT = (res.minT + res.maxT) / 2;
      spinePoints.push(fromXY(curX + nx * midT, curY + ny * midT));
    }
  }

  // Calculate curved spine length
  let curvedLen = 0;
  for (let i = 0; i < spinePoints.length - 1; i++) {
    curvedLen += calculateDistance(spinePoints[i], spinePoints[i + 1]);
  }

  // 2. Perpendicular Sampling at milestones: 1/4, 1/2, 3/4
  const milestones = [0.25, 0.5, 0.75];
  const milestoneColors = ["#fb923c", "#facc15", "#f472b6"];
  const sampledWidths: { w: number, p1: GeoPoint, p2: GeoPoint, label: string, color: string }[] = [];
  
  milestones.forEach((m, idx) => {
    const t = m;
    const curX = xA + dx * t;
    const curY = yA + dy * t;
    const res = getWidthAtAxisPoint(curX, curY, nx, ny, polyPoints, toX, toY);
    if (res) {
      sampledWidths.push({
        w: (res.maxT - res.minT) * 1.09361,
        p1: fromXY(curX + nx * res.maxT, curY + ny * res.maxT),
        p2: fromXY(curX + nx * res.minT, curY + ny * res.minT),
        label: `W${idx + 1}`,
        color: milestoneColors[idx]
      });
    }
  });

  const curvedLenYds = curvedLen * 1.09361;
  const straightLenYds = mag * 1.09361;

  // Manual Req Trigger Logic based on curvature ratio
  const isSignificantlyCurved = curvedLenYds > straightLenYds * 1.15;

  return {
    method: "Anomalous Green Detected",
    isAnomalous: true,
    isManualReq: isSignificantlyCurved,
    curvedLength: curvedLenYds,
    straightLength: straightLenYds,
    spine: spinePoints,
    widths: sampledWidths
  };
};

const analyzeGreenShape = (points: GeoPoint[], concavityThreshold: number = 0.82) => {
  if (points.length < 3) return null;
  const basic = getEGDAnalysis(points);
  if (!basic) return null;

  const polyArea = calculateArea(points);
  const hullArea = calculateArea(getConvexHull(points));
  const concavity = hullArea > 0 ? polyArea / hullArea : 1;
  
  const R = 6371e3;
  const latRef = points[0].lat * Math.PI / 180;
  const toX = (p: {lat: number, lng: number}) => p.lng * Math.PI / 180 * R * Math.cos(latRef);
  const toY = (p: {lat: number, lng: number}) => p.lat * Math.PI / 180 * R;
  const polyCoords = points.map(p => ({ x: toX(p), y: toY(p) }));
  
  const midX = (toX(basic.pA) + toX(basic.pB)) / 2;
  const midY = (toY(basic.pA) + toY(basic.pB)) / 2;
  const midpointIsOutside = !isPointInPolygon({ x: midX, y: midY }, polyCoords);

  const isLShape = midpointIsOutside || concavity < concavityThreshold || basic.ratio > 3.6;

  if (isLShape) {
    let elbowIdx = 0;
    let maxElbowDist = -1;
    const xA = toX(basic.pA), yA = toY(basic.pA);
    const xB = toX(basic.pB), yB = toY(basic.pB);
    const dx = xB - xA, dy = yB - yA;
    const mag = Math.sqrt(dx * dx + dy * dy);

    points.forEach((p, idx) => {
      const px = toX(p), py = toY(p);
      const dist = Math.abs((xB - xA) * (yA - py) - (xA - px) * (yB - yA)) / mag;
      if (dist > maxElbowDist) {
        maxElbowDist = dist;
        elbowIdx = idx;
      }
    });

    const s1 = getEGDAnalysis(points.slice(0, elbowIdx + 1), true);
    const s2 = getEGDAnalysis(points.slice(elbowIdx), true);

    let hasAnomaly = false;
    if (s1 && s1.pA && s1.pB) {
      const s1MidX = (toX(s1.pA) + toX(s1.pB)) / 2;
      const s1MidY = (toY(s1.pA) + toY(s1.pB)) / 2;
      if (!isPointInPolygon({ x: s1MidX, y: s1MidY }, polyCoords)) hasAnomaly = true;
    }
    if (!hasAnomaly && s2 && s2.pA && s2.pB) {
      const s2MidX = (toX(s2.pA) + toX(s2.pB)) / 2;
      const s2MidY = (toY(s2.pA) + toY(s2.pB)) / 2;
      if (!isPointInPolygon({ x: s2MidX, y: s2MidY }, polyCoords)) hasAnomaly = true;
    }

    // --- TRIGGER ANOMALOUS GREEN ANALYSIS IF ANOMALY DETECTED ---
    let anomalousResult = null;
    if (hasAnomaly) {
      anomalousResult = performAnomalousAnalysis(points, basic.pA, basic.pB);
    }

    return { 
      ...basic, 
      isLShape: true, 
      method: anomalousResult ? anomalousResult.method : "Two portions",
      hasAnomaly,
      anomalousResult,
      s1, 
      s2 
    };
  }

  return { ...basic, isLShape: false, hasAnomaly: false, s1: null, s2: null };
};

const MapController: React.FC<{ 
  pos: GeoPoint | null, active: boolean, mapPoints: GeoPoint[], completed: boolean, viewingRecord: SavedRecord | null, mode: AppView
}> = ({ pos, active, mapPoints, completed, viewingRecord, mode }) => {
  const map = useMap();
  const isUserInteracting = useRef(false);
  const lastViewId = useRef<string | null>(null);
  const hasInitialLock = useRef(false);

  useMapEvents({
    movestart: () => { isUserInteracting.current = true; },
    zoomstart: () => { isUserInteracting.current = true; }
  });

  useEffect(() => {
    const currentId = viewingRecord ? viewingRecord.id : (active ? 'active' : 'idle');
    if (lastViewId.current !== currentId) {
      isUserInteracting.current = false;
      lastViewId.current = currentId;
    }
  }, [viewingRecord, active]);

  useEffect(() => {
    if (isUserInteracting.current) return;

    if (viewingRecord) {
      const pts = viewingRecord.points;
      if (pts && pts.length > 0) {
        const bounds = L.latLngBounds(pts.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40], paddingBottomRight: [40, 240], animate: true });
      }
    } else if (completed && mapPoints.length > 2) {
      const bounds = L.latLngBounds(mapPoints.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [40, 40], paddingBottomRight: [40, 240], animate: true });
    } else if (pos) {
      if (!hasInitialLock.current) {
        map.setView([pos.lat, pos.lng], 19, { animate: true });
        hasInitialLock.current = true;
      } else if (active) {
        map.setView([pos.lat, pos.lng], 19, { animate: true });
      }
    }
  }, [pos, active, map, completed, mapPoints, viewingRecord]);

  return null;
};

const UserManual: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [fontSize, setFontSize] = useState<FontSize>('medium');

  const cycleFontSize = () => {
    if (fontSize === 'small') setFontSize('medium');
    else if (fontSize === 'medium') setFontSize('large');
    else setFontSize('small');
  };

  const textClasses = useMemo(() => {
    switch (fontSize) {
      case 'small': return 'text-[11px] leading-relaxed';
      case 'large': return 'text-lg leading-relaxed';
      default: return 'text-sm leading-relaxed';
    }
  }, [fontSize]);

  return (
    <div className="fixed inset-0 z-[2000] bg-[#020617] flex flex-col p-6 overflow-y-auto no-scrollbar">
      <div className="flex justify-between items-center mb-8 mt-4">
        <h2 className="text-3xl font-black text-blue-500 uppercase tracking-tighter">User Manual</h2>
        <div className="flex gap-2">
          <button onClick={cycleFontSize} className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-blue-400 active:scale-90 transition-all border border-white/10 shadow-lg" title="Cycle Font Size">
            <CaseSensitive size={24} strokeWidth={2.5} />
          </button>
          <button onClick={onClose} className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-white active:scale-90 transition-all border border-white/10 shadow-lg">
            <X size={24} />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-8 pb-20">
        {USER_MANUAL.map((section, idx) => (
          <div key={idx} className="bg-slate-900/50 border border-white/5 rounded-[2rem] p-6 shadow-xl">
             <div className="flex items-center gap-3 mb-3">
               <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center shadow-lg">
                 {section.icon}
               </div>
               <h3 className={`text-xl font-black uppercase tracking-tight ${section.color}`}>{section.title}</h3>
             </div>
             <div className={`text-slate-400 font-semibold ${textClasses}`}>{section.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StimpCalculator: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [sDownFt, setSDownFt] = useState(0);
  const [sDownIn, setSDownIn] = useState(0);
  const [sUpFt, setSUpFt] = useState(0);
  const [sUpIn, setSUpIn] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [slopeCat, setSlopeCat] = useState<string | null>(null);
  const [slopeSub, setSlopeSub] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const calculate = () => {
    const sDownTotal = sDownFt + sDownIn / 12;
    const sUpTotal = sUpFt + sUpIn / 12;
    if (sDownTotal + sUpTotal === 0) return;
    const corrected = (2 * sDownTotal * sUpTotal) / (sDownTotal + sUpTotal);
    setResult(corrected);

    // Corrected ratio calculation logic
    if (sUpTotal > 0) {
      const ratioValue = sDownTotal / sUpTotal;
      if (ratioValue < 2) {
        setSlopeCat("<2'");
        setSlopeSub("RF/GS");
      } else if (ratioValue <= 3) {
        setSlopeCat("2'-3'");
        setSlopeSub("MC/MS");
      } else {
        setSlopeCat(">3'");
        setSlopeSub("HC/SS");
      }
    }
    
    // Auto-scroll to result
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const adjustValue = (val: number, set: (v: number) => void, inc: number, min: number, max: number) => {
    const next = val + inc;
    if (next >= min && next <= max) set(next);
  };

  const formatResult = (val: number) => {
    const ft = Math.floor(val);
    const inches = Math.round((val - ft) * 12);
    // Handle carry over if inches rounds to 12
    if (inches === 12) {
      return `${ft + 1}' 0"`;
    }
    return `${ft}' ${inches}"`;
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-[#020617] flex flex-col p-4 overflow-y-auto no-scrollbar">
      <div className="flex justify-between items-center mb-4 mt-2">
        <button onClick={onClose} className="bg-slate-800 border border-white/20 px-5 py-3 rounded-full flex items-center gap-2 shadow-2xl active:scale-95 transition-all">
          <ChevronLeft size={18} className="text-emerald-400" />
          <span className="text-[11px] uppercase tracking-widest font-semibold text-blue-500">Home</span>
        </button>
        <h1 className="text-3xl tracking-tighter font-semibold text-blue-500">Sloping Greens</h1>
      </div>

      <div className="flex flex-col items-center mb-6">
        <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest text-center">Speed correction for sloping greens</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* S(down) Input Area */}
        <div className="bg-slate-900/50 border border-white/5 rounded-[1.8rem] p-4">
          <h3 className="text-lg font-black text-orange-400 uppercase tracking-tight mb-4">S(down) Distance</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase">Feet</span>
              <div className="flex items-stretch bg-slate-800/80 rounded-[1.2rem] overflow-hidden border border-white/5 w-full h-[120px]">
                <div className="flex-1 flex items-center justify-center bg-slate-900/40">
                  <span className="text-3xl font-black tabular-nums">{sDownFt}</span>
                </div>
                <div className="w-16 flex flex-col border-l border-white/5">
                  <button onClick={() => adjustValue(sDownFt, setSDownFt, 1, 0, 50)} className="flex-1 flex items-center justify-center text-blue-400 active:bg-blue-500/10 transition-colors"><ChevronUp size={28} /></button>
                  <button onClick={() => adjustValue(sDownFt, setSDownFt, -1, 0, 50)} className="flex-1 flex items-center justify-center text-blue-400 active:bg-blue-500/10 transition-colors"><ChevronDown size={28} /></button>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase">Inches</span>
              <div className="flex items-stretch bg-slate-800/80 rounded-[1.2rem] overflow-hidden border border-white/5 w-full h-[120px]">
                <div className="flex-1 flex items-center justify-center bg-slate-900/40">
                  <span className="text-3xl font-black tabular-nums">{sDownIn}</span>
                </div>
                <div className="w-16 flex flex-col border-l border-white/5">
                  <button onClick={() => adjustValue(sDownIn, setSDownIn, 3, 0, 9)} className="flex-1 flex items-center justify-center text-blue-400 active:bg-blue-500/10 transition-colors"><ChevronUp size={28} /></button>
                  <button onClick={() => adjustValue(sDownIn, setSDownIn, -3, 0, 9)} className="flex-1 flex items-center justify-center text-blue-400 active:bg-blue-500/10 transition-colors"><ChevronDown size={28} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* S(up) Input Area */}
        <div className="bg-slate-900/50 border border-white/5 rounded-[1.8rem] p-4">
          <h3 className="text-lg font-black text-emerald-400 uppercase tracking-tight mb-4">S(up) Distance</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase">Feet</span>
              <div className="flex items-stretch bg-slate-800/80 rounded-[1.2rem] overflow-hidden border border-white/5 w-full h-[120px]">
                <div className="flex-1 flex items-center justify-center bg-slate-900/40">
                  <span className="text-3xl font-black tabular-nums">{sUpFt}</span>
                </div>
                <div className="w-16 flex flex-col border-l border-white/5">
                  <button onClick={() => adjustValue(sUpFt, setSUpFt, 1, 0, 50)} className="flex-1 flex items-center justify-center text-blue-400 active:bg-blue-500/10 transition-colors"><ChevronUp size={28} /></button>
                  <button onClick={() => adjustValue(sUpFt, setSUpFt, -1, 0, 50)} className="flex-1 flex items-center justify-center text-blue-400 active:bg-blue-500/10 transition-colors"><ChevronDown size={28} /></button>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase">Inches</span>
              <div className="flex items-stretch bg-slate-800/80 rounded-[1.2rem] overflow-hidden border border-white/5 w-full h-[120px]">
                <div className="flex-1 flex items-center justify-center bg-slate-900/40">
                  <span className="text-3xl font-black tabular-nums">{sUpIn}</span>
                </div>
                <div className="w-16 flex flex-col border-l border-white/5">
                  <button onClick={() => adjustValue(sUpIn, setSUpIn, 3, 0, 9)} className="flex-1 flex items-center justify-center text-blue-400 active:bg-blue-500/10 transition-colors"><ChevronUp size={28} /></button>
                  <button onClick={() => adjustValue(sUpIn, setSUpIn, -3, 0, 9)} className="flex-1 flex items-center justify-center text-blue-400 active:bg-blue-500/10 transition-colors"><ChevronDown size={28} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Calculation Action */}
        <div className="flex flex-col gap-4 mt-2 mb-12">
          <button 
            onClick={calculate} 
            disabled={(sDownFt === 0 && sDownIn === 0) || (sUpFt === 0 && sUpIn === 0)}
            className="w-full bg-blue-600 border-2 border-blue-500 rounded-full py-4 font-black text-xs tracking-[0.2em] uppercase text-white shadow-xl shadow-blue-600/20 active:scale-95 disabled:opacity-30 disabled:grayscale transition-all"
          >
            Calculate Speed
          </button>

          {result !== null && (
            <div ref={resultRef} className="bg-white/[0.04] border border-blue-500/30 rounded-[1.8rem] p-6 flex flex-col items-start animate-in zoom-in-95 duration-300">
              <span className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em] mb-2 w-full text-left">Corrected Green Speed</span>
              <div className="text-5xl font-black text-white tabular-nums leading-none mb-1 flex items-center justify-between w-full">
                <span className="text-left">{formatResult(result)}</span>
                {slopeCat && (
                  <div className="flex flex-col items-center">
                    <span className="text-2xl text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-xl border border-yellow-400/20 tabular-nums">({slopeCat})</span>
                    {slopeSub && <span className="text-[14px] font-black text-yellow-500 uppercase mt-1 tracking-widest">{slopeSub}</span>}
                  </div>
                )}
              </div>
              <div className="mt-6 pt-6 border-t border-white/10 w-full flex justify-center">
                <p className="text-[14px] font-light text-white leading-relaxed tracking-tight text-center">
                  (2x<span className="text-orange-400 font-semibold">S(down)</span> x <span className="text-emerald-400 font-semibold">S(up)</span>)÷(<span className="text-orange-400 font-semibold">S(down)</span>+<span className="text-emerald-400 font-semibold">S(up)</span>)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('landing');
  const [units, setUnits] = useState<UnitSystem>('Yards');
  const [mapStyle, setMapStyle] = useState<'Street' | 'Satellite'>('Satellite');
  const [pos, setPos] = useState<GeoPoint | null>(null);
  const [history, setHistory] = useState<SavedRecord[]>([]);
  const [viewingRecord, setViewingRecord] = useState<SavedRecord | null>(null);

  const [trkActive, setTrkActive] = useState(false);
  const [trkPoints, setTrkPoints] = useState<GeoPoint[]>([]);
  const [trkPivotsArray, setTrkPivotsArray] = useState<GeoPoint[]>([]);
  const [holeNum, setHoleNum] = useState(1);
  
  const [mapActive, setMapActive] = useState(false);
  const [mapCompleted, setMapCompleted] = useState(false);
  const [mapPoints, setMapPoints] = useState<GeoPoint[]>([]);
  const [isBunker, setIsBunker] = useState(false);

  const CONCAVITY_FIXED = 0.82;

  useEffect(() => {
    const saved = localStorage.getItem('scottish_golf_rating_toolkit_final');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Parse error", e);
      }
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => setPos({ 
        lat: p.coords.latitude, 
        lng: p.coords.longitude, 
        alt: p.coords.altitude, 
        accuracy: p.coords.accuracy, 
        altAccuracy: p.coords.altitudeAccuracy, 
        timestamp: Date.now() 
      }),
      (err) => {
        console.error("Location error:", err);
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const saveRecord = useCallback((record: Omit<SavedRecord, 'id' | 'date'>) => {
    const newRecord: SavedRecord = { ...record, id: Math.random().toString(36).substr(2, 9), date: Date.now() };
    const updated = [newRecord, ...history];
    setHistory(updated);
    localStorage.setItem('scottish_golf_rating_toolkit_final', JSON.stringify(updated));
  }, [history]);

  const analysis = useMemo(() => {
    const pts = viewingRecord?.type === 'Green' ? viewingRecord.points : mapPoints;
    if (!pts || pts.length < 2) return null;
    let perimeter = 0, bunkerLength = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = calculateDistance(pts[i], pts[i+1]);
      perimeter += d; if (pts[i+1].type === 'bunker') bunkerLength += d;
    }
    if (mapCompleted || (viewingRecord && viewingRecord.type === 'Green')) {
      perimeter += calculateDistance(pts[pts.length-1], pts[0]);
    }
    const shape = (pts.length >= 3 && (mapCompleted || viewingRecord)) ? analyzeGreenShape(pts, CONCAVITY_FIXED) : null;
    return { area: calculateArea(pts), perimeter, bunkerPct: perimeter > 0 ? Math.round((bunkerLength / perimeter) * 100) : 0, shape };
  }, [mapPoints, mapCompleted, viewingRecord]);

  const handleFinalizeGreen = useCallback(() => {
    if (mapPoints.length < 3) return;
    const shape = analyzeGreenShape(mapPoints, CONCAVITY_FIXED);
    const areaVal = Math.round(calculateArea(mapPoints) * (units === 'Yards' ? 1.196 : 1));
    
    let egdStr = "--";
    const s = shape as any;
    if (s) {
      if (s.anomalousResult && s.anomalousResult.isManualReq) {
        egdStr = "MANUAL REQ";
      } else if (s.isLShape) {
        egdStr = `${s.s1?.egd} / ${s.s2?.egd} yd`;
      } else {
        egdStr = `${s.egd} yd`;
      }
    }

    saveRecord({ 
      type: 'Green', 
      primaryValue: `${areaVal}${units === 'Yards' ? 'yd²' : 'm²'}`, 
      secondaryValue: `Bunker: ${analysis?.bunkerPct}%`, 
      egdValue: egdStr,
      points: mapPoints,
      holeNumber: holeNum 
    });
    setMapActive(false); setMapCompleted(true);
  }, [mapPoints, units, analysis, saveRecord, holeNum]);

  useEffect(() => {
    if (mapActive && pos) {
      setMapPoints(prev => {
        const last = prev[prev.length - 1];
        if (!last || calculateDistance(last, pos) >= 0.4) return [...prev, { ...pos, type: isBunker ? 'bunker' : 'green' }];
        return prev;
      });
      if (mapPoints.length > 20 && calculateDistance(pos, mapPoints[0]) < 0.9) handleFinalizeGreen();
    }
  }, [pos, mapActive, isBunker, mapPoints.length, handleFinalizeGreen]);

  const trkMetrics = useMemo(() => {
    if (!trkActive && !viewingRecord) return { dist: 0, elev: 0 };
    if (viewingRecord && viewingRecord.type === 'Track') {
       let d = 0;
       for (let i = 0; i < viewingRecord.points.length - 1; i++) {
         d += calculateDistance(viewingRecord.points[i], viewingRecord.points[i+1]);
       }
       const startAlt = viewingRecord.points[0]?.alt || 0;
       const endAlt = viewingRecord.points[viewingRecord.points.length-1]?.alt || 0;
       return { dist: d, elev: endAlt - startAlt };
    }
    if (trkPoints.length < 1 && !pos) return { dist: 0, elev: 0 };
    let d = 0;
    const segments = [trkPoints[0], ...trkPivotsArray];
    if (segments.length > 1) {
      for (let i = 0; i < segments.length - 1; i++) {
        d += calculateDistance(segments[i], segments[i+1]);
      }
    }
    const lastAnchor = segments[segments.length - 1];
    if (trkActive && pos && lastAnchor) {
      d += calculateDistance(lastAnchor, pos);
    }
    const startAlt = trkPoints[0]?.alt || pos?.alt || 0;
    const currAlt = pos?.alt || (trkPoints.length > 0 ? trkPoints[trkPoints.length-1].alt : 0) || 0;
    return { dist: d, elev: currAlt - startAlt };
  }, [trkPoints, trkPivotsArray, trkActive, pos, viewingRecord]);

  const distMult = units === 'Yards' ? 1.09361 : 1.0;
  const elevMult = units === 'Yards' ? 3.28084 : 1.0;

  const exportKML = () => {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Scottish Golf Export</name>`;
    history.forEach(item => {
      const coords = item.points.map(p => `${p.lng},${p.lat},${p.alt || 0}`).join(' ');
      kml += `
    <Placemark>
      <name>${item.type} - Hole ${item.holeNumber || '?'}</name>
      <description>Hole:${item.holeNumber || '?'}</description>
      ${item.type === 'Green' ? `
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${coords} ${item.points[0].lng},${item.points[0].lat},${item.points[0].alt || 0}</coordinates></LinearRing></outerBoundaryIs></Polygon>` : `
      <LineString><coordinates>${coords}</coordinates></LineString>`}
    </Placemark>`;
    });
    kml += `</Document></kml>`;
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ScottishGolf_Export.kml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importKML = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const placemarks = xmlDoc.getElementsByTagName("Placemark");
      const newItems: SavedRecord[] = [];
      for (let i = 0; i < placemarks.length; i++) {
        const p = placemarks[i];
        const polygonNode = p.getElementsByTagName("Polygon")[0];
        const coordsNode = p.getElementsByTagName("coordinates")[0];
        const descNode = p.getElementsByTagName("description")[0];
        const coordsStr = coordsNode?.textContent || "";
        const descStr = descNode?.textContent || "";
        
        let extractedHole = 0;
        const holeMatch = descStr.match(/Hole:(\d+)/);
        if (holeMatch) {
          extractedHole = parseInt(holeMatch[1]);
        } else {
          const nameNode = p.getElementsByTagName("name")[0];
          const nameMatch = nameNode?.textContent?.match(/Hole\s+(\d+)/);
          if (nameMatch) extractedHole = parseInt(nameMatch[1]);
        }

        const points: GeoPoint[] = coordsStr.trim().split(/\s+/).map(c => {
          const parts = c.split(',').map(Number);
          return { lat: parts[1], lng: parts[0], alt: parts[2] || 0, accuracy: 0, altAccuracy: 0, timestamp: Date.now() };
        });
        if (points.length < 2) continue;
        const isPolygon = !!polygonNode;
        const isActuallyGreen = isPolygon || points.length > 5;
        const record: SavedRecord = {
          id: Math.random().toString(36).substr(2, 9),
          date: Date.now() - (i * 1000),
          type: isActuallyGreen ? 'Green' : 'Track',
          points,
          primaryValue: 'Imported',
          secondaryValue: 'KML Data',
          holeNumber: extractedHole > 0 ? extractedHole : undefined
        };
        if (isActuallyGreen) {
          const area = calculateArea(points);
          const egdObj = analyzeGreenShape(points, CONCAVITY_FIXED) as any;
          record.primaryValue = `${Math.round(area * (units === 'Yards' ? 1.196 : 1))}${units === 'Yards' ? 'yd²' : 'm²'}`;
          
          if (egdObj && egdObj.anomalousResult && egdObj.anomalousResult.isManualReq) {
            record.egdValue = "MANUAL REQ";
          } else {
            record.egdValue = egdObj?.isLShape ? `${egdObj.s1?.egd} / ${egdObj.s2?.egd} yd` : (egdObj ? `${egdObj.egd} yd` : '--');
          }
          record.secondaryValue = `Bunker: 0%`;
        } else {
          let totalDist = 0;
          for (let k = 0; k < points.length - 1; k++) totalDist += calculateDistance(points[k], points[k+1]);
          record.primaryValue = `${(totalDist * distMult).toFixed(1)}${units === 'Yards' ? 'yd' : 'm'}`;
          record.secondaryValue = `Elev: 0.0${units === 'Yards' ? 'ft' : 'm'}`;
        }
        newItems.push(record);
      }
      if (newItems.length > 0) {
        const updated = [...newItems, ...history];
        setHistory(updated);
        localStorage.setItem('scottish_golf_rating_toolkit_final', JSON.stringify(updated));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleOpenRecord = (record: SavedRecord) => {
    setViewingRecord(record);
    if (record.holeNumber) setHoleNum(record.holeNumber);
    if (record.type === 'Track') {
      setView('track');
      setTrkActive(false);
      setTrkPoints([]);
    } else {
      setView('green');
      setMapActive(false);
      setMapCompleted(true);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#020617] text-white overflow-hidden absolute inset-0 select-none font-sans">
      <div className="h-[env(safe-area-inset-top)] bg-[#0f172a] shrink-0"></div>
      
      {view === 'landing' ? (
        <div className="flex-1 flex flex-col p-6 overflow-y-auto no-scrollbar animate-in fade-in duration-700">
          <header className="mb-12 mt-8 flex flex-col items-center text-center">
            <h1 className="text-5xl tracking-tighter font-semibold text-blue-500">Scottish Golf</h1>
            <p className="text-white text-[11px] font-bold tracking-[0.4em] uppercase mt-2 opacity-80">Course Rating Toolkit (ALPHA)</p>
          </header>

          <div className="flex flex-col gap-6">
            <button onClick={() => { setViewingRecord(null); setTrkPoints([]); setTrkPivotsArray([]); setView('track'); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center justify-center shadow-2xl active:bg-slate-800 active:scale-95 transition-all">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-blue-600/40"><Navigation2 size={28} /></div>
              <h2 className="text-2xl font-black mb-2 uppercase text-blue-500">Distance tracker</h2>
              <p className="text-slate-400 text-[11px] font-medium text-center max-w-[220px] leading-relaxed">Real-time distance measurement and elevation change</p>
            </button>
            <button onClick={() => { setViewingRecord(null); setMapPoints([]); setMapCompleted(false); setView('green'); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center justify-center shadow-2xl active:bg-slate-800 active:scale-95 transition-all">
              <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-600/40"><Target size={28} /></div>
              <h2 className="text-2xl font-black mb-2 uppercase text-emerald-500">Green Mapper</h2>
              <p className="text-slate-400 text-[11px] font-medium text-center max-w-[220px] leading-relaxed">Green mapping, bunker proportion and Effective Green Diameter calculation</p>
            </button>
            <button onClick={() => { setViewingRecord(null); setView('stimp'); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center justify-center shadow-2xl active:bg-slate-800 active:scale-95 transition-all">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-blue-500/10 border border-blue-500/20"><Gauge size={28} className="text-blue-500" /></div>
              <h2 className="text-2xl font-black mb-2 uppercase text-blue-400">Stimp Slopes</h2>
              <p className="text-slate-400 text-[11px] font-medium text-center max-w-[220px] leading-relaxed">Speed correction for sloping greens</p>
            </button>

            <button onClick={() => setView('manual')} className="mt-2 bg-slate-800/50 border border-white/10 rounded-[1.8rem] py-6 flex items-center justify-center gap-4 active:bg-slate-700 transition-colors">
              <BookOpen size={20} className="text-blue-400" />
              <span className="text-[11px] font-black uppercase tracking-widest text-white">User Manual</span>
            </button>

            <div className="flex gap-4 mt-2">
               <button onClick={exportKML} className="flex-1 bg-slate-800/50 border border-blue-500/20 rounded-[1.8rem] py-6 flex items-center justify-center gap-3 active:bg-slate-700 transition-colors shadow-lg">
                <Download size={18} className="text-blue-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Export KML</span>
              </button>
              <label className="flex-1 bg-slate-800/50 border border-emerald-500/20 rounded-[1.8rem] py-6 flex items-center justify-center gap-3 active:bg-slate-700 transition-colors shadow-lg cursor-pointer">
                <Upload size={18} className="text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Import KML</span>
                <input type="file" accept=".kml" onChange={importKML} className="hidden" />
              </label>
            </div>
          </div>
          
          <footer className="mt-auto pb-6 pt-12">
            {history.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 px-2 mb-4">
                  <Info size={12} className="text-blue-400" />
                  <span className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Assessment History</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                  {history.map(item => (
                    <div key={item.id} className="relative shrink-0">
                      <button onClick={() => handleOpenRecord(item)} className="bg-slate-900 border border-white/10 px-6 py-5 rounded-[2rem] flex flex-col min-w-[170px] text-left shadow-lg active:scale-95 transition-transform">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{item.type} {item.holeNumber && ` - Hole ${item.holeNumber}`}</span>
                          {item.type === 'Green' ? <Target size={12} className="text-emerald-500/60" /> : <Navigation2 size={12} className="text-blue-500/60" />}
                        </div>
                        <span className="text-xl font-black text-white">{item.primaryValue}</span>
                        <span className="text-[11px] font-bold text-slate-400 mt-1">{item.egdValue || item.secondaryValue}</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setHistory(h => h.filter(x => x.id !== item.id)); }} className="absolute -top-2 -right-2 w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border-2 border-[#020617] text-white shadow-xl active:scale-90"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </footer>
        </div>
      ) : view === 'manual' ? (
        <UserManual onClose={() => setView('landing')} />
      ) : view === 'stimp' ? (
        <StimpCalculator onClose={() => setView('landing')} />
      ) : (
        <div className="flex-1 flex flex-col relative animate-in slide-in-from-right duration-300">
          <div className="absolute top-0 left-0 right-0 z-[1000] p-4 flex justify-between pointer-events-none">
            <button onClick={() => { setView('landing'); setTrkActive(false); setMapActive(false); setViewingRecord(null); }} className="pointer-events-auto bg-slate-800 border border-white/20 px-5 py-3 rounded-full flex items-center gap-2 shadow-2xl active:scale-95 transition-all">
              <ChevronLeft size={18} className="text-emerald-400" />
              <span className="text-[11px] uppercase tracking-widest font-semibold text-blue-500">Home</span>
            </button>
            <div className="flex gap-2">
              {((view === 'track' && trkActive) || (view === 'green' && mapActive) || viewingRecord) && (
                <div className="pointer-events-auto bg-slate-800 border border-white/20 w-[46px] h-[46px] rounded-full flex items-center justify-center shadow-2xl">
                   <span className="text-xl font-black text-blue-400 tabular-nums">{holeNum}</span>
                </div>
              )}
              <button onClick={() => setUnits(u => u === 'Yards' ? 'Metres' : 'Yards')} className="pointer-events-auto bg-slate-800 border border-white/20 p-3.5 rounded-full text-emerald-400 shadow-2xl active:scale-90"><Ruler size={20} /></button>
              <button onClick={() => setMapStyle(s => s === 'Street' ? 'Satellite' : 'Street')} className="pointer-events-auto bg-slate-800 border border-white/20 p-3.5 rounded-full text-blue-400 shadow-2xl active:scale-90"><Layers size={20} /></button>
            </div>
          </div>
          
          <main className="flex-1">
            <MapContainer center={[0, 0]} zoom={2} className="h-full w-full" zoomControl={false} attributionControl={false} style={{ backgroundColor: '#020617' }}>
              <TileLayer url={mapStyle === 'Street' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} maxZoom={22} maxNativeZoom={19} />
              <MapController pos={pos} active={trkActive || mapActive} mapPoints={mapPoints} completed={mapCompleted} viewingRecord={viewingRecord} mode={view} />
              {pos && !viewingRecord && <CircleMarker center={[pos.lat, pos.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 1, weight: 2.5 }} />}
              {view === 'track' && (viewingRecord?.pivots || trkPivotsArray).map((p, i) => <CircleMarker key={i} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: '#fff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }} />)}
              {view === 'track' && (trkPoints.length > 0 || trkActive || viewingRecord) && (
                <Polyline positions={(viewingRecord ? viewingRecord.points : [trkPoints[0], ...trkPivotsArray, ...(pos && trkActive ? [pos] : [])]).filter(Boolean).map(p => [p.lat, p.lng])} color="#3b82f6" weight={5} />
              )}
              {view === 'green' && (viewingRecord?.points || mapPoints).length > 1 && (
                <>
                  <Polygon positions={(viewingRecord?.points || mapPoints).map(p => [p.lat, p.lng])} fillColor="#10b981" fillOpacity={0.1} weight={0} />
                  {(viewingRecord?.points || mapPoints).map((p, i, arr) => i > 0 && <Polyline key={i} positions={[[arr[i-1].lat, arr[i-1].lng], [p.lat, p.lng]]} color={p.type === 'bunker' ? '#facc15' : '#10b981'} weight={p.type === 'bunker' ? 7 : 4} />)}
                  {(viewingRecord || mapCompleted) && analysis?.shape && (
                    <>
                      {(analysis.shape as any).anomalousResult ? (
                        <>
                          <Polyline positions={(analysis.shape as any).anomalousResult.spine.map((p: any) => [p.lat, p.lng])} color="#22d3ee" weight={5} />
                          {(analysis.shape as any).anomalousResult.widths.map((w: any, idx: number) => (
                            <Polyline key={`sampling-${idx}`} positions={[[w.p1.lat, w.p1.lng], [w.p2.lat, w.p2.lng]]} color={w.color} weight={4} dashArray="5, 10" />
                          ))}
                        </>
                      ) : (
                        <>
                          {!analysis.shape.isLShape && analysis.shape.pA && (
                            <>
                              <Polyline positions={[[analysis.shape.pA.lat, analysis.shape.pA.lng], [analysis.shape.pB.lat, analysis.shape.pB.lng]]} color="#22d3ee" weight={5} />
                              {analysis.shape.isInconsistent ? (
                                <>
                                  <Polyline positions={[[analysis.shape.pC1.lat, analysis.shape.pC1.lng], [analysis.shape.pD1.lat, analysis.shape.pD1.lng]]} color="#facc15" weight={5} />
                                  <Polyline positions={[[analysis.shape.pC3.lat, analysis.shape.pC3.lng], [analysis.shape.pD3.lat, analysis.shape.pD3.lng]]} color="#facc15" weight={5} />
                                </>
                              ) : (
                                <Polyline positions={[[analysis.shape.pC.lat, analysis.shape.pC.lng], [analysis.shape.pD.lat, analysis.shape.pD.lng]]} color="#facc15" weight={5} />
                              )}
                            </>
                          )}
                          {analysis.shape.isLShape && (
                            <>
                              {analysis.shape.s1?.pA && (
                                <>
                                  <Polyline positions={[[analysis.shape.s1.pA.lat, analysis.shape.s1.pA.lng], [analysis.shape.s1.pB.lat, analysis.shape.s1.pB.lng]]} color="#22d3ee" weight={5} opacity={0.6} />
                                  <Polyline positions={[[analysis.shape.s1.pC.lat, analysis.shape.s1.pC.lng], [analysis.shape.s1.pD.lat, analysis.shape.s1.pD.lng]]} color="#facc15" weight={6} />
                                </>
                              )}
                              {analysis.shape.s2?.pA && (
                                <>
                                  <Polyline positions={[[analysis.shape.s2.pA.lat, analysis.shape.s2.pA.lng], [analysis.shape.s2.pB.lat, analysis.shape.s2.pB.lng]]} color="#22d3ee" weight={5} opacity={0.6} />
                                  <Polyline positions={[[analysis.shape.s2.pC.lat, analysis.shape.s2.pC.lng], [analysis.shape.s2.pD.lat, analysis.shape.s2.pD.lng]]} color="#ea580c" weight={6} />
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </MapContainer>
          </main>

          <div className="absolute inset-x-0 bottom-0 z-[1000] p-4 pointer-events-none flex flex-col gap-2 items-center pb-12">
            <div className="flex flex-col gap-2 w-full max-w-[340px]">
              <div className="pointer-events-auto bg-slate-900/95 border border-white/20 rounded-[2.8rem] px-6 py-3 w-full shadow-2xl backdrop-blur-md">
                {view === 'track' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center flex flex-col items-center">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2 leading-none">{viewingRecord ? 'LOG DATA' : 'DISTANCE'}</span>
                      <div className="text-4xl font-black text-emerald-400 tabular-nums leading-none tracking-tighter">{(trkMetrics.dist * distMult).toFixed(1)}<span className="text-[10px] ml-1 opacity-40 uppercase">{units === 'Yards' ? 'YD' : 'M'}</span></div>
                    </div>
                    <div className="text-center border-l border-white/10 flex flex-col items-center">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2 leading-none">ELEVATION</span>
                      <div className="text-4xl font-black text-yellow-400 tabular-nums leading-none tracking-tighter">{(trkMetrics.elev * elevMult).toFixed(1)}<span className="text-[10px] ml-1 opacity-40 uppercase">{units === 'Yards' ? 'FT' : 'M'}</span></div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div className="text-center"><span className="text-white/40 text-[8px] font-black uppercase block mb-1 tracking-widest">Sq. Area</span><div className="text-2xl font-black text-emerald-400 tabular-nums">{Math.round((analysis?.area || 0) * (units === 'Yards' ? 1.196 : 1))}<span className="text-[9px] ml-0.5 opacity-40 uppercase">{units === 'Yards' ? 'YD²' : 'M²'}</span></div></div>
                      <div className="text-center"><span className="text-white/40 text-[8px] font-black uppercase block mb-1 tracking-widest">Perimeter</span><div className="text-2xl font-black text-blue-400 tabular-nums">{((analysis?.perimeter || 0) * distMult).toFixed(1)}<span className="text-[9px] ml-0.5 opacity-40 uppercase">{units === 'Yards' ? 'YD' : 'M'}</span></div></div>
                      <div className="text-center"><span className="text-white/40 text-[8px] font-black uppercase block mb-1 tracking-widest">Bunker%</span><div className="text-2xl font-black text-orange-400 tabular-nums">{analysis?.bunkerPct || 0}%</div></div>
                    </div>
                    {analysis?.shape && (
                      <div className="bg-white/[0.04] rounded-[2rem] px-5 py-2 border border-white/10 shadow-inner">
                         <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.2em]">EGD: {analysis.shape.method}</span>
                            {analysis.shape.isLShape && analysis.shape.hasAnomaly && !(analysis.shape as any).anomalousResult && (
                              <div className="flex items-center gap-1.5 animate-pulse">
                                <AlertCircle size={10} className="text-red-500" />
                                <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Anomaly</span>
                              </div>
                            )}
                         </div>

                         {(analysis.shape as any).anomalousResult ? (
                           <div className="flex flex-col items-center py-1">
                              <div className="w-full flex justify-between px-2 text-[10px] font-black">
                                 <div className="flex items-center gap-1.5">
                                    <span className="text-slate-500 uppercase">L (Curved):</span>
                                    <span className="text-cyan-400 text-xl">{(analysis.shape as any).anomalousResult.curvedLength.toFixed(1)}</span>
                                 </div>
                                 <div className="flex items-center gap-1.5">
                                    <span className="text-slate-500 uppercase">L (Straight):</span>
                                    <span className="text-white/60 text-xl">{(analysis.shape as any).anomalousResult.straightLength.toFixed(1)}</span>
                                 </div>
                              </div>
                              <div className="w-full flex justify-around px-2 mt-2 text-[11px] font-black">
                                 <div className="flex items-center gap-1">
                                    <span className="text-slate-500 uppercase text-[8px]">W1:</span>
                                    <span className="text-xl" style={{ color: (analysis.shape as any).anomalousResult.widths[0]?.color }}>{(analysis.shape as any).anomalousResult.widths[0]?.w.toFixed(1)}</span>
                                 </div>
                                 <div className="flex items-center gap-1">
                                    <span className="text-slate-500 uppercase text-[8px]">W2:</span>
                                    <span className="text-xl" style={{ color: (analysis.shape as any).anomalousResult.widths[1]?.color }}>{(analysis.shape as any).anomalousResult.widths[1]?.w.toFixed(1)}</span>
                                 </div>
                                 <div className="flex items-center gap-1">
                                    <span className="text-slate-500 uppercase text-[8px]">W3:</span>
                                    <span className="text-xl" style={{ color: (analysis.shape as any).anomalousResult.widths[2]?.color }}>{(analysis.shape as any).anomalousResult.widths[2]?.w.toFixed(1)}</span>
                                 </div>
                              </div>
                           </div>
                         ) : analysis.shape.isLShape ? (
                           <div className="flex items-center justify-around gap-2">
                             <div className="text-center border-r border-white/10 pr-6 flex flex-col items-center">
                               <div className="text-4xl font-black text-yellow-400 tabular-nums leading-none">{analysis.shape.s1?.egd}<span className="text-[10px] ml-1 opacity-40 uppercase">YD</span></div>
                               <div className="text-[8px] font-black text-yellow-500/80 uppercase mt-1 tracking-widest leading-none">L:{analysis.shape.s1?.L.toFixed(1)} W:{analysis.shape.s1?.W.toFixed(1)}</div>
                             </div>
                             <div className="text-center pl-6 flex flex-col items-center">
                               <div className="text-4xl font-black text-orange-500 tabular-nums leading-none">{analysis.shape.s2?.egd}<span className="text-[10px] ml-1 opacity-40 uppercase">YD</span></div>
                               <div className="text-[8px] font-black text-orange-600/80 uppercase mt-1 tracking-widest leading-none">L:{analysis.shape.s2?.L.toFixed(1)} W:{analysis.shape.s2?.W.toFixed(1)}</div>
                             </div>
                           </div>
                         ) : (
                           <div className="text-center py-0.5 flex flex-col items-center">
                             <div className="text-6xl font-black text-yellow-400 tabular-nums leading-none">{analysis.shape.egd}<span className="text-base ml-1 opacity-40 uppercase">YD</span></div>
                             <div className="text-[9px] text-white font-black mt-1.5 uppercase tracking-widest">
                               <span className="text-cyan-400">LONGEST: {analysis.shape.L.toFixed(1)} YD</span> | 
                               <span className="text-yellow-400 ml-1">
                                 {analysis.shape.isInconsistent ? `SHORTEST: (${analysis.shape.w1_yds.toFixed(1)} + ${analysis.shape.w3_yds.toFixed(1)}) / 2` : `SHORTEST: ${analysis.shape.W.toFixed(1)} YD`}
                               </span>
                             </div>
                           </div>
                         )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="pointer-events-auto flex flex-col gap-2 w-full">
                {viewingRecord ? (
                  <button onClick={() => { setViewingRecord(null); setView('landing'); }} className="h-14 bg-slate-800 border-2 border-white/10 rounded-full font-black text-xs tracking-[0.2em] uppercase text-white shadow-xl active:scale-95 transition-all">Close Viewer</button>
                ) : (
                  <>
                    {view === 'track' ? (
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex gap-2 w-full">
                          {!trkActive && (
                            <div className="flex-1 flex items-center justify-between bg-slate-900 border-2 border-white/10 rounded-full px-4 py-2 h-14 shadow-xl">
                              <div className="flex items-center gap-3 w-full justify-between">
                                <button 
                                  onClick={() => setHoleNum(h => Math.max(1, h - 1))}
                                  className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center border border-white/10 active:bg-blue-600 active:border-blue-500 transition-colors"
                                >
                                  <Minus size={14} />
                                </button>
                                <div className="flex flex-col items-center">
                                  <span className="text-[7px] font-black uppercase tracking-widest text-white/40">HOLE</span>
                                  <span className="text-xl font-black tabular-nums text-blue-400 leading-none">{holeNum}</span>
                                </div>
                                <button 
                                  onClick={() => setHoleNum(h => Math.min(18, h + 1))}
                                  className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center border border-white/10 active:bg-blue-600 active:border-blue-500 transition-colors"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                          <button onClick={() => { 
                            if(!trkActive) { setTrkActive(true); setTrkPoints(pos?[pos]:[]); setTrkPivotsArray([]); } 
                            else { 
                              const unitSfx = units === 'Yards' ? 'yd' : 'm';
                              const elevSfx = units === 'Yards' ? 'ft' : 'm';
                              saveRecord({ 
                                type: 'Track', 
                                primaryValue: (trkMetrics.dist * distMult).toFixed(1) + unitSfx, 
                                secondaryValue: `Elev: ${(trkMetrics.elev * elevMult).toFixed(1)}${elevSfx}`, 
                                points: [trkPoints[0], pos].filter(Boolean) as GeoPoint[], 
                                pivots: trkPivotsArray,
                                holeNumber: holeNum
                              }); 
                              setTrkActive(false); 
                            } 
                          }} className={`${trkActive ? 'flex-1' : 'flex-1'} h-14 rounded-full font-black text-xs tracking-[0.2em] uppercase border-2 shadow-xl transition-all active:scale-95 ${trkActive ? 'bg-red-600 border-red-500 text-white' : 'bg-blue-600 border-blue-500 text-white'}`}>{trkActive ? 'STOP TRACK' : 'START TRACK'}</button>
                          {trkActive && (
                            <div className="flex-[1.2] flex gap-2">
                              <button onClick={() => { if (trkPivotsArray.length < 3 && pos) setTrkPivotsArray([...trkPivotsArray, pos]); }} disabled={trkPivotsArray.length >= 3} className="flex-1 h-14 rounded-full font-black text-xs tracking-[0.1em] uppercase border-2 bg-slate-800 border-blue-500 text-blue-100 shadow-xl active:scale-95"><div className="flex items-center justify-center gap-2">PIVOT ({trkPivotsArray.length})</div></button>
                              {trkPivotsArray.length > 0 && <button onClick={() => setTrkPivotsArray(prev => prev.slice(0, -1))} className="w-14 h-14 bg-slate-800 border-2 border-slate-700/50 rounded-full flex items-center justify-center text-slate-400 active:scale-90"><RotateCcw size={18} /></button>}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex gap-2 w-full">
                          {!mapActive && (
                            <div className="flex-1 flex items-center justify-between bg-slate-900 border-2 border-white/10 rounded-full px-4 py-2 h-14 shadow-xl">
                              <div className="flex items-center gap-3 w-full justify-between">
                                <button 
                                  onClick={() => setHoleNum(h => Math.max(1, h - 1))}
                                  className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center border border-white/10 active:bg-blue-600 active:border-blue-500 transition-colors"
                                >
                                  <Minus size={14} />
                                </button>
                                <div className="flex flex-col items-center">
                                  <span className="text-[7px] font-black uppercase tracking-widest text-white/40">HOLE</span>
                                  <span className="text-xl font-black tabular-nums text-emerald-400 leading-none">{holeNum}</span>
                                </div>
                                <button 
                                  onClick={() => setHoleNum(h => Math.min(18, h + 1))}
                                  className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center border border-white/10 active:bg-blue-600 active:border-blue-500 transition-colors"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                          <button onClick={() => { if(mapActive) handleFinalizeGreen(); else { setMapPoints(pos?[pos]:[]); setMapActive(true); setMapCompleted(false); } }} className={`flex-1 h-14 rounded-full font-black text-xs tracking-[0.2em] uppercase border-2 shadow-xl active:scale-95 ${mapActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-emerald-600 border-emerald-500 text-white'}`}>{mapActive ? 'CLOSE' : 'START GREEN'}</button>
                          {mapActive && <button onPointerDown={() => setIsBunker(true)} onPointerUp={() => setIsBunker(false)} onPointerLeave={() => setIsBunker(false)} className={`flex-1 h-14 rounded-full font-black text-xs tracking-[0.1em] uppercase border-2 transition-all shadow-xl ${isBunker ? 'bg-orange-600 border-orange-500 text-white scale-105' : 'bg-slate-800 border-orange-500/50 text-orange-400'}`}>BUNKER (HOLD)</button>}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`.leaflet-tile-pane { filter: brightness(0.8) contrast(1.1) saturate(0.85); }.no-scrollbar::-webkit-scrollbar { display: none; }.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}