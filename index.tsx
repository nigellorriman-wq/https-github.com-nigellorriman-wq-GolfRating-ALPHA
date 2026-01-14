
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
  Anchor,
  BookOpen,
  X,
  Type,
  Zap,
  Activity,
  RotateCcw,
  History
} from 'lucide-react';

/** --- TYPES --- **/
type AppView = 'landing' | 'track' | 'green';
type UnitSystem = 'Yards' | 'Metres';
type FontSizeMode = 'Small' | 'Medium' | 'Large';

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

const exportToKML = (records: SavedRecord[]) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `golf_export_${timestamp}.kml`;
  const kmlTitle = `Exported from Scottish Golf Course Rating Toolkit - ${fileName}`;

  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${kmlTitle}</name>
    <Style id="trackStyle">
      <LineStyle><color>ff0000ff</color><width>4</width></LineStyle>
    </Style>
    <Style id="greenStyle">
      <LineStyle><color>ff00ff00</color><width>4</width></LineStyle>
      <PolyStyle><color>4d00ff00</color></PolyStyle>
    </Style>
    <Style id="bunkerStyle">
      <LineStyle><color>ff00ffff</color><width>6</width></LineStyle>
    </Style>
    <Style id="pivotStyle">
      <IconStyle><scale>0.5</scale></IconStyle>
    </Style>`;

  records.forEach(rec => {
    const description = `Type: ${rec.type}\nValue: ${rec.primaryValue}\nSecondary: ${rec.secondaryValue || 'N/A'}\nEGD: ${rec.egdValue || 'N/A'}`;
    
    if (rec.type === 'Track') {
      const coords = rec.points.map(p => `${p.lng},${p.lat},${p.alt || 0}`).join(' ');
      kml += `
    <Placemark>
      <name>Track - ${rec.primaryValue}</name>
      <description>${description}</description>
      <styleUrl>#trackStyle</styleUrl>
      <LineString><coordinates>${coords}</coordinates></LineString>
    </Placemark>`;
      
      rec.pivots?.forEach((pv, idx) => {
        kml += `
    <Placemark>
      <name>Pivot ${idx + 1}</name>
      <styleUrl>#pivotStyle</styleUrl>
      <Point><coordinates>${pv.lng},${pv.lat},${pv.alt || 0}</coordinates></Point>
    </Placemark>`;
      });
    } else {
      for (let i = 0; i < rec.points.length; i++) {
        const p1 = rec.points[i];
        const p2 = rec.points[(i + 1) % rec.points.length];
        const style = p2.type === 'bunker' ? '#bunkerStyle' : '#greenStyle';
        kml += `
    <Placemark>
      <name>Green Segment ${i}</name>
      <description>${description}</description>
      <styleUrl>${style}</styleUrl>
      <LineString>
        <coordinates>${p1.lng},${p1.lat},${p1.alt || 0} ${p2.lng},${p2.lat},${p2.alt || 0}</coordinates>
      </LineString>
    </Placemark>`;
      }
    }
  });

  kml += `\n  </Document>\n</kml>`;
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
};

const analyzeGreenShape = (points: GeoPoint[]) => {
  if (points.length < 3) return null;
  let maxD = 0;
  let pA = points[0], pB = points[0];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = calculateDistance(points[i], points[j]);
      if (d > maxD) { maxD = d; pA = points[i]; pB = points[j]; }
    }
  }
  const R = 6371e3;
  const latRef = pA.lat * Math.PI / 180;
  const xA = pA.lng * Math.PI / 180 * R * Math.cos(latRef), yA = pA.lat * Math.PI / 180 * R;
  const xB = pB.lng * Math.PI / 180 * R * Math.cos(latRef), yB = pB.lat * Math.PI / 180 * R;
  const dx = xB - xA;
  const dy = yB - yA;
  const mag = Math.sqrt(dx * dx + dy * dy);
  let side1 = 0, side2 = 0;
  let pC = points[0], pD = points[0];
  points.forEach(p => {
    const px = p.lng * Math.PI / 180 * R * Math.cos(latRef), py = p.lat * Math.PI / 180 * R;
    const crossProduct = (xB - xA) * (py - yA) - (yB - yA) * (px - xA);
    const dist = crossProduct / mag;
    if (dist > side1) { side1 = dist; pC = p; }
    else if (dist < side2) { side2 = dist; pD = p; }
  });
  const maxW = Math.abs(side1) + Math.abs(side2);
  const L_yds = maxD * 1.09361;
  const W_yds = maxW * 1.09361;
  const ratio = L_yds / W_yds;
  let egd = 0;
  if (ratio >= 3) egd = (3 * W_yds + L_yds) / 4;
  else if (ratio >= 2) egd = (2 * W_yds + L_yds) / 3;
  else egd = (L_yds + W_yds) / 2;
  const polyArea = calculateArea(points);
  const bboxArea = (maxD * maxW);
  const isL = (polyArea / bboxArea) < 0.62 && points.length > 8;
  return { egd: Math.round(egd * 10) / 10, length: L_yds, width: W_yds, ratio, isL, pA, pB, pC, pD };
};

const formatDist = (m: number, u: UnitSystem) => (m * (u === 'Metres' ? 1 : 1.09361)).toFixed(1);
const formatAlt = (m: number, u: UnitSystem) => (m * (u === 'Metres' ? 1 : 3.28084)).toFixed(1);

const getAccuracyColor = (acc: number) => {
  if (acc < 3.5) return '#10b981'; 
  if (acc <= 8) return '#f59e0b';
  return '#ef4444';
};

/** --- COMPONENTS --- **/
const FitText: React.FC<{ children: React.ReactNode; className?: string; maxFontSize: number }> = ({ children, className, maxFontSize }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);
  useEffect(() => {
    if (!containerRef.current || !textRef.current) return;
    let currentSize = maxFontSize;
    textRef.current.style.fontSize = `${currentSize}px`;
    const targetWidth = containerRef.current.clientWidth - 4;
    while (textRef.current.scrollWidth > targetWidth && currentSize > 8) {
      currentSize -= 1;
      textRef.current.style.fontSize = `${currentSize}px`;
    }
    setFontSize(currentSize);
  }, [maxFontSize, children]);
  return <div ref={containerRef} className="w-full flex justify-center items-center overflow-hidden px-1"><div ref={textRef} className={className} style={{ fontSize: `${fontSize}px`, whiteSpace: 'nowrap' }}>{children}</div></div>;
};

const MapController: React.FC<{ 
  pos: GeoPoint | null, active: boolean, trkStart: GeoPoint | null, trkPivots: GeoPoint[], mapPoints: GeoPoint[], completed: boolean, viewingRecord: SavedRecord | null, mode: AppView
}> = ({ pos, active, trkStart, trkPivots, mapPoints, completed, viewingRecord, mode }) => {
  const map = useMap();
  useEffect(() => {
    if (viewingRecord && viewingRecord.points.length > 0) {
      const bounds = L.latLngBounds(viewingRecord.points.map(p => [p.lat, p.lng]));
      if (viewingRecord.pivots) viewingRecord.pivots.forEach(pv => bounds.extend([pv.lat, pv.lng]));
      map.fitBounds(bounds, { paddingBottomRight: [50, 260], paddingTopLeft: [50, 80], animate: true });
    } else if (completed && mode === 'green' && mapPoints.length > 2) {
      const bounds = L.latLngBounds(mapPoints.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { paddingBottomRight: [50, 260], paddingTopLeft: [50, 80], animate: true });
    } else if (mode === 'track' && active && trkStart && pos) {
      const bounds = L.latLngBounds([trkStart.lat, trkStart.lng], [pos.lat, pos.lng]);
      trkPivots.forEach(p => bounds.extend([p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [80, 80], animate: true });
    } else if (pos) {
      map.setView([pos.lat, pos.lng], 19, { animate: true });
    }
  }, [pos, active, map, completed, mapPoints, viewingRecord, mode, trkStart, trkPivots]);
  return null;
};

const SignalStatus: React.FC<{ pos: GeoPoint | null, units: UnitSystem, isHistorical?: boolean }> = ({ pos, units, isHistorical }) => {
  if (isHistorical) {
    return (
      <div className="flex items-center gap-3 px-3 py-1 bg-blue-900/40 border border-blue-500/30 rounded-full shadow-lg">
        <div className="flex items-center gap-1">
          <History size={9} className="text-blue-400" />
          <span className="text-[8px] font-black uppercase text-blue-400 tracking-wider">Historical Record</span>
        </div>
      </div>
    );
  }
  if (!pos) return <div className="flex items-center gap-2 px-3 py-1 bg-red-600 border border-red-500 rounded-full shadow-lg"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div><span className="text-[8px] font-black uppercase tracking-widest text-white">No Signal</span></div>;
  const color = getAccuracyColor(pos.accuracy);
  const accVal = units === 'Yards' ? (pos.accuracy * 1.09361).toFixed(1) : pos.accuracy.toFixed(1);
  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-slate-800 border border-white/20 rounded-full shadow-lg">
      <div className="flex items-center gap-1">
        <Activity size={9} style={{ color }} />
        <span className="text-[8px] font-black uppercase text-white/50 tracking-wider">Acc:</span>
        <span className="text-[8px] font-black tabular-nums" style={{ color }}>±{accVal}{units === 'Yards' ? 'yd' : 'm'}</span>
      </div>
      <div className="w-px h-2 bg-white/10"></div>
      <div className="flex items-center gap-1">
        <span className="text-[8px] font-black uppercase text-white/50 tracking-wider">SRC:</span>
        <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">{pos.accuracy < 15 ? 'GNSS' : 'INF'}</span>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('landing');
  const [units, setUnits] = useState<UnitSystem>('Yards');
  const [fontSizeMode, setFontSizeMode] = useState<FontSizeMode>('Medium');
  const [mapStyle, setMapStyle] = useState<'Street' | 'Satellite'>('Satellite');
  const [pos, setPos] = useState<GeoPoint | null>(null);
  const [history, setHistory] = useState<SavedRecord[]>([]);
  const [viewingRecord, setViewingRecord] = useState<SavedRecord | null>(null);
  const [showManual, setShowManual] = useState(false);

  const [trkActive, setTrkActive] = useState(false);
  const [trkStart, setTrkStart] = useState<GeoPoint | null>(null);
  const [trkPivots, setTrkPivots] = useState<GeoPoint[]>([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const [mapActive, setMapActive] = useState(false);
  const [mapCompleted, setMapCompleted] = useState(false);
  const [mapPoints, setMapPoints] = useState<GeoPoint[]>([]);
  const [isBunker, setIsBunker] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('golf_pro_caddy_final');
    if (saved) setHistory(JSON.parse(saved));
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
    localStorage.setItem('golf_pro_caddy_final', JSON.stringify(updated));
  }, [history]);

  const toggleFontSize = () => {
    setFontSizeMode(current => {
      if (current === 'Small') return 'Medium';
      if (current === 'Medium') return 'Large';
      return 'Small';
    });
  };

  const greenAnalysis = useMemo(() => {
    const pts = viewingRecord?.type === 'Green' ? viewingRecord.points : mapPoints;
    if (pts.length < 2) return null;
    let perimeter = 0; let bunkerLength = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = calculateDistance(pts[i], pts[i+1]);
      perimeter += d; if (pts[i+1].type === 'bunker') bunkerLength += d;
    }
    if (mapCompleted || viewingRecord) perimeter += calculateDistance(pts[pts.length-1], pts[0]);
    const shape = (pts.length >= 3 && (mapCompleted || viewingRecord)) ? analyzeGreenShape(pts) : null;
    return { 
      area: calculateArea(pts), 
      perimeter, 
      bunkerPct: perimeter > 0 ? Math.round((bunkerLength / perimeter) * 100) : 0, 
      egd: shape?.egd, 
      length: shape?.length, 
      width: shape?.width, 
      ratio: shape?.ratio, 
      isL: shape?.isL, 
      pA: shape?.pA, 
      pB: shape?.pB, 
      pC: shape?.pC, 
      pD: shape?.pD 
    };
  }, [mapPoints, mapCompleted, viewingRecord]);

  const handleFinalizeGreen = useCallback(() => {
    if (mapPoints.length < 3) return;
    const shape = analyzeGreenShape(mapPoints);
    saveRecord({ 
      type: 'Green', 
      primaryValue: Math.round(calculateArea(mapPoints) * (units === 'Yards' ? 1.196 : 1)) + (units === 'Yards' ? 'yd²' : 'm²'), 
      secondaryValue: `Bunker: ${greenAnalysis?.bunkerPct}%`, 
      egdValue: (shape?.egd || '0') + 'yd', 
      points: mapPoints 
    });
    setMapActive(false); 
    setMapCompleted(true);
  }, [mapPoints, units, greenAnalysis, saveRecord]);

  useEffect(() => {
    if (mapActive && pos) {
      setMapPoints(prev => {
        const last = prev[prev.length - 1];
        if (!last || calculateDistance(last, pos) >= 0.4) {
          return [...prev, { ...pos, type: isBunker ? 'bunker' : 'green' }];
        }
        return prev;
      });
      if (mapPoints.length > 10 && calculateDistance(pos, mapPoints[0]) < 1.0) {
        handleFinalizeGreen();
      }
    }
  }, [pos, mapActive, isBunker, mapPoints.length, handleFinalizeGreen]);

  const deleteHistory = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem('golf_pro_caddy_final', JSON.stringify(updated));
  }, [history]);

  const accumulatedDist = useMemo(() => {
    if (!trkStart || !pos) return 0;
    let total = 0, lastPoint = trkStart;
    trkPivots.forEach(pivot => { total += calculateDistance(lastPoint, pivot); lastPoint = pivot; });
    total += calculateDistance(lastPoint, pos);
    return total;
  }, [trkStart, trkPivots, pos]);

  const elevDelta = (pos && trkStart && pos.alt !== null && trkStart.alt !== null) ? (pos.alt - trkStart.alt) : 0;

  const getManualFontSizeClass = () => {
    if (fontSizeMode === 'Small') return 'text-xs';
    if (fontSizeMode === 'Large') return 'text-lg';
    return 'text-sm';
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#020617] text-white overflow-hidden absolute inset-0 select-none">
      <div className="h-[env(safe-area-inset-top)] bg-[#0f172a]"></div>
      
      {showManual && (
        <div className="fixed inset-0 z-[3000] flex flex-col bg-[#020617] p-6 animate-in slide-in-from-bottom duration-300">
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-black tracking-tight text-blue-500 uppercase">User Manual</h2>
              <button 
                onClick={toggleFontSize}
                className="w-14 h-10 flex items-center justify-center gap-0.5 rounded-xl bg-slate-900 border border-white/10 text-blue-400 shadow-lg active:scale-95 transition-all px-2"
                title="Cycle Text Size"
              >
                <Type size={14} className="opacity-60" />
                <Type size={20} />
              </button>
            </div>
            <button onClick={() => setShowManual(false)} className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center border border-white/10 active:scale-90 transition-transform shadow-lg"><X size={24} /></button>
          </header>
          <div className={`flex-1 overflow-y-auto no-scrollbar space-y-8 pb-10 text-white pr-2 ${getManualFontSizeClass()}`}>
             <section><h3 className="text-emerald-500 font-black uppercase text-xs mb-3 flex items-center gap-2"><Zap size={14} /> Quick Start</h3><p className="font-medium opacity-80 leading-relaxed">Ensure 'High Accuracy' location is enabled. For best results, keep the app active and in-hand while walking.</p></section>
             <section><h3 className="text-blue-500 font-black uppercase text-xs mb-3 flex items-center gap-2"><Navigation2 size={14} /> Distance Tracker</h3><p className="font-medium opacity-80 leading-relaxed">Tap 'Start' to track. Use 'Pivot' for dog-legs. Total distance includes all pivot stages.</p></section>
             <section><h3 className="text-emerald-500 font-black uppercase text-xs mb-3 flex items-center gap-2"><Target size={14} /> Green Mapper</h3><p className="font-medium opacity-80 leading-relaxed">Walk green edge. Tool calculates Area, Perimeter, and EGD.</p></section>
          </div>
        </div>
      )}

      {showEndConfirm && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f172a] w-full max-w-xs rounded-[2rem] border border-white/10 p-6 text-center shadow-2xl">
            <h3 className="text-lg font-black uppercase mb-4 text-white">Save Track?</h3>
            <button onClick={() => { if (trkStart && pos) saveRecord({ type: 'Track', primaryValue: formatDist(accumulatedDist, units) + (units === 'Yards' ? 'yd' : 'm'), secondaryValue: `Elev: ${(elevDelta >= 0 ? '+' : '') + formatAlt(elevDelta, units) + (units === 'Yards' ? 'ft' : 'm')}`, points: [trkStart, pos], pivots: trkPivots }); setTrkActive(false); setShowEndConfirm(false); }} className="w-full py-4 bg-blue-600 rounded-2xl font-black text-lg uppercase mb-2 tracking-widest shadow-xl">Save</button>
            <button onClick={() => setShowEndConfirm(false)} className="w-full py-4 bg-slate-800 rounded-2xl font-black text-lg uppercase text-slate-400 tracking-widest shadow-xl">Cancel</button>
          </div>
        </div>
      )}

      {view === 'landing' ? (
        <div className="flex-1 flex flex-col p-6 overflow-y-auto no-scrollbar">
          <header className="mb-10 mt-6 text-center">
            <h1 className="text-4xl font-black tracking-tighter" style={{ color: '#2563EB' }}>Scottish Golf</h1>
            <p className="text-white text-[9px] font-black tracking-[0.4em] uppercase mt-2">Course Rating Toolkit ALPHA</p>
          </header>
          <div className="flex flex-col gap-4">
            <button onClick={() => { setView('track'); setViewingRecord(null); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center shadow-2xl active:bg-slate-800 transition-colors">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-blue-600/30"><Navigation2 size={28} /></div>
              <h2 className="text-xl font-black mb-1 uppercase text-blue-500">Distance tracker</h2>
              <p className="text-white text-[10px] opacity-60">Realtime accumulated distance & pivots</p>
            </button>
            <button onClick={() => { setView('green'); setMapCompleted(false); setMapPoints([]); setViewingRecord(null); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center shadow-2xl active:bg-slate-800 transition-colors">
              <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-600/30"><Target size={28} /></div>
              <h2 className="text-xl font-black mb-1 uppercase text-emerald-500">Green Mapper</h2>
              <p className="text-white text-[10px] opacity-60">Area, Bunker & EGD analysis</p>
            </button>
          </div>
          <footer className="mt-8 pb-4">
            {history.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3 px-2">
                  <span className="text-[9px] font-black tracking-[0.2em] text-slate-500 uppercase">History</span>
                  <button onClick={() => exportToKML(history)} className="text-blue-400 text-[8px] font-black uppercase">Export KML</button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                  {history.map(item => (
                    <div key={item.id} className="relative group shrink-0">
                      <button onClick={() => { setViewingRecord(item); setView(item.type === 'Track' ? 'track' : 'green'); }} className="bg-slate-900 border border-white/10 px-5 py-4 rounded-2xl flex flex-col min-w-[170px] text-left shadow-lg">
                        <span className="text-[7px] font-black text-slate-500 uppercase">{item.type}</span>
                        <span className="text-lg font-black text-white">{item.primaryValue}</span>
                        <span className="text-[10px] font-bold text-slate-400">{item.egdValue || item.secondaryValue}</span>
                      </button>
                      <button onClick={(e) => deleteHistory(item.id, e)} className="absolute -top-2 -right-2 w-7 h-7 bg-red-600 rounded-full flex items-center justify-center border-2 border-[#020617] text-white shadow-xl active:scale-90 transition-all z-10"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-center">
              <button onClick={() => setShowManual(true)} className="w-[160px] bg-slate-800 border border-white/10 p-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl"><BookOpen size={16} className="text-blue-500" /><span className="text-[9px] font-black uppercase tracking-widest text-white">User Manual</span></button>
            </div>
          </footer>
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative animate-in slide-in-from-right duration-300">
          <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none flex justify-between items-start">
            <button onClick={() => { setView('landing'); setTrkActive(false); setMapActive(false); setMapCompleted(false); setViewingRecord(null); }} className="pointer-events-auto bg-slate-800 border border-white/20 px-4 py-2.5 rounded-full flex items-center gap-2 shadow-2xl active:scale-95 transition-all"><ChevronLeft size={16} className="text-emerald-400" /><span className="text-[10px] font-black uppercase tracking-widest text-white">Home</span></button>
            <div className="flex gap-2">
              <button onClick={() => setUnits(u => u === 'Yards' ? 'Metres' : 'Yards')} className="pointer-events-auto bg-slate-800 border border-white/20 p-3 rounded-full shadow-2xl active:scale-95 transition-all text-emerald-400"><Ruler size={18} /></button>
              <button onClick={() => setMapStyle(s => s === 'Street' ? 'Satellite' : 'Street')} className="pointer-events-auto bg-slate-800 border border-white/20 p-3 rounded-full shadow-2xl active:scale-95 transition-all text-blue-400"><Layers size={18} /></button>
            </div>
          </div>
          
          <main className="flex-1">
            <MapContainer center={[0, 0]} zoom={2} className="h-full w-full custom-map-container" zoomControl={false} attributionControl={false}>
              <TileLayer url={mapStyle === 'Street' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} maxZoom={22} maxNativeZoom={19} />
              <MapController pos={pos} active={trkActive || mapActive} trkStart={trkStart} trkPivots={trkPivots} mapPoints={mapPoints} completed={mapCompleted} viewingRecord={viewingRecord} mode={view} />
              {pos && (view !== 'green' || !mapCompleted) && !viewingRecord && (
                <><Circle center={[pos.lat, pos.lng]} radius={pos.accuracy} pathOptions={{ color: getAccuracyColor(pos.accuracy), fillOpacity: 0.1, weight: 1 }} /><CircleMarker center={[pos.lat, pos.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 1, weight: 2.5 }} /></>
              )}
              {view === 'track' && (viewingRecord ? viewingRecord.points.length >= 2 : (trkStart && pos)) && (
                <>
                  <CircleMarker center={viewingRecord ? [viewingRecord.points[0].lat, viewingRecord.points[0].lng] : [trkStart!.lat, trkStart!.lng]} radius={6} pathOptions={{ color: '#fff', fillColor: '#3b82f6', fillOpacity: 1 }} />
                  {(viewingRecord?.pivots || trkPivots).map((pv, i) => (
                    <CircleMarker key={i} center={[pv.lat, pv.lng]} radius={6} pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1 }} />
                  ))}
                  {viewingRecord && (
                    <CircleMarker center={[viewingRecord.points[viewingRecord.points.length - 1].lat, viewingRecord.points[viewingRecord.points.length - 1].lng]} radius={6} pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 1 }} />
                  )}
                  {(() => {
                    const start = viewingRecord ? viewingRecord.points[0] : trkStart!;
                    const pivots = viewingRecord?.pivots || trkPivots;
                    const positions: [number, number][] = [[start.lat, start.lng], ...pivots.map(p => [p.lat, p.lng] as [number, number])];
                    if (viewingRecord) positions.push([viewingRecord.points[viewingRecord.points.length - 1].lat, viewingRecord.points[viewingRecord.points.length - 1].lng]);
                    else if (trkActive && pos) positions.push([pos.lat, pos.lng]);
                    return <Polyline positions={positions} color="#ef4444" weight={5} />;
                  })()}
                </>
              )}
              {view === 'green' && (
                <>
                  {(viewingRecord?.points || mapPoints).length > 1 && (
                    <>
                      {(viewingRecord?.points || mapPoints).map((p, i, arr) => {
                        if (i === 0) return null;
                        const prev = arr[i - 1];
                        return <Polyline key={i} positions={[[prev.lat, prev.lng], [p.lat, p.lng]]} color={p.type === 'bunker' ? '#facc15' : '#10b981'} weight={p.type === 'bunker' ? 7 : 5} />;
                      })}
                      {(viewingRecord || mapCompleted) && (
                        <>
                          {(() => {
                            const pts = viewingRecord?.points || mapPoints;
                            const first = pts[0];
                            const last = pts[pts.length - 1];
                            return <Polyline positions={[[last.lat, last.lng], [first.lat, first.lng]]} color={last.type === 'bunker' ? '#facc15' : '#10b981'} weight={last.type === 'bunker' ? 7 : 5} />;
                          })()}
                          <Polygon positions={(viewingRecord?.points || mapPoints).map(p => [p.lat, p.lng])} fillColor="#10b981" fillOpacity={0.2} weight={0} />
                          {/* Contrasting Diameter Lines (Cyan) */}
                          {greenAnalysis?.pA && greenAnalysis?.pB && (
                            <Polyline positions={[[greenAnalysis.pA.lat, greenAnalysis.pA.lng], [greenAnalysis.pB.lat, greenAnalysis.pB.lng]]} color="#22d3ee" weight={2.5} dashArray="8, 8" opacity={0.8} />
                          )}
                          {greenAnalysis?.pC && greenAnalysis?.pD && (
                            <Polyline positions={[[greenAnalysis.pC.lat, greenAnalysis.pC.lng], [greenAnalysis.pD.lat, greenAnalysis.pD.lng]]} color="#22d3ee" weight={2.5} dashArray="8, 8" opacity={0.8} />
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </MapContainer>
          </main>

          <div className="absolute inset-x-0 bottom-0 z-[1000] p-4 pointer-events-none flex flex-col gap-3 items-center pb-10">
            <div className="flex flex-col gap-3 w-full max-w-[340px]">
              
              <div className="pointer-events-auto bg-slate-900 border border-white/20 rounded-[2.5rem] p-4 w-full shadow-2xl">
                <div className="flex justify-center mb-4">
                  <SignalStatus pos={pos} units={units} isHistorical={!!viewingRecord} />
                </div>
                {view === 'track' ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-[1.2] min-w-0 flex flex-col items-center">
                      <span className="text-[9px] font-black text-white/40 uppercase mb-0.5 tracking-widest">Dist</span>
                      <FitText maxFontSize={52} className="font-black text-emerald-400 leading-none tracking-tight">
                        {viewingRecord ? viewingRecord.primaryValue.replace(/[a-z²]/gi, '') : formatDist(accumulatedDist, units)}
                        <span className="text-[12px] ml-1 font-bold text-emerald-400/50">{units === 'Yards' ? 'yd' : 'm'}</span>
                      </FitText>
                    </div>
                    <div className="h-10 w-px bg-white/10 shrink-0"></div>
                    <div className="flex-1 min-w-0 flex flex-col items-center">
                      <span className="text-[9px] font-black text-white/40 uppercase mb-0.5 tracking-widest">Elev</span>
                      <FitText maxFontSize={52} className="font-black text-amber-400 leading-none tracking-tight">
                        {viewingRecord ? viewingRecord.secondaryValue?.replace('Elev: ', '').replace(/[a-z²]/gi, '') : ((elevDelta >= 0 ? '+' : '') + formatAlt(elevDelta, units))}
                        <span className="text-[12px] ml-1 font-bold text-amber-400/50">{units === 'Yards' ? 'ft' : 'm'}</span>
                      </FitText>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="text-center flex flex-col items-center justify-center">
                        <span className="text-white/40 text-[8px] font-black uppercase tracking-[0.2em] mb-1">Area</span>
                        <div className="text-3xl font-black text-emerald-400 leading-none">
                          {viewingRecord ? viewingRecord.primaryValue.replace(/[a-z²]/gi, '') : (greenAnalysis ? Math.round(greenAnalysis.area * (units === 'Yards' ? 1.196 : 1)) : '--')}
                          <span className="text-[11px] ml-0.5 opacity-40 font-black">{units === 'Yards' ? 'yd²' : 'm²'}</span>
                        </div>
                      </div>
                      <div className="text-center flex flex-col items-center justify-center">
                        <span className="text-white/40 text-[8px] font-black uppercase tracking-[0.2em] mb-1">Perim</span>
                        <div className="text-3xl font-black text-blue-400 leading-none">
                          {greenAnalysis ? formatDist(greenAnalysis.perimeter, units) : '--'}
                          <span className="text-[11px] ml-0.5 opacity-40 font-black">{units === 'Yards' ? 'yd' : 'm'}</span>
                        </div>
                      </div>
                      <div className="text-center flex flex-col items-center justify-center">
                        <span className="text-white/40 text-[8px] font-black uppercase tracking-[0.2em] mb-1">Bunk%</span>
                        <div className="text-3xl font-black text-orange-400 leading-none">
                          {viewingRecord ? viewingRecord.secondaryValue?.split(':')[1].trim().replace('%', '') : (greenAnalysis?.bunkerPct ?? '--')}
                          <span className="text-[11px] ml-0.5 opacity-40 font-black">%</span>
                        </div>
                      </div>
                    </div>
                    {(mapCompleted || viewingRecord) && greenAnalysis && (
                      <div className="bg-white/[0.05] rounded-3xl p-4 border border-white/10 flex flex-col gap-3 shadow-inner">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <span className="block text-[7px] font-black text-blue-400 uppercase tracking-widest mb-1">Effective Diameter (EGD)</span>
                            <div className="text-5xl font-black text-yellow-400 leading-none">
                              {viewingRecord?.egdValue?.replace('yd', '') || greenAnalysis.egd}
                              <span className="text-[14px] font-black ml-1.5 opacity-40">YD</span>
                            </div>
                          </div>
                          {greenAnalysis.isL && <div className="bg-amber-500 text-[8px] font-black text-black px-3 py-1 rounded-full shadow-lg h-fit uppercase">L-SHAPE</div>}
                        </div>
                        <div className="grid grid-cols-3 border-t border-white/10 pt-3 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/50 uppercase leading-none mb-1.5">W</span>
                            <span className="text-sm font-black text-white tabular-nums leading-none">{greenAnalysis.width?.toFixed(1)}</span>
                          </div>
                          <div className="flex flex-col border-l border-white/10 pl-2">
                            <span className="text-[8px] font-black text-white/50 uppercase leading-none mb-1.5">L</span>
                            <span className="text-sm font-black text-white tabular-nums leading-none">{greenAnalysis.length?.toFixed(1)}</span>
                          </div>
                          <div className="flex flex-col border-l border-white/10 pl-2">
                            <span className="text-[8px] font-black text-blue-400 uppercase leading-none mb-1.5">Ratio</span>
                            <span className="text-sm font-black text-white tabular-nums leading-none">{greenAnalysis.ratio?.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="pointer-events-auto flex gap-2 w-full">
                {viewingRecord ? (
                  <div className="w-full flex items-center justify-center p-3.5 bg-slate-800/40 rounded-full border border-white/5 shadow-inner">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Return Home to Map New {view === 'track' ? 'Track' : 'Green'}</span>
                  </div>
                ) : (
                  <>
                    {view === 'track' ? (
                      <>
                        <button onClick={() => { if (!trkActive) { setTrkActive(true); setTrkStart(pos); setTrkPivots([]); } else setShowEndConfirm(true); }} className={`flex-1 h-11 rounded-full font-black text-[11px] tracking-[0.15em] uppercase border-2 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${trkActive ? 'bg-red-600 border-red-500 text-white' : 'bg-emerald-600 border-emerald-500 text-white'}`}>
                          <Navigation2 size={14} /> {trkActive ? 'FINISH' : 'START'}
                        </button>
                        {trkActive && (
                          <div className="flex-1 flex gap-1">
                            <button onClick={() => trkPivots.length < 3 && pos && setTrkPivots([...trkPivots, pos])} className="flex-1 h-11 rounded-full bg-blue-600 border-2 border-blue-500 text-white font-black text-[11px] tracking-[0.15em] uppercase shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
                              <Anchor size={14} /> PIVOT {trkPivots.length}/3
                            </button>
                            {trkPivots.length > 0 && <button onClick={() => setTrkPivots(prev => prev.slice(0, -1))} className="w-11 h-11 bg-slate-800 border-2 border-white/20 text-white rounded-full flex items-center justify-center active:scale-90 shadow-xl"><RotateCcw size={16} /></button>}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <button onClick={() => { if (mapCompleted) { setMapPoints([]); setMapCompleted(false); setMapActive(false); } else if (!mapActive) { setMapPoints(pos ? [pos] : []); setMapActive(true); } else { handleFinalizeGreen(); } }} className={`flex-1 h-11 rounded-full font-black text-[11px] tracking-[0.15em] uppercase border-2 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${mapActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-emerald-600 border-emerald-500 text-white'}`}>
                          {mapActive ? 'COMPLETE' : (mapCompleted ? 'RESTART' : 'NEW GREEN')}
                        </button>
                        {mapActive && <button onPointerDown={() => setIsBunker(true)} onPointerUp={() => setIsBunker(false)} onPointerLeave={() => setIsBunker(false)} className={`flex-1 h-11 rounded-full font-black text-[11px] tracking-[0.15em] uppercase shadow-xl transition-all border-2 flex items-center justify-center gap-2 ${isBunker ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-800 border-orange-500/50 text-orange-400'}`}>{isBunker ? 'RECORDING...' : 'BUNKER (HOLD)'}</button>}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`.custom-map-container { background-color: #020617 !important; }.leaflet-tile-pane { filter: brightness(0.6) contrast(1.2); }`}</style>
    </div>
  );
};

const container = document.getElementById('root');
if (container) createRoot(container).render(<App />);
