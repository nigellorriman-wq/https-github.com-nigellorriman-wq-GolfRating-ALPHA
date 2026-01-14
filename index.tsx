
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, CircleMarker, Polyline, Circle, useMap, Polygon } from 'react-leaflet';
import * as L from 'leaflet';
import { 
  ChevronLeft,
  Navigation2,
  Layers,
  RotateCcw,
  Target,
  History as HistoryIcon,
  Trash2,
  AlertCircle,
  Ruler,
  Eye,
  Anchor,
  Undo2,
  Download,
  Activity,
  Cpu,
  BookOpen,
  X,
  Type,
  Info
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

const exportToKML = (records: SavedRecord[]) => {
  let kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Scottish Golf Export</name>`;
  records.forEach(rec => {
    const coords = rec.points.map(p => `${p.lng},${p.lat},${p.alt || 0}`).join(' ');
    kml += `<Placemark><name>${rec.type} - ${rec.primaryValue}</name><description>${rec.egdValue || rec.secondaryValue || ''}</description><LineString><coordinates>${coords}</coordinates></LineString></Placemark>`;
  });
  kml += `</Document></kml>`;
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `golf_export_${Date.now()}.kml`;
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
    while (textRef.current.scrollWidth > containerRef.current.clientWidth && currentSize > 8) {
      currentSize -= 1;
      textRef.current.style.fontSize = `${currentSize}px`;
    }
    setFontSize(currentSize);
  }, [maxFontSize, children]);
  return <div ref={containerRef} className="w-full flex justify-center items-center overflow-hidden"><div ref={textRef} className={className} style={{ fontSize: `${fontSize}px`, whiteSpace: 'nowrap' }}>{children}</div></div>;
};

const MapController: React.FC<{ 
  pos: GeoPoint | null, active: boolean, trkStart: GeoPoint | null, trkPivots: GeoPoint[], mapPoints: GeoPoint[], completed: boolean, viewingRecord: SavedRecord | null, mode: AppView
}> = ({ pos, active, trkStart, trkPivots, mapPoints, completed, viewingRecord, mode }) => {
  const map = useMap();
  useEffect(() => {
    if (viewingRecord && viewingRecord.points.length > 0) {
      const bounds = L.latLngBounds(viewingRecord.points.map(p => [p.lat, p.lng]));
      if (viewingRecord.pivots) viewingRecord.pivots.forEach(pv => bounds.extend([pv.lat, pv.lng]));
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    } else if (completed && mode === 'green' && mapPoints.length > 2) {
      map.fitBounds(L.latLngBounds(mapPoints.map(p => [p.lat, p.lng])), { padding: [50, 50], animate: true });
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

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('landing');
  const [units, setUnits] = useState<UnitSystem>('Yards');
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

  return (
    <div className="flex flex-col h-full w-full bg-[#020617] text-white overflow-hidden absolute inset-0 select-none">
      <div className="h-[env(safe-area-inset-top)] bg-[#0f172a]"></div>
      
      {showManual && (
        <div className="fixed inset-0 z-[3000] flex flex-col bg-[#020617] p-6 animate-in slide-in-from-bottom duration-300">
          <header className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black italic tracking-tight text-blue-500 uppercase">User Manual</h2>
            <button onClick={() => setShowManual(false)} className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center border border-white/10"><X size={24} /></button>
          </header>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-8 pb-10 text-white">
            <section>
              <h3 className="text-emerald-500 font-black uppercase text-xs mb-3 flex items-center gap-2"><Navigation2 size={14} /> Distance Tracker</h3>
              <ul className="space-y-3 text-[13px] text-slate-400 font-medium leading-relaxed">
                <li className="flex gap-3"><span className="text-emerald-500 font-black shrink-0">01.</span> Start at your ball or tee position. Press START.</li>
                <li className="flex gap-3"><span className="text-emerald-500 font-black shrink-0">02.</span> Walk the line of the hole. For dog-legs, press PIVOT at the corner.</li>
                <li className="flex gap-3"><span className="text-emerald-500 font-black shrink-0">03.</span> Reach the target and press FINISH. Distance is cumulative through pivots.</li>
              </ul>
            </section>
            <section>
              <h3 className="text-blue-500 font-black uppercase text-xs mb-3 flex items-center gap-2"><Target size={14} /> Green Mapper</h3>
              <ul className="space-y-3 text-[13px] text-slate-400 font-medium leading-relaxed">
                <li className="flex gap-3"><span className="text-blue-500 font-black shrink-0">01.</span> Stand at any point on the green edge. Press START GREEN.</li>
                <li className="flex gap-3"><span className="text-blue-500 font-black shrink-0">02.</span> Walk the entire perimeter. Hold "BUNKER" while walking sections with bunkers.</li>
                <li className="flex gap-3"><span className="text-blue-500 font-black shrink-0">03.</span> Returning to the start point (within 1m) will automatically close the shape.</li>
              </ul>
            </section>
          </div>
          <button onClick={() => setShowManual(false)} className="w-full py-5 bg-blue-600 rounded-3xl font-black uppercase text-xs tracking-widest">Understood</button>
        </div>
      )}

      {showEndConfirm && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f172a] w-full max-w-xs rounded-[2rem] border border-white/10 p-6 text-center shadow-2xl">
            <h3 className="text-lg font-black uppercase mb-4 text-white">Save Track?</h3>
            <button onClick={() => { if (trkStart && pos) saveRecord({ type: 'Track', primaryValue: formatDist(accumulatedDist, units) + (units === 'Yards' ? 'yd' : 'm'), secondaryValue: `Elev: ${(elevDelta >= 0 ? '+' : '') + formatAlt(elevDelta, units) + (units === 'Yards' ? 'ft' : 'm')}`, points: [trkStart, pos], pivots: trkPivots }); setTrkActive(false); setShowEndConfirm(false); }} className="w-full py-4 bg-blue-600 rounded-2xl font-black text-lg uppercase mb-2 tracking-widest">Save</button>
            <button onClick={() => setShowEndConfirm(false)} className="w-full py-4 bg-slate-800 rounded-2xl font-black text-lg uppercase text-slate-400 tracking-widest">Cancel</button>
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
            <button onClick={() => { setView('track'); setViewingRecord(null); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center shadow-2xl active:bg-slate-800 transition-colors"><div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-6"><Navigation2 size={28} /></div><h2 className="text-xl font-black mb-1 uppercase italic text-blue-500">Distance tracker</h2><p className="text-white text-[10px] opacity-60">Realtime accumulated distance & pivots</p></button>
            <button onClick={() => { setView('green'); setMapCompleted(false); setMapPoints([]); setViewingRecord(null); }} className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center shadow-2xl active:bg-slate-800 transition-colors"><div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mb-6"><Target size={28} /></div><h2 className="text-xl font-black mb-1 uppercase italic text-emerald-500">Green Mapper</h2><p className="text-white text-[10px] opacity-60">Area, Bunker & EGD analysis</p></button>
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
                      <button onClick={() => { setViewingRecord(item); setView(item.type === 'Track' ? 'track' : 'green'); }} className="bg-slate-900/50 border border-white/5 px-5 py-4 rounded-2xl flex flex-col min-w-[170px] text-left">
                        <span className="text-[7px] font-black text-slate-500 uppercase">{item.type}</span>
                        <span className="text-lg font-black text-white">{item.primaryValue}</span>
                        <span className="text-[10px] font-bold text-slate-400">{item.egdValue || item.secondaryValue}</span>
                      </button>
                      <button onClick={(e) => deleteHistory(item.id, e)} className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#020617] text-white shadow-lg active:scale-90 transition-all z-10"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-center">
              <button onClick={() => setShowManual(true)} className="w-[160px] bg-slate-800/80 border border-white/10 p-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg"><BookOpen size={16} className="text-blue-500" /><span className="text-[9px] font-black uppercase tracking-widest text-slate-300">User Manual</span></button>
            </div>
          </footer>
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative animate-in slide-in-from-right duration-300">
          <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none flex justify-between items-start">
            <button onClick={() => { setView('landing'); setTrkActive(false); setMapActive(false); setMapCompleted(false); setViewingRecord(null); }} className="pointer-events-auto bg-[#0f172a]/95 border border-white/10 px-5 py-3 rounded-full flex items-center gap-3"><ChevronLeft size={20} className="text-emerald-400" /><span className="text-[11px] font-black uppercase tracking-[0.2em]">Home</span></button>
            <div className="flex gap-2"><button onClick={() => setUnits(u => u === 'Yards' ? 'Metres' : 'Yards')} className="pointer-events-auto bg-[#0f172a]/95 border border-white/10 p-3.5 rounded-full"><Ruler size={22} className="text-emerald-400" /></button><button onClick={() => setMapStyle(s => s === 'Street' ? 'Satellite' : 'Street')} className="pointer-events-auto bg-[#0f172a]/95 border border-white/10 p-3.5 rounded-full"><Layers size={22} className="text-blue-400" /></button></div>
          </div>
          <main className="flex-1">
            <MapContainer center={[0, 0]} zoom={2} className="h-full w-full custom-map-container" zoomControl={false} attributionControl={false}>
              <TileLayer url={mapStyle === 'Street' ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"} maxZoom={22} maxNativeZoom={19} />
              <MapController pos={pos} active={trkActive || mapActive} trkStart={trkStart} trkPivots={trkPivots} mapPoints={mapPoints} completed={mapCompleted} viewingRecord={viewingRecord} mode={view} />
              {pos && (view !== 'green' || !mapCompleted) && !viewingRecord && (
                <><Circle center={[pos.lat, pos.lng]} radius={pos.accuracy} pathOptions={{ color: getAccuracyColor(pos.accuracy), fillOpacity: 0.1, weight: 1 }} /><CircleMarker center={[pos.lat, pos.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 1, weight: 2.5 }} /></>
              )}
              {view === 'track' && (trkStart && pos && !viewingRecord) && (
                <><CircleMarker center={[trkStart.lat, trkStart.lng]} radius={6} pathOptions={{ color: '#fff', fillColor: '#3b82f6', fillOpacity: 1 }} />{trkPivots.map((pv, i) => <CircleMarker key={i} center={[pv.lat, pv.lng]} radius={6} pathOptions={{ color: '#fff', fillColor: '#f59e0b', fillOpacity: 1 }} />)}<Polyline positions={[[trkStart.lat, trkStart.lng] as [number, number], ...trkPivots.map(p => [p.lat, p.lng] as [number, number]), [pos.lat, pos.lng] as [number, number]]} color="#3b82f6" weight={5} /></>
              )}
              {view === 'green' && (
                <>
                  {(viewingRecord?.points || mapPoints).length > 1 && (
                    <>
                      {(viewingRecord?.points || mapPoints).map((p, i, arr) => {
                        if (i === 0) return null;
                        const prev = arr[i - 1];
                        return <Polyline key={i} positions={[[prev.lat, prev.lng], [p.lat, p.lng]]} color={p.type === 'bunker' ? '#f59e0b' : '#10b981'} weight={p.type === 'bunker' ? 7 : 5} />;
                      })}
                      {(viewingRecord || mapCompleted) && <Polygon positions={(viewingRecord?.points || mapPoints).map(p => [p.lat, p.lng])} fillColor="#10b981" fillOpacity={0.2} weight={0} />}
                      {(viewingRecord || mapCompleted) && greenAnalysis?.pA && greenAnalysis?.pB && (
                        <Polyline positions={[[greenAnalysis.pA.lat, greenAnalysis.pA.lng], [greenAnalysis.pB.lat, greenAnalysis.pB.lng]]} color="#facc15" weight={2} opacity={0.8} />
                      )}
                      {(viewingRecord || mapCompleted) && greenAnalysis?.pC && greenAnalysis?.pD && (
                        <Polyline positions={[[greenAnalysis.pC.lat, greenAnalysis.pC.lng], [greenAnalysis.pD.lat, greenAnalysis.pD.lng]]} color="#ffffff" weight={1} dashArray="5, 5" opacity={0.6} />
                      )}
                    </>
                  )}
                </>
              )}
            </MapContainer>
          </main>
          <div className="absolute inset-x-0 bottom-0 z-[1000] p-4 pointer-events-none flex flex-col gap-4 items-center">
            <div className="flex flex-col gap-4 w-full max-w-sm">
              {view === 'track' ? (
                <>
                  <div className="pointer-events-auto flex gap-2 w-full">
                    <button onClick={() => { if (!trkActive) { setTrkActive(true); setTrkStart(pos); setTrkPivots([]); } else setShowEndConfirm(true); }} className={`flex-1 h-16 rounded-3xl font-black text-lg uppercase border border-white/10 shadow-lg ${trkActive ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                      <span className="flex items-center justify-center gap-2"><Navigation2 size={24} /> {trkActive ? 'FINISH' : 'START'}</span>
                    </button>
                    {trkActive && (
                      <button onClick={() => trkPivots.length < 3 && pos && setTrkPivots([...trkPivots, pos])} className="flex-1 h-16 rounded-3xl bg-blue-600 text-white font-black text-lg uppercase shadow-lg">
                        <span className="flex items-center justify-center gap-2"><Anchor size={20} /> PIVOT {trkPivots.length}/3</span>
                      </button>
                    )}
                  </div>
                  <div className="pointer-events-auto bg-[#0f172a]/95 border border-white/10 rounded-[2.5rem] p-3.5 w-full shadow-2xl">
                    <div className="flex items-center justify-around">
                      <div className="flex-1 text-center"><span className="text-[10px] font-black text-white/40 uppercase mb-1">Distance</span><FitText maxFontSize={48} className="font-black text-emerald-400 leading-tight">{viewingRecord ? viewingRecord.primaryValue.replace(/[a-z²]/gi, '') : formatDist(accumulatedDist, units)}<span className="text-[14px] ml-1 font-bold">{units === 'Yards' ? 'yd' : 'm'}</span></FitText></div>
                      <div className="h-10 w-px bg-white/10 mx-2"></div>
                      <div className="flex-1 text-center"><span className="text-[10px] font-black text-white/40 uppercase mb-1">Elevation</span><FitText maxFontSize={48} className="font-black text-amber-400 leading-tight">{viewingRecord ? viewingRecord.secondaryValue?.replace('Elev: ', '').replace(/[a-z²]/gi, '') : ((elevDelta >= 0 ? '+' : '') + formatAlt(elevDelta, units))}<span className="text-[14px] ml-1 font-bold">{units === 'Yards' ? 'ft' : 'm'}</span></FitText></div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="pointer-events-auto flex gap-2 w-full">
                    <button onClick={() => { if (mapCompleted) { setMapPoints([]); setMapCompleted(false); setMapActive(false); } else if (!mapActive) { setMapPoints(pos ? [pos] : []); setMapActive(true); } else { handleFinalizeGreen(); } }} className="flex-1 h-16 rounded-3xl font-black text-lg uppercase bg-emerald-600 text-white shadow-lg">
                      {mapActive ? 'CLOSE GREEN' : (mapCompleted ? 'NEW GREEN' : 'START GREEN')}
                    </button>
                    {mapActive && (
                      <button 
                        onPointerDown={() => setIsBunker(true)} 
                        onPointerUp={() => setIsBunker(false)} 
                        onPointerLeave={() => setIsBunker(false)} 
                        className={`flex-1 h-16 rounded-3xl font-black text-lg uppercase shadow-lg transition-all duration-75 active:scale-95 ${isBunker ? 'bg-amber-600 text-white ring-4 ring-white/30' : 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/40'}`}
                      >
                        {isBunker ? 'RECORDING...' : 'BUNKER (HOLD)'}
                      </button>
                    )}
                  </div>
                  <div className="pointer-events-auto bg-[#0f172a]/95 border border-white/10 rounded-[2.5rem] p-4 w-full shadow-2xl">
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center"><span className="text-white/40 text-[7px] font-black uppercase">Area</span><div className="text-xl font-black text-emerald-400">{greenAnalysis ? Math.round(greenAnalysis.area * (units === 'Yards' ? 1.196 : 1)) : '--'}<span className="text-[9px] ml-1">{units === 'Yards' ? 'yd²' : 'm²'}</span></div></div>
                      <div className="text-center"><span className="text-white/40 text-[7px] font-black uppercase">Perimeter</span><div className="text-xl font-black text-blue-400">{greenAnalysis ? formatDist(greenAnalysis.perimeter, units) : '--'}<span className="text-[9px] ml-1">{units === 'Yards' ? 'yd' : 'm'}</span></div></div>
                      <div className="text-center"><span className="text-white/40 text-[7px] font-black uppercase">Bunker %</span><div className="text-xl font-black text-orange-400">{greenAnalysis?.bunkerPct ?? '--'}%</div></div>
                    </div>
                    {(mapCompleted || viewingRecord) && greenAnalysis && (
                      <div className="bg-white/[0.03] rounded-2xl p-3 border border-white/5">
                        <div className="flex items-center justify-between mb-2"><span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Effective Green Diameter (EGD)</span>{greenAnalysis.isL && <span className="bg-amber-500 text-[7px] font-black text-black px-2 py-0.5 rounded-full">L-SHAPE DETECTED</span>}</div>
                        <div className="flex items-end justify-between">
                          <div className="text-4xl font-black text-yellow-400 leading-none">{greenAnalysis.egd}<span className="text-[12px] font-bold ml-1 opacity-40">YARDS</span></div>
                          <div className="text-right"><span className="block text-[8px] font-black text-white/30 uppercase tracking-tighter">L: {greenAnalysis.length?.toFixed(1)}yd | W: {greenAnalysis.width?.toFixed(1)}yd</span><span className="block text-[8px] font-black text-white/30 uppercase tracking-tighter">Ratio: {greenAnalysis.ratio?.toFixed(2)}:1</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
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
