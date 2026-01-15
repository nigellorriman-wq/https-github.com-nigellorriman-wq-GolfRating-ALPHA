import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, CircleMarker, Polyline, Circle, useMap, Polygon } from 'react-leaflet';
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
  Upload
} from 'lucide-react';

/** --- TYPES --- **/
type AppView = 'landing' | 'track' | 'green';
type UnitSystem = 'Yards' | 'Metres';

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
}

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

const getEGDAnalysis = (points: GeoPoint[]) => {
  if (points.length < 2) return null;
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
  const toX = (p: GeoPoint) => p.lng * Math.PI / 180 * R * Math.cos(latRef);
  const toY = (p: GeoPoint) => p.lat * Math.PI / 180 * R;
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

  let minP = 0, maxP = 0;
  points.forEach(p => {
    const px = toX(p), py = toY(p);
    const perpDist = ((xB - xA) * (yA - py) - (xA - px) * (yB - yA)) / mag;
    if (perpDist < minP) minP = perpDist;
    if (perpDist > maxP) maxP = perpDist;
  });

  const widthMeters = Math.abs(maxP) + Math.abs(minP);
  const L_yds = maxD * 1.09361;
  const W_yds = widthMeters * 1.09361;
  const ratio = W_yds === 0 ? 0 : L_yds / W_yds;
  
  let egd_yds = 0;
  if (ratio >= 3) egd_yds = (3 * W_yds + L_yds) / 4;
  else if (ratio >= 2) egd_yds = (2 * W_yds + L_yds) / 3;
  else egd_yds = (L_yds + W_yds) / 2;
  
  const ax = xA + dx * 0.5, ay = yA + dy * 0.5;
  const ux = dx / mag, uy = dy / mag;
  const nx = -uy, ny = ux; 
  const pC = fromXY(ax + nx * maxP, ay + ny * maxP);
  const pD = fromXY(ax + nx * minP, ay + ny * minP);

  return { 
    egd: Math.round(egd_yds * 10) / 10, 
    L: L_yds, 
    W: W_yds, 
    ratio, pA, pB, pC, pD 
  };
};

const analyzeGreenShape = (points: GeoPoint[]) => {
  if (points.length < 3) return null;
  const basic = getEGDAnalysis(points);
  if (!basic) return null;

  const polyArea = calculateArea(points);
  const hullArea = calculateArea(getConvexHull(points));
  const concavity = hullArea > 0 ? polyArea / hullArea : 1;
  
  const isLShape = concavity < 0.82 || basic.ratio > 3.6;

  if (isLShape) {
    let elbowIdx = 0;
    let maxElbowDist = -1;
    const R = 6371e3;
    const latRef = basic.pA.lat * Math.PI / 180;
    const xA = basic.pA.lng * Math.PI / 180 * R * Math.cos(latRef), yA = basic.pA.lat * Math.PI / 180 * R;
    const xB = basic.pB.lng * Math.PI / 180 * R * Math.cos(latRef), yB = basic.pB.lat * Math.PI / 180 * R;
    const dx = xB - xA, dy = yB - yA;
    const mag = Math.sqrt(dx * dx + dy * dy);

    points.forEach((p, idx) => {
      const px = p.lng * Math.PI / 180 * R * Math.cos(latRef), py = p.lat * Math.PI / 180 * R;
      const dist = Math.abs((xB - xA) * (yA - py) - (xA - px) * (yB - yA)) / mag;
      if (dist > maxElbowDist) {
        maxElbowDist = dist;
        elbowIdx = idx;
      }
    });

    return { 
      ...basic, 
      isLShape: true, 
      s1: getEGDAnalysis(points.slice(0, elbowIdx + 1)), 
      s2: getEGDAnalysis(points.slice(elbowIdx)) 
    };
  }

  return { ...basic, isLShape: false, s1: null, s2: null };
};

const MapController: React.FC<{ 
  pos: GeoPoint | null, active: boolean, mapPoints: GeoPoint[], completed: boolean, viewingRecord: SavedRecord | null, mode: AppView
}> = ({ pos, active, mapPoints, completed, viewingRecord, mode }) => {
  const map = useMap();
  useEffect(() => {
    if (viewingRecord) {
      const pts = viewingRecord.points;
      const bounds = L.latLngBounds(pts.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [60, 60], animate: true });
    } else if (completed && mapPoints.length > 2) {
      const bounds = L.latLngBounds(mapPoints.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [60, 60], animate: true });
    } else if (pos && (active || mode === 'track')) {
      map.setView([pos.lat, pos.lng], 19, { animate: true });
    }
  }, [pos, active, map, completed, mapPoints, viewingRecord, mode]);
  return null;
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
  const [trkPivots, setTrkPivots] = useState<GeoPoint[]>([]);
  
  const [mapActive, setMapActive] = useState(false);
  const [mapCompleted, setMapCompleted] = useState(false);
  const [mapPoints, setMapPoints] = useState<GeoPoint[]>([]);
  const [isBunker, setIsBunker] = useState(false);

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
      null, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
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
    if (pts.length < 2) return null;
    let perimeter = 0, bunkerLength = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = calculateDistance(pts[i], pts[i+1]);
      perimeter += d; if (pts[i+1].type === 'bunker') bunkerLength += d;
    }
    if (mapCompleted || viewingRecord) perimeter += calculateDistance(pts[pts.length-1], pts[0]);
    const shape = (pts.length >= 3 && (mapCompleted || viewingRecord)) ? analyzeGreenShape(pts) : null;
    return { area: calculateArea(pts), perimeter, bunkerPct: perimeter > 0 ? Math.round((bunkerLength / perimeter) * 100) : 0, shape };
  }, [mapPoints, mapCompleted, viewingRecord]);

  const handleFinalizeGreen = useCallback(() => {
    if (mapPoints.length < 3) return;
    const shape = analyzeGreenShape(mapPoints);
    const areaVal = Math.round(calculateArea(mapPoints) * (units === 'Yards' ? 1.196 : 1));
    const egdStr = (shape && shape.isLShape) ? `${shape.s1?.egd} / ${shape.s2?.egd} yd` : `${shape?.egd} yd`;
    saveRecord({ 
      type: 'Green', 
      primaryValue: `${areaVal}${units === 'Yards' ? 'yd²' : 'm²'}`, 
      secondaryValue: `Bunker: ${analysis?.bunkerPct}%`, 
      egdValue: egdStr,
      points: mapPoints 
    });
    setMapActive(false); setMapCompleted(true);
  }, [mapPoints, units, analysis, saveRecord]);

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
    if (trkPoints.length < 1 && !pos) return { dist: 0, elev: 0 };
    let d = 0;
    const segments = [trkPoints[0], ...trkPivots];
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
  }, [trkPoints, trkPivots, trkActive, pos]);

  const distMult = units === 'Yards' ? 1.09361 : 1.0;
  const elevMult = units === 'Yards' ? 3.28084 : 1.0;

  /** --- KML LOGIC --- **/
  const exportKML = () => {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Scottish Golf Course Rating Toolkit</name>`;

    history.forEach(item => {
      const coords = item.points.map(p => `${p.lng},${p.lat},${p.alt || 0}`).join(' ');
      const desc = item.type === 'Green' 
        ? `Area: ${item.primaryValue}, EGD: ${item.egdValue}, ${item.secondaryValue}`
        : `Dist: ${item.primaryValue}, ${item.secondaryValue}`;

      kml += `
    <Placemark>
      <name>${item.type} - ${new Date(item.date).toLocaleDateString()}</name>
      <description>${desc}</description>
      ${item.type === 'Green' ? `
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords} ${item.points[0].lng},${item.points[0].lat},${item.points[0].alt || 0}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>` : `
      <LineString>
        <coordinates>${coords}</coordinates>
      </LineString>`}
    </Placemark>`;
    });

    kml += `
  </Document>
</kml>`;

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
        const coordsStr = p.getElementsByTagName("coordinates")[0]?.textContent || "";
        const points: GeoPoint[] = coordsStr.trim().split(/\s+/).map(c => {
          const parts = c.split(',').map(Number);
          return { lat: parts[1], lng: parts[0], alt: parts[2] || 0, accuracy: 0, altAccuracy: 0, timestamp: Date.now() };
        });

        if (points.length < 2) continue;

        const isGreen = p.getElementsByTagName("Polygon").length > 0;
        const record: SavedRecord = {
          id: Math.random().toString(36).substr(2, 9),
          date: Date.now(),
          type: isGreen ? 'Green' : 'Track',
          points,
          primaryValue: 'Imported',
          secondaryValue: 'KML Data'
        };

        if (isGreen) {
          const area = calculateArea(points);
          const egdObj = getEGDAnalysis(points);
          record.primaryValue = `${Math.round(area * (units === 'Yards' ? 1.196 : 1))}${units === 'Yards' ? 'yd²' : 'm²'}`;
          record.egdValue = egdObj ? `${egdObj.egd} yd` : '--';
        } else {
          let totalDist = 0;
          for (let k = 0; k < points.length - 1; k++) {
            totalDist += calculateDistance(points[k], points[k+1]);
          }
          record.primaryValue = `${(totalDist * distMult).toFixed(1)}${units === 'Yards' ? 'yd' : 'm'}`;
        }

        newItems.push(record);
      }

      if (newItems.length > 0) {
        const updated = [...newItems, ...history];
        setHistory(updated);
        localStorage.setItem('scottish_golf_rating_toolkit_final', JSON.stringify(updated));
        alert(`Successfully imported ${newItems.length} records.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#020617] text-white overflow-hidden absolute inset-0 select-none font-sans">
      <div className="h-[env(safe-area-inset-top)] bg-[#0f172a] shrink-0"></div>
      
      {view === 'landing' ? (
        <div className="flex-1 flex flex-col p-6 overflow-y-auto no-scrollbar animate-in fade-in duration-700">
          <header className="mb-12 mt-8 flex flex-col items-center text-center">
            <h1 className="text-5xl tracking-tighter font-semibold" style={{ color: '#2563eb' }}>
              Scottish Golf
            </h1>
            <p className="text-white text-[11px] font-black tracking-[0.4em] uppercase mt-2 opacity-70">Course Rating Toolkit</p>
          </header>

          <div className="flex flex-col gap-6">
            <button onClick={() => { setView('track'); setViewingRecord(null); setTrkPoints([]); setTrkPivots([]); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center justify-center shadow-2xl active:bg-slate-800 active:scale-95 transition-all">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-blue-600/40"><Navigation2 size={28} /></div>
              <h2 className="text-2xl font-black mb-2 uppercase text-blue-500">Distance tracker</h2>
              <p className="text-slate-400 text-[11px] font-medium text-center max-w-[220px] leading-relaxed">Real-time GNSS horizontal distance measurement with elevation data</p>
            </button>
            <button onClick={() => { setView('green'); setMapCompleted(false); setMapPoints([]); setViewingRecord(null); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-10 flex flex-col items-center justify-center shadow-2xl active:bg-slate-800 active:scale-95 transition-all">
              <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-600/40"><Target size={28} /></div>
              <h2 className="text-2xl font-black mb-2 uppercase text-emerald-500">Green Mapper</h2>
              <p className="text-slate-400 text-[11px] font-medium text-center max-w-[220px] leading-relaxed">Green mapping, bunker proportion and EGD</p>
            </button>

            <button onClick={() => window.open('https://example.com/user-manual', '_blank')} className="mt-2 bg-slate-800/50 border border-white/10 rounded-[1.8rem] py-6 flex items-center justify-center gap-4 active:bg-slate-700 transition-colors">
              <BookOpen size={20} className="text-blue-400" />
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-black uppercase tracking-widest text-white">Open User Manual</span>
              </div>
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
              <div className="mb-6 animate-in slide-in-from-bottom duration-500">
                <div className="flex items-center gap-2 px-2 mb-4">
                  <Info size={12} className="text-blue-400" />
                  <span className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Recent Assessment Logs</span>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                  {history.map(item => (
                    <div key={item.id} className="relative shrink-0">
                      <button onClick={() => { setViewingRecord(item); setView(item.type === 'Track' ? 'track' : 'green'); }} className="bg-slate-900 border border-white/10 px-6 py-5 rounded-[2rem] flex flex-col min-w-[170px] text-left shadow-lg">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">{item.type}</span>
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
      ) : (
        <div className="flex-1 flex flex-col relative animate-in slide-in-from-right duration-300">
          <div className="absolute top-0 left-0 right-0 z-[1000] p-4 flex justify-between items-start pointer-events-none">
            <button onClick={() => { setView('landing'); setTrkActive(false); setMapActive(false); setViewingRecord(null); }} className="pointer-events-auto bg-slate-800 border border-white/20 px-5 py-3 rounded-full flex items-center gap-2 shadow-2xl active:scale-95 transition-all">
              <ChevronLeft size={18} className="text-emerald-400" />
              <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: '#2563eb' }}>
                Scottish Golf
              </span>
            </button>
            <div className="flex gap-2">
              <button onClick={() => setUnits(u => u === 'Yards' ? 'Metres' : 'Yards')} className="pointer-events-auto bg-slate-800 border border-white/20 p-3.5 rounded-full text-emerald-400 shadow-2xl active:scale-90"><Ruler size={20} /></button>
              <button onClick={() => setMapStyle(s => s === 'Street' ? 'Satellite' : 'Street')} className="pointer-events-auto bg-slate-800 border border-white/20 p-3.5 rounded-full text-blue-400 shadow-2xl active:scale-90"><Layers size={20} /></button>
            </div>
          </div>
          
          <main className="flex-1">
            <MapContainer center={[0, 0]} zoom={2} className="h-full w-full" zoomControl={false} attributionControl={false} style={{ backgroundColor: '#020617' }}>
              <TileLayer url={mapStyle === 'Street' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} maxZoom={22} maxNativeZoom={19} />
              <MapController pos={pos} active={trkActive || mapActive} mapPoints={mapPoints} completed={mapCompleted} viewingRecord={viewingRecord} mode={view} />
              
              {pos && !viewingRecord && (
                <CircleMarker center={[pos.lat, pos.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 1, weight: 2.5 }} />
              )}

              {view === 'track' && (viewingRecord?.pivots || trkPivots).map((p, i) => (
                <CircleMarker key={i} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: '#fff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }} />
              )}

              {view === 'track' && (trkPoints.length > 0 || trkActive || viewingRecord) && (
                <Polyline 
                  positions={[
                    ...(viewingRecord ? [viewingRecord.points[0], ...(viewingRecord.pivots || []), viewingRecord.points[viewingRecord.points.length-1]] : [trkPoints[0], ...trkPivots, ...(pos && trkActive ? [pos] : [])])
                  ].filter(Boolean).map(p => [p.lat, p.lng] as [number, number])} 
                  color="#3b82f6" 
                  weight={5} 
                />
              )}

              {view === 'green' && (viewingRecord?.points || mapPoints).length > 1 && (
                <>
                  <Polygon positions={(viewingRecord?.points || mapPoints).map(p => [p.lat, p.lng])} fillColor="#10b981" fillOpacity={0.1} weight={0} />
                  {(viewingRecord?.points || mapPoints).map((p, i, arr) => i > 0 && <Polyline key={i} positions={[[arr[i-1].lat, arr[i-1].lng], [p.lat, p.lng]]} color={p.type === 'bunker' ? '#facc15' : '#10b981'} weight={p.type === 'bunker' ? 7 : 4} />)}
                  
                  {(viewingRecord || mapCompleted) && analysis?.shape && (
                    <>
                      {!analysis.shape.isLShape && analysis.shape.pA && (
                         <>
                            <Polyline positions={[[analysis.shape.pA.lat, analysis.shape.pA.lng], [analysis.shape.pB.lat, analysis.shape.pB.lng]]} color="#22d3ee" weight={5} />
                            <Polyline positions={[[analysis.shape.pC.lat, analysis.shape.pC.lng], [analysis.shape.pD.lat, analysis.shape.pD.lng]]} color="#22d3ee" weight={5} />
                         </>
                      )}

                      {analysis.shape.isLShape && (
                        <>
                          {analysis.shape.s1?.pA && (
                            <>
                              <Polyline positions={[[analysis.shape.s1.pA.lat, analysis.shape.s1.pA.lng], [analysis.shape.s1.pB.lat, analysis.shape.s1.pB.lng]]} color="#22d3ee" weight={5} />
                              <Polyline positions={[[analysis.shape.s1.pC.lat, analysis.shape.s1.pC.lng], [analysis.shape.s1.pD.lat, analysis.shape.s1.pD.lng]]} color="#22d3ee" weight={5} />
                            </>
                          )}
                          {analysis.shape.s2?.pA && (
                            <>
                              <Polyline positions={[[analysis.shape.s2.pA.lat, analysis.shape.s2.pA.lng], [analysis.shape.s2.pB.lat, analysis.shape.s2.pB.lng]]} color="#fbbf24" weight={5} />
                              <Polyline positions={[[analysis.shape.s2.pC.lat, analysis.shape.s2.pC.lng], [analysis.shape.s2.pD.lat, analysis.shape.s2.pD.lng]]} color="#fbbf24" weight={5} />
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

          <div className="absolute inset-x-0 bottom-0 z-[1000] p-4 pointer-events-none flex flex-col gap-3 items-center pb-12">
            <div className="flex flex-col gap-3 w-full max-w-[340px]">
              <div className="pointer-events-auto bg-slate-900/95 border border-white/20 rounded-[2.8rem] p-6 w-full shadow-2xl backdrop-blur-md">
                {view === 'track' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center flex flex-col items-center">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2 leading-none">
                          {viewingRecord ? 'ARCHIVED LOG' : `GNSS ±${(pos?.accuracy ? pos.accuracy * distMult : 0).toFixed(1)}${units === 'Yards' ? 'YD' : 'M'}`}
                        </span>
                        <span className="text-[9px] font-black text-white uppercase tracking-widest block mb-1 opacity-20">Hz Distance</span>
                        <div className="text-4xl font-black text-emerald-400 tabular-nums leading-none tracking-tighter text-glow-emerald">
                          {viewingRecord ? viewingRecord.primaryValue.replace(/[a-z²]/gi, '') : (trkMetrics.dist * distMult).toFixed(1)}
                          <span className="text-[10px] ml-1 opacity-40 uppercase">{units === 'Yards' ? 'YD' : 'M'}</span>
                        </div>
                      </div>
                      <div className="text-center border-l border-white/10 flex flex-col items-center">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2 leading-none">
                          {viewingRecord ? 'ALTITUDE DATA' : `WGS84 ±${(pos?.altAccuracy ? pos.altAccuracy * elevMult : 0).toFixed(1)}${units === 'Yards' ? 'FT' : 'M'}`}
                        </span>
                        <span className="text-[9px] font-black text-white uppercase tracking-widest block mb-1 opacity-20">Elev Change</span>
                        <div className="text-4xl font-black text-yellow-400 tabular-nums leading-none tracking-tighter">
                          {(viewingRecord ? viewingRecord.secondaryValue?.split(':')[1].trim().replace(/[a-z²]/gi, '') : (trkMetrics.elev * elevMult).toFixed(1))}
                          <span className="text-[10px] ml-1 opacity-40 uppercase">{units === 'Yards' ? 'FT' : 'M'}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="text-center"><span className="text-white/40 text-[8px] font-black uppercase block mb-1 tracking-widest">Sq. Area</span><div className="text-2xl font-black text-emerald-400 tabular-nums">{Math.round((analysis?.area || 0) * (units === 'Yards' ? 1.196 : 1))}<span className="text-[9px] ml-0.5 opacity-40 uppercase">{units === 'Yards' ? 'YD²' : 'M²'}</span></div></div>
                      <div className="text-center"><span className="text-white/40 text-[8px] font-black uppercase block mb-1 tracking-widest">Perimeter</span><div className="text-2xl font-black text-blue-400 tabular-nums">{((analysis?.perimeter || 0) * distMult).toFixed(1)}<span className="text-[9px] ml-0.5 opacity-40 uppercase">{units === 'Yards' ? 'YD' : 'M'}</span></div></div>
                      <div className="text-center"><span className="text-white/40 text-[8px] font-black uppercase block mb-1 tracking-widest">Bunker%</span><div className="text-2xl font-black text-orange-400 tabular-nums">{analysis?.bunkerPct || 0}%</div></div>
                    </div>

                    {analysis?.shape && (
                      <div className="bg-white/[0.04] rounded-[2rem] p-5 border border-white/10 shadow-inner">
                         <div className="flex items-center justify-between mb-3">
                           <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.2em]">
                             {analysis.shape.isLShape ? '13.D TWO PORTIONS' : 'EFFECTIVE GREEN DIAMETER (EGD)'}
                           </span>
                           {analysis.shape.isLShape && <Zap size={12} className="text-yellow-400 animate-pulse fill-yellow-400" />}
                         </div>

                         {analysis.shape.isLShape ? (
                           <div className="flex items-center justify-around gap-2">
                             <div className="text-center border-r border-white/10 pr-6">
                               <span className="text-[7px] text-white/30 uppercase font-black block mb-1 tracking-widest">SURFACE 1</span>
                               <div className="text-4xl font-black text-yellow-400 tabular-nums">{analysis.shape.s1?.egd}<span className="text-[10px] ml-1 opacity-40 uppercase">YD</span></div>
                             </div>
                             <div className="text-center pl-6">
                               <span className="text-[7px] text-white/30 uppercase font-black block mb-1 tracking-widest">SURFACE 2</span>
                               <div className="text-4xl font-black text-amber-500 tabular-nums">{analysis.shape.s2?.egd}<span className="text-[10px] ml-1 opacity-40 uppercase">YD</span></div>
                             </div>
                           </div>
                         ) : (
                           <div className="text-center py-2 flex flex-col items-center">
                             <div className="text-6xl font-black text-yellow-400 tabular-nums leading-none">{analysis.shape.egd}<span className="text-base ml-1 opacity-40 uppercase">YD</span></div>
                             <div className="text-[9px] text-white/30 font-black mt-3 uppercase tracking-widest">L: {analysis.shape.L.toFixed(1)} YD | W: {analysis.shape.W.toFixed(1)} YD</div>
                           </div>
                         )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="pointer-events-auto flex flex-col gap-2 w-full mt-1">
                {view === 'track' ? (
                  <div className="flex gap-2 w-full">
                    <button onClick={() => { 
                      if(!trkActive) { 
                        setTrkActive(true); 
                        setTrkPoints(pos?[pos]:[]); 
                        setTrkPivots([]);
                      } else { 
                        const unitSfx = units === 'Yards' ? 'yd' : 'm';
                        const elevSfx = units === 'Yards' ? 'ft' : 'm';
                        saveRecord({ 
                          type: 'Track', 
                          primaryValue: (trkMetrics.dist * distMult).toFixed(1) + unitSfx, 
                          secondaryValue: `Elev: ${(trkMetrics.elev * elevMult).toFixed(1)}${elevSfx}`,
                          points: [trkPoints[0], pos].filter(Boolean) as GeoPoint[],
                          pivots: trkPivots
                        }); 
                        setTrkActive(false); 
                      } 
                    }} className={`flex-[0.8] h-14 rounded-full font-black text-xs tracking-[0.2em] uppercase border-2 shadow-xl transition-all active:scale-95 whitespace-nowrap overflow-hidden ${trkActive ? 'bg-red-600 border-red-500 text-white' : 'bg-blue-600 border-blue-500 text-white'}`}>{trkActive ? 'STOP TRACK' : 'START TRACK'}</button>
                    
                    {trkActive ? (
                      <div className="flex-[1.2] flex gap-2">
                        <button 
                          onClick={() => {
                            if (trkPivots.length < 3 && pos) {
                              setTrkPivots([...trkPivots, pos]);
                            }
                          }}
                          disabled={trkPivots.length >= 3}
                          className={`flex-1 h-14 rounded-full font-black text-xs tracking-[0.1em] uppercase border-2 transition-all shadow-xl active:scale-95 ${trkPivots.length >= 3 ? 'bg-slate-800 border-slate-700 text-slate-500 opacity-50' : 'bg-slate-800 border-blue-500 text-blue-100 shadow-blue-500/20'}`}
                        >
                          <div className="flex items-center justify-center gap-2 px-1">
                            <MapPin size={14} className={trkPivots.length >= 3 ? 'text-slate-500' : 'text-blue-400'} />
                            <span className="whitespace-nowrap">ADD PIVOT ({trkPivots.length})</span>
                          </div>
                        </button>
                        {trkPivots.length > 0 && (
                          <button 
                            onClick={() => setTrkPivots(prev => prev.slice(0, -1))}
                            className="w-14 h-14 bg-slate-800 border-2 border-slate-700/50 rounded-full flex items-center justify-center text-slate-400 shadow-xl active:scale-90 active:bg-slate-700 shrink-0"
                          >
                            <RotateCcw size={18} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex-[1.2]" />
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 w-full">
                    <button onClick={() => { if(mapActive) handleFinalizeGreen(); else { setMapPoints(pos?[pos]:[]); setMapActive(true); setMapCompleted(false); } }} className={`flex-1 h-14 rounded-full font-black text-xs tracking-[0.2em] uppercase border-2 shadow-xl transition-all active:scale-95 ${mapActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-emerald-600 border-emerald-500 text-white'}`}>{mapActive ? 'CLOSE' : 'START GREEN'}</button>
                    {mapActive && (
                      <button 
                        onPointerDown={() => setIsBunker(true)} 
                        onPointerUp={() => setIsBunker(false)} 
                        onPointerLeave={() => setIsBunker(false)} 
                        className={`flex-1 h-14 rounded-full font-black text-xs tracking-[0.1em] uppercase border-2 transition-all shadow-xl active:scale-95 ${isBunker ? 'bg-orange-600 border-orange-500 text-white shadow-orange-500/50 animate-pulse scale-105' : 'bg-slate-800 border-orange-500/50 text-orange-400'}`}
                      >
                        {isBunker ? 'RECORDING' : 'BUNKER (HOLD)'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .leaflet-tile-pane { filter: brightness(0.8) contrast(1.1) saturate(0.85); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .text-glow-emerald { text-shadow: 0 0 15px rgba(16, 185, 129, 0.4); }
      `}</style>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}