import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Navbar2 from "../components/Navbar2";
import { apiRequest, API_BASE_URL, getToken } from "../api/client";
import { io } from "socket.io-client";

import { ChevronDown } from "lucide-react";

import {
  Users,
  Activity,
  AlertTriangle,
  Waves,
  Heart,
  Gauge,
  Shield,
} from "lucide-react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import L from "leaflet";

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function formatMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return `${value}${suffix}`;
}

function diverStatusClass(status) {
  if (status === "EMERGENCY") {
    return "bg-red-100 text-red-700";
  }

  if (status === "DIVING") {
    return "bg-green-100 text-green-700";
  }

  if (status === "SURFACED") {
    return "bg-sky-100 text-sky-700";
  }

  return "bg-slate-100 text-slate-700";
}

function emergencyStyle(action) {
  if (action === "EMERGENCY_SOS") {
    return "border-red-500 bg-red-50";
  }

  return "border-yellow-500 bg-yellow-50";
}

function Dashboard() {
  const navigate = useNavigate();
  const token = getToken();

  const [missions, setMissions] = useState([]);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [mission, setMission] = useState(null);
  const [diversWithData, setDiversWithData] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [progress, setProgress] = useState(null);
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    const loadMissions = async () => {
      setIsLoadingMissions(true);
      setError("");

      try {
        const data = await apiRequest("/api/missions");
        const nextMissions = Array.isArray(data?.missions) ? data.missions : [];

        if (cancelled) {
          return;
        }

        setMissions(nextMissions);
        setSelectedMissionId(nextMissions[0]?._id || "");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load missions");
          setMissions([]);
          setSelectedMissionId("");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMissions(false);
        }
      }
    };

    loadMissions();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !selectedMissionId) {
      setMission(null);
      setDiversWithData([]);
      setEmergencies([]);
      setProgress(null);
      setIsLoadingDashboard(false);
      return;
    }

    let cancelled = false;

    const loadDashboard = async () => {
      setIsLoadingDashboard(true);
      setError("");

      try {
        const [dashboardData, progressData] = await Promise.all([
          apiRequest(`/api/dashboard/mission/${selectedMissionId}`),
          apiRequest(`/api/missions/${selectedMissionId}/progress`),
        ]);

        if (cancelled) {
          return;
        }

        setMission(dashboardData?.mission || null);
        setDiversWithData(
          Array.isArray(dashboardData?.divers) ? dashboardData.divers : []
        );
        setEmergencies(
          Array.isArray(dashboardData?.emergencies)
            ? dashboardData.emergencies
            : []
        );
        setProgress(progressData || null);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load dashboard data");
          setMission(null);
          setDiversWithData([]);
          setEmergencies([]);
          setProgress(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDashboard(false);
        }
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [token, selectedMissionId]);

  useEffect(() => {
    if (!token || !selectedMissionId) {
      return undefined;
    }

    const socket = io(API_BASE_URL, {
      transports: ["polling", "websocket"],
      auth: { token },
    });

    const refreshMissionData = async () => {
      try {
        const [dashboardData, progressData] = await Promise.all([
          apiRequest(`/api/dashboard/mission/${selectedMissionId}`),
          apiRequest(`/api/missions/${selectedMissionId}/progress`),
        ]);

        setMission(dashboardData?.mission || null);
        setDiversWithData(
          Array.isArray(dashboardData?.divers) ? dashboardData.divers : []
        );
        setEmergencies(
          Array.isArray(dashboardData?.emergencies)
            ? dashboardData.emergencies
            : []
        );
        setProgress(progressData || null);
      } catch (err) {
        setError(err.message || "Unable to refresh dashboard data");
      }
    };

    socket.on("connect", () => {
      socket.emit("joinMission", selectedMissionId);
    });

    socket.on("telemetry:update", refreshMissionData);
    socket.on("risk:alert", refreshMissionData);
    socket.on("battery:alert", refreshMissionData);
    socket.on("emergency:alert", refreshMissionData);
    socket.on("emergency:status-update", refreshMissionData);
    socket.on("dive:event", refreshMissionData);

    return () => {
      socket.disconnect();
    };
  }, [token, selectedMissionId]);

  const dashboardStats = useMemo(() => {
    const totalDivers = diversWithData.length;
    const activeDivers = diversWithData.filter(
      (item) => item?.diver?.status === "DIVING"
    ).length;
    const surfacedDivers = diversWithData.filter(
      (item) => item?.diver?.status === "SURFACED"
    ).length;
    const emergencyDivers = diversWithData.filter(
      (item) => item?.diver?.status === "EMERGENCY"
    ).length;

    return {
      totalDivers,
      activeDivers,
      surfacedDivers,
      emergencyDivers,
      alerts: emergencies.filter((item) => item.status !== "RESOLVED").length,
      missionProgress: progress?.progress ?? 0,
    };
  }, [diversWithData, emergencies, progress]);

  const mapDivers = useMemo(
    () =>
      diversWithData.filter((item) => {
        const telemetry = item?.latestTelemetry;
        return (
          telemetry &&
          telemetry.latitude !== null &&
          telemetry.latitude !== undefined &&
          telemetry.longitude !== null &&
          telemetry.longitude !== undefined
        );
      }),
    [diversWithData]
  );

  const mapCenter = useMemo(() => {
    const first = mapDivers[0]?.latestTelemetry;

    if (!first) {
      return null;
    }

    return [first.latitude, first.longitude];
  }, [mapDivers]);

  const diverIcon = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const isLoading = isLoadingMissions || isLoadingDashboard;
  const hasMissions = missions.length > 0;

  return (
    <>
      <Navbar2 />

      <div className="min-h-screen bg-sky-50 p-6">
        <div className="mx-auto max-w-[1500px]">

          {/* =================================================
              HEADER
          ================================================= */}

          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900">
              DiveQ Command Center
            </h1>

            <p className="mt-2 text-slate-600">
              Real-time mission monitoring and diver management
            </p>
          </div>

          {error ? (
            <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
              {error}
            </div>
          ) : null}

          {/* =================================================
              ACTIVE MISSION
          ================================================= */}

          <div className="mb-8 rounded-2xl border border-sky-100 bg-white p-5 shadow-lg">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Active Mission
                </h2>

                <p className="text-slate-500">
                  Select a mission to monitor divers and operations
                </p>
              </div>

              <div className="relative">
                <select
                  value={selectedMissionId}
                  onChange={(e) => setSelectedMissionId(e.target.value)}
                  disabled={!hasMissions || isLoadingMissions}
                  className="appearance-none rounded-xl border border-sky-200 bg-sky-50 px-5 py-3 pr-12 font-medium text-slate-800 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {!hasMissions ? (
                    <option value="">No missions available</option>
                  ) : (
                    missions.map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.missionName}
                      </option>
                    ))
                  )}
                </select>

                <ChevronDown
                  size={18}
                  className="pointer-events-none absolute right-4 top-4 text-slate-500"
                />
              </div>

            </div>
          </div>

          {!hasMissions && !isLoadingMissions ? (
            <div className="rounded-2xl border border-sky-100 bg-white p-10 text-center shadow-lg">
              <h2 className="text-2xl font-bold text-slate-900">
                No missions found
              </h2>
              <p className="mt-2 text-slate-500">
                There are no missions linked to this account yet.
              </p>
            </div>
          ) : isLoading ? (
            <div className="rounded-2xl border border-sky-100 bg-white p-10 text-center shadow-lg">
              <p className="text-lg font-medium text-slate-600">
                Loading dashboard data...
              </p>
            </div>
          ) : (
            <>

          {/* =================================================
              STATS
          ================================================= */}

          <div className="mb-8 grid gap-6 md:grid-cols-2 xl:grid-cols-5">

            {/* TOTAL DIVERS */}

            <div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">

                <div>
                  <p className="text-slate-500">
                    Total Divers
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    {dashboardStats.totalDivers}
                  </h2>
                </div>

                <Users
                  className="text-sky-600"
                  size={38}
                />

              </div>
            </div>

            {/* ACTIVE DIVERS */}

            <div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">

                <div>
                  <p className="text-slate-500">
                    Active Divers
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    {dashboardStats.activeDivers}
                  </h2>
                </div>

                <Activity
                  className="text-green-600"
                  size={38}
                />

              </div>
            </div>

            {/* SURFACED DIVERS */}

            <div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">

                <div>
                  <p className="text-slate-500">
                    Surfaced Divers
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    {dashboardStats.surfacedDivers}
                  </h2>
                </div>

                <Waves
                  className="text-sky-500"
                  size={38}
                />

              </div>
            </div>

            {/* EMERGENCY DIVERS */}

            <div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500">
                    Divers in Emergency
                  </p>
                  <h2 className="mt-2 text-3xl font-bold">
                    {dashboardStats.emergencyDivers}
                  </h2>
                </div>
                <AlertTriangle
                  className="text-red-500"
                  size={38}
                />
              </div>
            </div>

            {/* MISSION PROGRESS */}

            <div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">

                <div>
                  <p className="text-slate-500">
                    Mission Progress
                  </p>

                  <h2 className="mt-2 text-3xl font-bold">
                    {dashboardStats.missionProgress}%
                  </h2>
                </div>

                <Shield
                  className="text-sky-600"
                  size={38}
                />

              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{
                    width: `${dashboardStats.missionProgress}%`,
                  }}
                />
              </div>
            </div>

          </div>

          {/* =================================================
              ACTIVE DIVERS
          ================================================= */}

          <div className="mb-10">

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Active Divers
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Select a diver to open their monitoring page.
                </p>
              </div>

              <button
                onClick={() =>
                  diversWithData[0]?.diver?._id &&
                  navigate(`/monitoring/${diversWithData[0].diver._id}`)
                }
                disabled={!diversWithData[0]?.diver?._id}
                className="rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
              >
                Open Monitoring
              </button>
            </div>

            {diversWithData.length === 0 ? (
              <div className="rounded-2xl border border-sky-100 bg-white p-8 text-center text-slate-500 shadow-lg">
                No divers are assigned to this mission.
              </div>
            ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

              {diversWithData.map((item) => {
                const diver = item.diver || {};
                const telemetry = item.latestTelemetry;
                const fatigue = item.latestFatigue;
                const diverId = diver._id;

                return (
                <div
                  key={diverId}
                  className="rounded-2xl border border-sky-100 bg-white p-5 shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl"
                >

                  {/* CARD HEADER */}

                  <div className="mb-4 flex items-center justify-between">

                    <div>
                      <h3 className="text-lg font-bold">
                        {diver.name || "Unnamed diver"}
                      </h3>

                      <p className="mt-0.5 text-xs text-slate-400">
                        {diverId}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${diverStatusClass(diver.status)}`}
                    >
                      {diver.status || "UNKNOWN"}
                    </span>

                  </div>

                  {/* DIVER DETAILS */}

                  <div className="space-y-3">

                    {/* HEART RATE */}

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-slate-600">
                        <Heart size={16} />
                        Heart Rate
                      </span>

                      <span className="text-sm font-semibold">
                        {formatMetric(telemetry?.heartRate, " BPM")}
                      </span>
                    </div>

                    {/* OXYGEN */}

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-slate-600">
                        <Waves size={16} />
                        Oxygen
                      </span>

                      <span className="text-sm font-semibold">
                        {formatMetric(telemetry?.oxygenSaturation, "%")}
                      </span>
                    </div>

                    {/* DEPTH */}

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-slate-600">
                        <Gauge size={16} />
                        Depth
                      </span>

                      <span className="text-sm font-semibold">
                        {formatMetric(telemetry?.depth, " m")}
                      </span>
                    </div>

                    {/* BATTERY */}

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-slate-600">
                        <Shield size={16} />
                        Battery
                      </span>

                      <span className="text-sm font-semibold">
                        {formatMetric(telemetry?.batteryLevel, "%")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Respiratory Rate</span>
                      <span className="text-sm font-semibold">
                        {formatMetric(telemetry?.respiratoryRate, " bpm")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Gas Remaining</span>
                      <span className="text-sm font-semibold">
                        {formatMetric(telemetry?.gasRemaining, "%")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Water Temperature</span>
                      <span className="text-sm font-semibold">
                        {formatMetric(telemetry?.waterTemperature, " C")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Decompression</span>
                      <span className="text-sm font-semibold">
                        {telemetry?.decompressionStatus || "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">
                        Fatigue
                      </span>

                      <span className="text-sm font-semibold">
                        {fatigue
                          ? `${fatigue.fatigueLevel || "—"} (${formatMetric(fatigue.fatigueScore)})`
                          : "—"}
                      </span>
                    </div>

                    {fatigue?.recommendation ? (
                      <p className="text-xs text-slate-500">
                        {fatigue.recommendation}
                      </p>
                    ) : null}

                  </div>

                  {/* MONITOR BUTTON */}

                  <button
                    onClick={() =>
                      navigate(`/monitoring/${diverId}`)
                    }
                    disabled={!diverId}
                    className="mt-5 w-full rounded-xl bg-sky-600 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Monitor Diver
                  </button>

                </div>
                );
              })}

            </div>
            )}

          </div>
         {/* =================================================
    LIVE DIVER MAP
================================================= */}
<div className="mb-8 grid gap-6 lg:grid-cols-2">
<div className="mb-8 rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">
  <div className="mb-5">
    <h2 className="text-2xl font-bold">
      Live Diver Locations
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Real-time positions of active divers
    </p>
  </div>

  <div className="h-[450px] overflow-hidden rounded-2xl">
    {mapCenter ? (
    <MapContainer
      center={mapCenter}
      zoom={13}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      {mapDivers.map((item) => {
        const diver = item.diver || {};
        const telemetry = item.latestTelemetry;

        return (
        <Marker
          key={diver._id}
          position={[telemetry.latitude, telemetry.longitude]}
          icon={diverIcon}
        >
          <Popup>
            <div>
              <h3 className="font-bold">
                {diver.name}
              </h3>

              <p>ID: {diver._id}</p>
              <p>Status: {diver.status}</p>
              <p>Depth: {formatMetric(telemetry.depth, "m")}</p>
              <p>Oxygen: {formatMetric(telemetry.oxygenSaturation, "%")}</p>

              <button
                onClick={() =>
                  navigate(`/monitoring/${diver._id}`)
                }
                className="mt-2 rounded bg-sky-600 px-3 py-1 text-white"
              >
                Open Monitoring
              </button>
            </div>
          </Popup>
        </Marker>
        );
      })}
    </MapContainer>
    ) : (
      <div className="flex h-full items-center justify-center bg-sky-50 text-slate-500">
        No location data available
      </div>
    )}
  </div>
</div>
<div className="mb-8 rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">

  <div className="mb-5">
    <h2 className="text-2xl font-bold">
      Oxygen Consumption Trend
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Mission-wide oxygen trend
    </p>
  </div>

  <div className="flex h-[320px] items-center justify-center text-center text-slate-500">
    No historical telemetry available
  </div>

</div>
</div>

          {/* =================================================
              MISSION OVERVIEW + RECENT ACTIVITY
          ================================================= */}

          <div className="mb-8 grid gap-6 lg:grid-cols-3">

            {/* MISSION OVERVIEW */}

            <div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">

              <div className="mb-5 flex items-center gap-2">

                <Waves
                  className="text-sky-600"
                  size={23}
                />

                <h2 className="text-2xl font-bold">
                  Mission Overview
                </h2>

              </div>

              <div className="space-y-4">

                <div className="flex justify-between border-b pb-3">
                  <span className="text-slate-500">
                    Mission Name
                  </span>

                  <span className="font-semibold">
                    {mission?.missionName || "—"}
                  </span>
                </div>

                <div className="flex justify-between border-b pb-3">
                  <span className="text-slate-500">
                    Location
                  </span>

                  <span className="font-semibold">
                    {mission?.location || "—"}
                  </span>
                </div>

                <div className="flex justify-between border-b pb-3">
                  <span className="text-slate-500">
                    Start Time
                  </span>

                  <span className="font-semibold">
                    {formatDateTime(mission?.startedAt)}
                  </span>
                </div>

                <div className="flex justify-between border-b pb-3">
                  <span className="text-slate-500">
                    Mission Status
                  </span>

                  <span className={`font-bold ${mission?.status === "ACTIVE" ? "text-green-600" : "text-slate-800"}`}>
                    {mission?.status || "—"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Expected Duration
                  </span>

                  <span className="font-semibold">
                    {mission?.expectedDuration !== null &&
                    mission?.expectedDuration !== undefined
                      ? `${mission.expectedDuration} min`
                      : "—"}
                  </span>
                </div>

              </div>

            </div>

            {/* RECENT ACTIVITY */}

            <div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">

              <h2 className="mb-5 text-2xl font-bold">
                Recent Activity
              </h2>

              <p className="text-slate-500">
                No recent activity available for this mission.
              </p>

            </div>
            {/* LIVE ALERTS */}

<div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-lg">

  <div className="mb-5 flex items-center justify-between">

    <div>
      <h2 className="text-2xl font-bold">
        Live Alerts
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Active mission warnings
      </p>
    </div>

    <AlertTriangle
      className="text-red-500"
      size={24}
    />

  </div>

  <div className="space-y-4">

    {emergencies.length === 0 ? (
      <p className="text-slate-500">
        No emergencies reported for this mission.
      </p>
    ) : (
    emergencies.map((emergency) => (

      <div
        key={emergency._id}
        className={`rounded-xl border-l-4 p-4 ${emergencyStyle(emergency.action)}`}
      >

        <div className="mb-1 font-semibold">
          {emergency.action}
        </div>

        <p className="text-sm leading-5 text-slate-600">
          {emergency.diverId?.name || "Unknown diver"} · {emergency.status}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          {formatDateTime(emergency.triggeredAt)}
        </p>

      </div>

    ))
    )}

  </div>

  <button
    onClick={() => navigate("/alerts")}
    className="mt-5 w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
  >
    View All Alerts
  </button>

</div>
    
          </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}

export default Dashboard;
