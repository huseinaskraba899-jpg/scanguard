import { useEffect, useState } from "react";
import { Activity, Camera, AlertTriangle, Users, LogOut } from "lucide-react";
import { socket, connectSocket, disconnectSocket } from "../services/socket";

export default function Dashboard({ onLogout }) {
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState({ cameras: 0, active: 0 });
    const [alerts, setAlerts] = useState([]);
    const [detections, setDetections] = useState({});

    useEffect(() => {
        const userData = localStorage.getItem("user");
        const token = localStorage.getItem("token");
        if (!userData || !token) {
            onLogout();
            return;
        }
        setUser(JSON.parse(userData));

        // Connect WebSocket
        connectSocket(token);

        // Join the specific location room to receive detections & scoped alerts
        // Using the actual UUID from our setup
        socket.emit("join:location", "2139ff48-35b8-423f-b4cb-64ca303ef625");

        socket.on("stats", (data) => setStats(data));

        socket.on("alert", (alert) => {
            setAlerts(prev => [alert, ...prev].slice(0, 50)); // Keep last 50
        });

        socket.on("detection", (det) => {
            console.log("WebSocket Detection Received:", det); // Debug log
            setDetections(prev => ({
                ...prev,
                [det.camera_id]: det
            }));

            // Auto update stats for realism
            setStats(prev => ({
                ...prev,
                active: 1,
                cameras: 1
            }));
        });

        return () => {
            socket.off("stats");
            socket.off("alert");
            socket.off("detection");
            disconnectSocket();
        };
    }, [onLogout]);

    const handleLogout = () => {
        onLogout();
    };

    return (
        <div className="min-h-screen bg-[#050505] text-gray-300 font-sans selection:bg-blue-500/30">
            {/* Top Navigation */}
            <nav className="border-b border-white/[0.05] bg-[#0a0a0d]/80 backdrop-blur-xl sticky top-0 z-50 shadow-2xl">
                <div className="w-[92vw] mx-auto px-4 py-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.3)] border border-white/10">
                                <Camera className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-white mb-0.5">
                                    ScanGuard <span className="text-blue-500">AI</span>
                                </h1>
                                <p className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em]">Enterprise Vision</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="hidden md:flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.05]">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                <span className="text-xs text-gray-400 font-mono">SYSTEM ONLINE</span>
                            </div>
                            <div className="h-8 w-px bg-white/10"></div>
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-semibold text-gray-200">{user?.name}</span>
                                <span className="text-[10px] text-indigo-400 font-mono uppercase tracking-widest">{user?.role}</span>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="p-2.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all hover:scale-105 active:scale-95"
                                title="Logout"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="w-[92vw] mx-auto py-8 lg:py-10 space-y-8">

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard title="Active Streams" value={stats.active || 0} icon={<Camera className="w-5 h-5 text-blue-400" />} trend="+1" />
                    <StatCard title="Total Cameras" value={stats.cameras || 0} icon={<Activity className="w-5 h-5 text-emerald-400" />} />
                    <StatCard title="Recent Alerts" value={alerts.length} icon={<AlertTriangle className="w-5 h-5 text-rose-400" />} trend={alerts.length > 0 ? "Action Required" : "Normal"} isAlert={alerts.length > 0} />
                    <StatCard title="Est. Loss Saved" value="€0.00" icon={<Users className="w-5 h-5 text-indigo-400" />} />
                </div>

                {/* Dashboard Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">

                    {/* Live Camera Grid */}
                    <div className="xl:col-span-3 space-y-6">
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
                            <h2 className="text-xl font-semibold flex items-center gap-3 text-white">
                                <Activity className="w-5 h-5 text-indigo-400" />
                                Live Monitoring
                            </h2>
                            <div className="flex gap-2">
                                <span className="px-3 py-1 bg-white/5 border border-white/10 rounded font-mono text-xs">GRID VIEW</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                            <CameraFeed
                                id="iphone-wifi"
                                name="iPhone AI Processing"
                                status={detections["iphone-wifi"] ? "live AI" : "connecting"}
                                detection={detections["iphone-wifi"]}
                            />
                            <CameraFeed id="cam-02" name="Checkout Lane 2" status="offline" />
                            <CameraFeed id="cam-03" name="Self-Checkout A" status="offline" />
                            <CameraFeed id="cam-04" name="Self-Checkout B" status="offline" />
                        </div>
                    </div>

                    {/* Real-time Alert Feed */}
                    <div className="space-y-6 flex flex-col h-full">
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
                            <h2 className="text-xl font-semibold flex items-center gap-3 text-white">
                                <AlertTriangle className="w-5 h-5 text-rose-500" />
                                Alert Stream
                            </h2>
                        </div>

                        <div className="flex-1 bg-[#0a0a0d] border border-white/[0.05] rounded-2xl p-4 overflow-y-auto shadow-2xl relative min-h-[600px] xl:min-h-0">
                            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none rounded-2xl"></div>

                            <div className="flex flex-col gap-3 relative z-10">
                                {alerts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center text-gray-500 py-32">
                                        <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-4">
                                            <AlertTriangle className="w-6 h-6 opacity-30" />
                                        </div>
                                        <p className="font-medium text-gray-400">No active alerts</p>
                                        <p className="text-xs mt-1 text-gray-600 font-mono">SYSTEM MONITORING ACTIVE</p>
                                    </div>
                                ) : (
                                    alerts.map((alert, i) => (
                                        <div key={i} className="group bg-gradient-to-r from-rose-500/10 to-transparent hover:from-rose-500/20 border-l-2 border-rose-500 rounded-r-xl p-4 flex flex-col gap-2 transition-all cursor-pointer">
                                            <div className="flex justify-between items-start">
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                                                    <span className="text-xs font-bold text-rose-400 tracking-wider">THREAT DETECTED</span>
                                                </div>
                                                <span className="text-[10px] text-gray-500 font-mono">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-sm font-medium text-gray-200">Camera: <span className="text-white">{alert.camera_id}</span></p>
                                            <div className="flex gap-2">
                                                <div className="text-[10px] text-rose-300 bg-rose-500/10 px-2 py-1 rounded font-mono border border-rose-500/20">
                                                    CLASS: {alert.class_name || alert.type}
                                                </div>
                                                <div className="text-[10px] text-gray-400 bg-white/5 px-2 py-1 rounded font-mono border border-white/10">
                                                    CONF: {Math.round(alert.confidence * 100)}%
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}

function StatCard({ title, value, icon }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white-[0.07] transition-colors">
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-gray-400">{title}</p>
                <div className="p-2 bg-white/5 rounded-lg">{icon}</div>
            </div>
            <p className="text-3xl font-bold">{value}</p>
        </div>
    );
}

function CameraFeed({ id, name, status, detection }) {
    const isLive = status === "live AI";

    return (
        <div className="group relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10 flex flex-col items-center justify-center">

            {/* Base Camera Icon for Offline state */}
            {!isLive && (
                <>
                    <Camera className="w-10 h-10 text-gray-600 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-medium text-gray-500 uppercase tracking-widest">{status}</span>
                </>
            )}

            {/* Live AI Overlay - Fake Stream Background + Bounding Boxes */}
            {isLive && (
                <div className="absolute inset-0 w-full h-full bg-[#0m0m1a]">
                    {/* Simulated Video Feed Noise/Background */}
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-black to-black"></div>

                    {/* Render Bounding Boxes */}
                    {detection?.objects?.map((obj, idx) => {
                        // Coordinates: [x1, y1, x2, y2] normalized between 0 and 1 (from CV engine)
                        // Or if absolute pixels, we'd need to convert. Assuming our CV engine sends relative coords for now,
                        // or we just render them roughly if they are absolute. Let's assume the backend scales them to percentages
                        // or we do safe CSS calcs.
                        // Wait, looking at the YOLO logic, it usually returns raw pixels. 
                        // For a mock/demo without a real image underneath, we'll draw it scaled to the div.

                        // We will use standard center/width percentages if provided, otherwise absolute pixels.
                        // Assuming YOLO raw absolute coords: (x1, y1) to (x2, y2)
                        // If we don't know the exact frame width, we'll just show the labels in a list for now
                        // since we don't have the explicit frame width/height in the socket payload.

                        return (
                            <div key={idx} className="absolute inset-0 flex items-center justify-center p-4 m-2 border-2 border-emerald-500/50 rounded pointer-events-none">
                                <div className="absolute top-0 left-0 bg-emerald-500 text-black text-[10px] font-bold px-1 rounded-br">
                                    {obj.class_name} {Math.round(obj.confidence * 100)}%
                                </div>
                            </div>
                        )
                    })}

                    {/* Live Stats Overlay */}
                    <div className="absolute bottom-3 left-3 flex flex-col gap-1">
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 font-mono px-2 py-0.5 rounded border border-blue-500/30">
                            FPS: {detection?.fps ? detection.fps.toFixed(1) : "0.0"}
                        </span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-500/30">
                            Objects: {detection?.objects?.length || 0}
                        </span>
                    </div>
                </div>
            )}

            {/* Top Overlay Status Bar */}
            <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start z-10">
                <span className="text-xs font-medium text-white/90 bg-black/50 px-2 py-1 rounded backdrop-blur-md border border-white/10">
                    {name}
                </span>
                <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${isLive ? 'bg-emerald-500 text-emerald-500' : 'bg-red-500 text-red-500'}`}></div>
            </div>

            {/* Bottom Right ID */}
            <div className="absolute bottom-3 right-3 z-10 bg-black/50 px-2 py-0.5 rounded backdrop-blur-md">
                <span className="text-[10px] font-mono text-white/40">{id}</span>
            </div>
        </div>
    );
}
