import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const INITIAL_STRUCTURE = [
  { id: "f1", name: "Floor 1", sensors: [{ id: "s1", name: "A" }, { id: "s2", name: "B" }, { id: "s3", name: "C" }] },
  { id: "f2", name: "Floor 2", sensors: [{ id: "s4", name: "A" }, { id: "s5", name: "B" }, { id: "s6", name: "C" }, { id: "s7", name: "D" }] },
];

const PALETTE = ["#e05c2a","#3a8fd1","#2ac48a","#c43a8f","#f0c040","#8f3ac4","#40c4f0","#c4f040","#f04060","#60f0c4"];
const COLORS = { temp: "#e05c2a", humidity: "#3a8fd1" };
const FILE_PATH = "temp_monitor_data.json";

// Configured from environment variables; set VITE_GITHUB_TOKEN, VITE_GITHUB_OWNER, VITE_GITHUB_REPO
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || "";
const GITHUB_OWNER = import.meta.env.VITE_GITHUB_OWNER || "darkmatterearthequake";
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || "temp-monitor-data";
const GITHUB_BRANCH = import.meta.env.VITE_GITHUB_BRANCH || "main";

let uidCounter = 100;
const uid = () => `id_${uidCounter++}`;

// ── GitHub helpers ────────────────────────────────────────────────────────────

async function githubRequest(method, path, body) {
  if (!GITHUB_TOKEN) throw new Error("VITE_GITHUB_TOKEN is not set");
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    throw Object.assign(new Error(err.message || `GitHub API error ${status}`), { status });
  }
  return res.json();
}

// Returns { data, sha } or { data: null, sha: null } if file doesn't exist
async function readFile() {
  try {
    const resp = await githubRequest(
      "GET",
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${GITHUB_BRANCH}`
    );
    const json = decodeURIComponent(escape(atob(resp.content.replace(/\n/g, ""))));
    return { data: JSON.parse(json), sha: resp.sha };
  } catch (e) {
    if (e.status === 404) return { data: null, sha: null };
    throw e;
  }
}

// Creates or updates the file; returns new sha
async function saveFile(sha, payload) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
  const resp = await githubRequest(
    "PUT",
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
    {
      message: sha ? `chore: update ${FILE_PATH}` : `chore: create ${FILE_PATH}`,
      content,
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }
  );
  return resp.content.sha;
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",").map(s => s.trim());
  const tsIdx = header.findIndex(h => /timestamp|date|time/i.test(h));
  const tempIdx = header.findIndex(h => /temp/i.test(h));
  const humIdx = header.findIndex(h => /humid|rh|relative/i.test(h));
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 2) continue;
    const ts = tsIdx >= 0 ? cols[tsIdx].trim() : "";
    const temp = tempIdx >= 0 ? parseFloat(cols[tempIdx]) : NaN;
    const hum = humIdx >= 0 ? parseFloat(cols[humIdx]) : NaN;
    if (!isNaN(temp)) data.push({ ts, temp: +temp.toFixed(2), hum: isNaN(hum) ? null : +hum.toFixed(1) });
  }
  return data;
}

function formatTS(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleTimeString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 400,
      background: active ? "#e05c2a" : "#2a2a3e", color: active ? "#fff" : "#888", transition: "all 0.15s",
    }}>{children}</button>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#aaa", userSelect: "none" }}>
      <div onClick={() => onChange(!value)}
        style={{ width: 36, height: 20, borderRadius: 10, background: value ? COLORS.humidity : "#444", position: "relative", transition: "background 0.2s", cursor: "pointer" }}>
        <div style={{ position: "absolute", top: 2, left: value ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </div>
      {label}
    </label>
  );
}

function InlineEdit({ value, onSave, style: extraStyle = {} }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const commit = () => { if (val.trim()) onSave(val.trim()); setEditing(false); };
  if (editing) return (
    <input value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      autoFocus style={{ background: "#111", border: "1px solid #555", borderRadius: 4, color: "#cdd6f4", padding: "2px 6px", fontSize: "inherit", fontWeight: "inherit", ...extraStyle }} />
  );
  return (
    <span onClick={() => { setVal(value); setEditing(true); }} title="Click to rename"
      style={{ cursor: "text", borderBottom: "1px dashed #555", paddingBottom: 1, ...extraStyle }}>{value}</span>
  );
}

function StatusBadge({ status, message }) {
  const colors = { idle: "#555", saving: "#f0c040", saved: "#2ac48a", error: "#e05c2a", loading: "#3a8fd1" };
  const icons = { idle: "", saving: "↑", saved: "✓", error: "!", loading: "↓" };
  return (
    <div style={{ fontSize: 11, color: colors[status] || "#555", display: "flex", alignItems: "center", gap: 4 }}>
      {icons[status] && <span>{icons[status]}</span>}
      <span>{message}</span>
    </div>
  );
}

// ── Summary chart ─────────────────────────────────────────────────────────────

function downsample(arr, n = 400) {
  if (!arr || arr.length <= n) return arr;
  const step = Math.ceil(arr.length / n);
  return arr.filter((_, i) => i % step === 0);
}

function filterByTime(data, range) {
  if (!data || range === "all") return data;
  const now = new Date(data[data.length - 1]?.ts);
  if (isNaN(now)) return data;
  const hours = { "1h": 1, "6h": 6, "24h": 24, "7d": 168 }[range];
  if (!hours) return data;
  const cutoff = new Date(now.getTime() - hours * 3600 * 1000);
  return data.filter(d => new Date(d.ts) >= cutoff);
}

function buildSummaryData(seriesList, timeRange, metric, bins = 400) {
  const filtered = seriesList.map(s => ({ ...s, data: filterByTime(s.data, timeRange) })).filter(s => s.data.length > 0);
  if (filtered.length === 0) return { data: [], keys: [] };
  let minT = Infinity, maxT = -Infinity;
  filtered.forEach(s => s.data.forEach(d => {
    const t = new Date(d.ts).getTime();
    if (!isNaN(t)) { minT = Math.min(minT, t); maxT = Math.max(maxT, t); }
  }));
  if (minT === Infinity) return { data: [], keys: [] };
  const binSize = (maxT - minT) / bins || 1;
  const buckets = Array.from({ length: bins }, (_, i) => {
    const obj = { ts: new Date(minT + i * binSize).toISOString() };
    filtered.forEach(s => { obj[s.key + "_vals"] = []; });
    return obj;
  });
  filtered.forEach(s => s.data.forEach(d => {
    const t = new Date(d.ts).getTime();
    if (isNaN(t)) return;
    const idx = Math.min(Math.floor((t - minT) / binSize), bins - 1);
    const v = metric === "temp" ? d.temp : d.hum;
    if (v != null) buckets[idx][s.key + "_vals"].push(v);
  }));
  const avg = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
  const result = buckets.map(b => {
    const row = { ts: b.ts };
    filtered.forEach(s => { row[s.key] = avg(b[s.key + "_vals"]); });
    return row;
  }).filter(row => filtered.some(s => row[s.key] != null));
  return { data: result, keys: filtered.map(s => ({ key: s.key, label: s.label })) };
}

function SummaryChart({ floors, sensorData }) {
  const [timeRange, setTimeRange] = useState("all");
  const [metric, setMetric] = useState("temp");
  const [groupBy, setGroupBy] = useState("floor");

  const seriesGroups = useMemo(() => {
    if (groupBy === "house") {
      const allData = floors.flatMap(fl => fl.sensors.flatMap(s => sensorData[s.id] || [])).sort((a, b) => new Date(a.ts) - new Date(b.ts));
      return [{ key: "house", label: "House 1", data: allData }];
    }
    if (groupBy === "floor") {
      return floors.map(fl => ({
        key: fl.id, label: fl.name,
        data: fl.sensors.flatMap(s => sensorData[s.id] || []).sort((a, b) => new Date(a.ts) - new Date(b.ts)),
      })).filter(s => s.data.length > 0);
    }
    return floors.flatMap(fl => fl.sensors.map(s => ({ key: s.id, label: `${fl.name} › ${s.name}`, data: sensorData[s.id] || [] }))).filter(s => s.data.length > 0);
  }, [floors, sensorData, groupBy]);

  const { data, keys } = useMemo(() => buildSummaryData(seriesGroups, timeRange, metric), [seriesGroups, timeRange, metric]);
  const unit = metric === "temp" ? "°C" : "%";

  return (
    <div style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: 12, padding: "18px 20px", marginBottom: 32 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#cdd6f4", marginBottom: 14 }}>Summary</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Time</span>
          {["1h","6h","24h","7d","all"].map(r => <Pill key={r} active={timeRange === r} onClick={() => setTimeRange(r)}>{r}</Pill>)}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Metric</span>
          <Pill active={metric === "temp"} onClick={() => setMetric("temp")}>Temperature</Pill>
          <Pill active={metric === "hum"} onClick={() => setMetric("hum")}>Humidity</Pill>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Group by</span>
          <Pill active={groupBy === "house"} onClick={() => setGroupBy("house")}>House</Pill>
          <Pill active={groupBy === "floor"} onClick={() => setGroupBy("floor")}>Floor</Pill>
          <Pill active={groupBy === "room"} onClick={() => setGroupBy("room")}>Room</Pill>
        </div>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis dataKey="ts" tickFormatter={formatTS} tick={{ fontSize: 9, fill: "#555" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "#888" }} width={40} tickFormatter={v => `${v}${unit}`} />
            <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 11 }} labelFormatter={formatTS}
              formatter={(val, name) => { const k = keys.find(k => k.key === name); return [`${val}${unit}`, k?.label || name]; }} />
            <Legend formatter={name => { const k = keys.find(k => k.key === name); return <span style={{ fontSize: 12, color: "#aaa" }}>{k?.label || name}</span>; }} />
            {keys.map((k, i) => <Line key={k.key} type="monotone" dataKey={k.key} stroke={PALETTE[i % PALETTE.length]} dot={false} strokeWidth={1.5} name={k.key} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 13, border: "1px dashed #2a2a3e", borderRadius: 8 }}>
          Load sensor data to see the summary chart
        </div>
      )}
    </div>
  );
}

// ── Sensor chart ──────────────────────────────────────────────────────────────

function SensorChart({ sensor, data, showHumidity, onRename, onDelete }) {
  const filtered = data ? downsample(data, 300) : null;
  return (
    <div style={{ background: "#1e1e2e", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#cdd6f4", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#555" }}>Sensor</span>
          <InlineEdit value={sensor.name} onSave={onRename} />
          {data && <span style={{ fontWeight: 400, fontSize: 11, color: "#555" }}>{data.length} samples</span>}
        </div>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16, padding: "0 2px" }}>×</button>
      </div>
      {filtered && filtered.length > 0 ? (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={filtered} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis dataKey="ts" tickFormatter={formatTS} tick={{ fontSize: 9, fill: "#555" }} interval="preserveStartEnd" />
            <YAxis yAxisId="temp" tick={{ fontSize: 9, fill: COLORS.temp }} width={36} tickFormatter={v => `${v}°`} />
            {showHumidity && <YAxis yAxisId="hum" orientation="right" tick={{ fontSize: 9, fill: COLORS.humidity }} width={36} tickFormatter={v => `${v}%`} />}
            <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 11 }} labelFormatter={formatTS}
              formatter={(val, name) => name === "temp" ? [`${val}°C`, "Temp"] : [`${val}%`, "Humidity"]} />
            <Line yAxisId="temp" type="monotone" dataKey="temp" stroke={COLORS.temp} dot={false} strokeWidth={1.5} name="temp" />
            {showHumidity && <Line yAxisId="hum" type="monotone" dataKey="hum" stroke={COLORS.humidity} dot={false} strokeWidth={1.5} name="hum" />}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 12, border: "1px dashed #2a2a3e", borderRadius: 6 }}>
          No data — drop a CSV to load
        </div>
      )}
    </div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();
  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    onFiles(Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".csv")));
  }, [onFiles]);
  return (
    <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={handleDrop} onClick={() => inputRef.current.click()}
      style={{ border: `2px dashed ${dragging ? "#e05c2a" : "#333"}`, borderRadius: 10, padding: "20px", textAlign: "center", cursor: "pointer", color: "#666", fontSize: 13, marginBottom: 28, transition: "border-color 0.2s", background: dragging ? "rgba(224,92,42,0.05)" : "transparent" }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>📂</div>
      <div>Drop CSV files here or click to browse</div>
      <div style={{ fontSize: 11, marginTop: 3, color: "#444" }}>Multiple files supported</div>
      <input ref={inputRef} type="file" accept=".csv" multiple onChange={e => { onFiles(Array.from(e.target.files).filter(f => f.name.endsWith(".csv"))); e.target.value = ""; }} style={{ display: "none" }} />
    </div>
  );
}

// ── Assign modal ──────────────────────────────────────────────────────────────

function AssignModal({ files, floors, onAssign, onClose }) {
  const allSensors = floors.flatMap(fl => fl.sensors.map(s => ({ label: `${fl.name} › ${s.name}`, key: s.id })));
  const [assignments, setAssignments] = useState(() => {
    const init = {};
    files.forEach((f, i) => { init[i] = allSensors[i % Math.max(allSensors.length, 1)]?.key || ""; });
    return init;
  });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#1e1e2e", borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: "#cdd6f4" }}>Assign files to sensors</div>
        {files.map((f, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4, wordBreak: "break-all" }}>{f.name}</div>
            <select value={assignments[i]} onChange={e => setAssignments(a => ({ ...a, [i]: e.target.value }))}
              style={{ width: "100%", padding: "6px 8px", background: "#111", color: "#cdd6f4", border: "1px solid #444", borderRadius: 6, fontSize: 13 }}>
              {allSensors.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 16px", background: "#333", color: "#cdd6f4", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Cancel</button>
          <button onClick={() => onAssign(assignments)} style={{ padding: "7px 16px", background: "#e05c2a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Load Data</button>
        </div>
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────

export default function App() {
  const [floors, setFloors] = useState(INITIAL_STRUCTURE);
  const [sensorData, setSensorData] = useState({});
  const [pendingFiles, setPendingFiles] = useState(null);
  const [showHumidity, setShowHumidity] = useState(true);
  const [fileSha, setFileSha] = useState(null);
  const [ghStatus, setGhStatus] = useState({ status: "loading", message: "Connecting to GitHub..." });
  const saveTimeout = useRef(null);
  const initialized = useRef(false);
  // Keep a ref so the debounced save closure always sees the latest sha
  const fileShaRef = useRef(null);

  useEffect(() => { fileShaRef.current = fileSha; }, [fileSha]);

  // Load from GitHub on mount
  useEffect(() => {
    if (!GITHUB_TOKEN) {
      setGhStatus({ status: "error", message: "VITE_GITHUB_TOKEN not set" });
      initialized.current = true;
      return;
    }
    (async () => {
      try {
        setGhStatus({ status: "loading", message: "Loading saved data..." });
        const { data: saved, sha } = await readFile();
        if (saved) {
          if (saved.floors) setFloors(saved.floors);
          if (saved.sensorData) setSensorData(saved.sensorData);
          setFileSha(sha);
          fileShaRef.current = sha;
          setGhStatus({ status: "saved", message: "Loaded from GitHub" });
        } else {
          setGhStatus({ status: "idle", message: "No saved file yet — will create on first change" });
        }
      } catch (e) {
        setGhStatus({ status: "error", message: `Could not connect to GitHub: ${e.message}` });
      }
      initialized.current = true;
    })();
  }, []);

  // Debounced auto-save whenever floors or sensorData change (after init)
  const triggerSave = useCallback((newFloors, newSensorData) => {
    if (!initialized.current) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setGhStatus({ status: "saving", message: "Saving..." });
    saveTimeout.current = setTimeout(async () => {
      try {
        const newSha = await saveFile(fileShaRef.current, { floors: newFloors, sensorData: newSensorData });
        setFileSha(newSha);
        fileShaRef.current = newSha;
        setGhStatus({ status: "saved", message: "Saved to GitHub" });
      } catch (e) {
        setGhStatus({ status: "error", message: `Save failed: ${e.message}` });
      }
    }, 800);
  }, []);

  const updateFloors = useCallback((updater) => {
    setFloors(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      triggerSave(next, sensorData);
      return next;
    });
  }, [sensorData, triggerSave]);

  const updateSensorData = useCallback((newData, currentFloors) => {
    setSensorData(newData);
    triggerSave(currentFloors, newData);
  }, [triggerSave]);

  const addFloor = () => updateFloors(f => [...f, { id: uid(), name: `Floor ${f.length + 1}`, sensors: [] }]);
  const renameFloor = (fid, name) => updateFloors(f => f.map(fl => fl.id === fid ? { ...fl, name } : fl));
  const deleteFloor = fid => {
    const fl = floors.find(f => f.id === fid);
    const newSensorData = { ...sensorData };
    if (fl) fl.sensors.forEach(s => delete newSensorData[s.id]);
    setSensorData(newSensorData);
    updateFloors(f => {
      const next = f.filter(fl => fl.id !== fid);
      triggerSave(next, newSensorData);
      return next;
    });
  };
  const addSensor = fid => updateFloors(f => f.map(fl => fl.id === fid ? { ...fl, sensors: [...fl.sensors, { id: uid(), name: String.fromCharCode(65 + fl.sensors.length) }] } : fl));
  const renameSensor = (fid, sid, name) => updateFloors(f => f.map(fl => fl.id === fid ? { ...fl, sensors: fl.sensors.map(s => s.id === sid ? { ...s, name } : s) } : fl));
  const deleteSensor = (fid, sid) => {
    const newSensorData = { ...sensorData };
    delete newSensorData[sid];
    setSensorData(newSensorData);
    updateFloors(f => {
      const next = f.map(fl => fl.id === fid ? { ...fl, sensors: fl.sensors.filter(s => s.id !== sid) } : fl);
      triggerSave(next, newSensorData);
      return next;
    });
  };

  const handleFiles = files => { if (files.length) setPendingFiles(files); };
  const handleAssign = async assignments => {
    const files = pendingFiles;
    const newData = { ...sensorData };
    await Promise.all(files.map((file, i) => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => { newData[assignments[i]] = parseCSV(e.target.result); resolve(); };
      reader.readAsText(file);
    })));
    updateSensorData(newData, floors);
    setPendingFiles(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#13131f", color: "#cdd6f4", fontFamily: "system-ui, sans-serif", padding: "24px 20px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Temperature Monitor</h1>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>House 1 &bull; {Object.keys(sensorData).length} sensor{Object.keys(sensorData).length !== 1 ? "s" : ""} loaded</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <StatusBadge {...ghStatus} />
            <Toggle value={showHumidity} onChange={setShowHumidity} label="Show Humidity" />
          </div>
        </div>

        <SummaryChart floors={floors} sensorData={sensorData} />
        <DropZone onFiles={handleFiles} />

        {floors.map(fl => (
          <div key={fl.id} style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #2a2a3e", paddingBottom: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#666", flex: 1 }}>
                <InlineEdit value={fl.name} onSave={name => renameFloor(fl.id, name)} />
              </div>
              <button onClick={() => addSensor(fl.id)} style={{ background: "#2a2a3e", border: "none", color: "#aaa", borderRadius: 5, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>+ Sensor</button>
              <button onClick={() => deleteFloor(fl.id)} style={{ background: "none", border: "none", color: "#444", fontSize: 16, cursor: "pointer", padding: "0 2px" }}>×</button>
            </div>
            {fl.sensors.length === 0 && <div style={{ color: "#444", fontSize: 12, padding: "10px 0" }}>No sensors — click "+ Sensor" to add one.</div>}
            {fl.sensors.map(s => (
              <SensorChart key={s.id} sensor={s} data={sensorData[s.id] || null} showHumidity={showHumidity}
                onRename={name => renameSensor(fl.id, s.id, name)} onDelete={() => deleteSensor(fl.id, s.id)} />
            ))}
          </div>
        ))}

        <button onClick={addFloor} style={{ width: "100%", padding: "12px", background: "#1e1e2e", border: "1px dashed #333", borderRadius: 10, color: "#666", fontSize: 13, cursor: "pointer", marginTop: 4 }}>
          + Add Floor
        </button>
      </div>

      {pendingFiles && <AssignModal files={pendingFiles} floors={floors} onAssign={handleAssign} onClose={() => setPendingFiles(null)} />}
    </div>
  );
}
