import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Navbar2 from "../components/Navbar2";
import { apiRequest, API_BASE_URL, getToken } from "../api/client";
import { io } from "socket.io-client";

import {
  Brain,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Activity,
  HeartPulse,
  Gauge,
  Battery,
  Wind,
  UserRound,
  Clock3,
  FileText,
  RotateCcw,
  Siren,
} from "lucide-react";

function formatMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return `${value}${suffix}`;
}

function formatDateTime(value) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleString();
}

function formatRecommendation(value) {
  if (!value) {
    return "N/A";
  }

  return String(value).replaceAll("_", " ");
}

function mapFatigueToAiLevel(fatigueLevel) {
  if (fatigueLevel === "CRITICAL") {
    return "CRITICAL";
  }

  if (fatigueLevel === "HIGH") {
    return "HIGH";
  }

  if (fatigueLevel === "MODERATE") {
    return "MODERATE";
  }

  return "LOW";
}

function getUiRiskLevel(item) {
  if (item?.diver?.status === "EMERGENCY") {
    return "CRITICAL";
  }

  return item?.latestFatigue?.fatigueLevel || null;
}

function isHighRisk(item) {
  const level = getUiRiskLevel(item);

  return level === "HIGH" || level === "CRITICAL";
}

function getStoredFatigueScore(fatigue) {
  if (!fatigue || fatigue.fatigueScore === null || fatigue.fatigueScore === undefined) {
    return null;
  }

  const score = Number(fatigue.fatigueScore);

  if (!Number.isFinite(score)) {
    return null;
  }

  return score;
}

function buildAiPayload(item, emergencies = []) {
  const fatigue = item?.latestFatigue;
  const telemetry = item?.latestTelemetry;
  const diver = item?.diver;
  const risk_score = getStoredFatigueScore(fatigue);

  if (risk_score === null) {
    return null;
  }

  const risk_level = mapFatigueToAiLevel(
    diver?.status === "EMERGENCY" ? "CRITICAL" : fatigue.fatigueLevel
  );
  const warning =
    ["MODERATE", "HIGH", "CRITICAL"].includes(fatigue.fatigueLevel) ||
    diver?.status === "EMERGENCY" ||
    telemetry?.decompressionStatus === "WARNING" ||
    telemetry?.decompressionStatus === "CAUTION";

  const severity =
    fatigue.fatigueLevel === "CRITICAL" ||
    fatigue.fatigueLevel === "HIGH" ||
    diver?.status === "EMERGENCY"
      ? "HIGH"
      : fatigue.fatigueLevel === "MODERATE"
        ? "MEDIUM"
        : "LOW";

  const signals = Array.isArray(fatigue.factors)
    ? fatigue.factors.filter((factor) => typeof factor === "string")
    : [];

  if (
    telemetry?.decompressionStatus &&
    telemetry.decompressionStatus !== "NORMAL"
  ) {
    signals.push(`decompression_${telemetry.decompressionStatus}`);
  }

  if (diver?.status === "EMERGENCY") {
    signals.push("diver_status_EMERGENCY");
  }

  emergencies
    .filter((emergency) => {
      const emergencyDiverId = emergency.diverId?._id || emergency.diverId;
      return (
        String(emergencyDiverId) === String(diver?._id) &&
        emergency.status === "TRIGGERED" &&
        emergency.action
      );
    })
    .forEach((emergency) => {
      signals.push(`emergency_${emergency.action}`);
    });

  return {
    risk_score,
    risk_level,
    warning,
    severity,
    signals,
  };
}

function Decision() {
  const navigate = useNavigate();
  const token = getToken();

  const [missions, setMissions] = useState([]);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [mission, setMission] = useState(null);
  const [diversWithData, setDiversWithData] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [selectedDiverId, setSelectedDiverId] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [error, setError] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [isPersistingAction, setIsPersistingAction] = useState(false);

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

        const activeMission = nextMissions.find(
          (item) => item.status === "ACTIVE"
        );

        setSelectedMissionId(
          activeMission?._id || nextMissions[0]?._id || ""
        );
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
      setSelectedDiverId("");
      setIsLoadingDashboard(false);
      return;
    }

    let cancelled = false;

    const loadDashboard = async () => {
      setIsLoadingDashboard(true);
      setError("");

      try {
        const [dashboardData, emergencyData] = await Promise.all([
          apiRequest(`/api/dashboard/mission/${selectedMissionId}`),
          apiRequest(`/api/emergencies/mission/${selectedMissionId}`),
        ]);

        if (cancelled) {
          return;
        }

        const nextDivers = Array.isArray(dashboardData?.divers)
          ? dashboardData.divers
          : [];
        const nextEmergencies = Array.isArray(emergencyData?.emergencies)
          ? emergencyData.emergencies
          : [];

        setMission(dashboardData?.mission || null);
        setDiversWithData(nextDivers);
        setEmergencies(nextEmergencies);

        const preferred =
          nextDivers.find(isHighRisk) || nextDivers[0];

        setSelectedDiverId(preferred?.diver?._id || "");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load decision data");
          setMission(null);
          setDiversWithData([]);
          setEmergencies([]);
          setSelectedDiverId("");
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

    const refreshDecisionData = async () => {
      try {
        const [dashboardData, emergencyData] = await Promise.all([
          apiRequest(`/api/dashboard/mission/${selectedMissionId}`),
          apiRequest(`/api/emergencies/mission/${selectedMissionId}`),
        ]);

        setMission(dashboardData?.mission || null);
        setDiversWithData(
          Array.isArray(dashboardData?.divers) ? dashboardData.divers : []
        );
        setEmergencies(
          Array.isArray(emergencyData?.emergencies)
            ? emergencyData.emergencies
            : []
        );
      } catch (err) {
        setError(err.message || "Unable to refresh decision data");
      }
    };

    socket.on("connect", () => {
      socket.emit("joinMission", selectedMissionId);
    });

    socket.on("telemetry:update", refreshDecisionData);
    socket.on("risk:alert", refreshDecisionData);
    socket.on("battery:alert", refreshDecisionData);
    socket.on("emergency:alert", refreshDecisionData);
    socket.on("emergency:status-update", refreshDecisionData);
    socket.on("dive:event", refreshDecisionData);

    return () => {
      socket.disconnect();
    };
  }, [token, selectedMissionId]);

  const selectedItem = useMemo(
    () =>
      diversWithData.find(
        (item) => String(item?.diver?._id) === String(selectedDiverId)
      ) || null,
    [diversWithData, selectedDiverId]
  );

  useEffect(() => {
    if (!selectedItem?.diver?._id) {
      setAiResult(null);
      setAiError("");
      setAiLoading(false);
      return;
    }

    const payload = buildAiPayload(selectedItem, emergencies);

    if (!payload) {
      setAiResult(null);
      setAiError("");
      setAiLoading(false);
      return;
    }

    let cancelled = false;

    const loadAi = async () => {
      setAiLoading(true);
      setAiError("");
      setAiResult(null);

      try {
        const data = await apiRequest("/api/ai/decision-support", {
          method: "POST",
          body: payload,
        });

        if (!cancelled) {
          setAiResult(data);
        }
      } catch (err) {
        if (!cancelled) {
          setAiError(
            err.message || "Unable to generate AI decision support"
          );
          setAiResult(null);
        }
      } finally {
        if (!cancelled) {
          setAiLoading(false);
        }
      }
    };

    loadAi();

    return () => {
      cancelled = true;
    };
  }, [selectedItem, emergencies]);

  const stats = useMemo(() => {
    const pendingDecisions = emergencies.filter(
      (item) => item.status === "TRIGGERED"
    ).length;

    return {
      diversMonitored: diversWithData.length,
      highRisk: diversWithData.filter(isHighRisk).length,
      pendingDecisions,
      missionStatus: mission?.status || "N/A",
    };
  }, [diversWithData, emergencies, mission]);

  const handleEmergencyAction = async (action, label) => {
    if (!selectedItem?.diver?._id || !selectedMissionId) {
      return;
    }

    setIsPersistingAction(true);
    setActionError("");
    setActionStatus("");

    try {
      const data = await apiRequest("/api/emergencies", {
        method: "POST",
        body: {
          missionId: selectedMissionId,
          diverId: selectedItem.diver._id,
          action,
        },
      });

      const emergency = data?.emergency;

      if (emergency) {
        setEmergencies((prev) => [
          {
            ...emergency,
            diverId: {
              _id: selectedItem.diver._id,
              name: selectedItem.diver.name,
            },
          },
          ...prev,
        ]);
      }

      setActionStatus(
        data?.message ||
        `${label} recorded successfully for ${selectedItem.diver.name}.`
      );

      const [dashboardData, emergencyData] = await Promise.all([
        apiRequest(`/api/dashboard/mission/${selectedMissionId}`),
        apiRequest(`/api/emergencies/mission/${selectedMissionId}`),
      ]);
      setDiversWithData(
        Array.isArray(dashboardData?.divers) ? dashboardData.divers : []
      );
      setEmergencies(
        Array.isArray(emergencyData?.emergencies)
          ? emergencyData.emergencies
          : []
      );
    } catch (err) {
      setActionError(err.message || `Unable to record ${label.toLowerCase()}`);
    } finally {
      setIsPersistingAction(false);
    }
  };

  const handleEmergencyStatus = async (emergencyId, status) => {
    if (!emergencyId) {
      return;
    }

    setIsPersistingAction(true);
    setActionError("");
    setActionStatus("");

    try {
      const data = await apiRequest(
        `/api/emergencies/${emergencyId}/${status}`,
        { method: "PATCH" }
      );

      setActionStatus(
        data?.message ||
        `Emergency ${status === "acknowledge" ? "acknowledged" : "resolved"} successfully.`
      );

      const emergencyData = await apiRequest(
        `/api/emergencies/mission/${selectedMissionId}`
      );
      setEmergencies(
        Array.isArray(emergencyData?.emergencies)
          ? emergencyData.emergencies
          : []
      );
    } catch (err) {
      setActionError(err.message || "Unable to update emergency status");
    } finally {
      setIsPersistingAction(false);
    }
  };

  const riskStyle = (level) => {
    if (level === "HIGH" || level === "CRITICAL") {
      return {
        badge: "bg-red-100 text-red-700",
        border: "border-red-200",
        icon: "text-red-600",
      };
    }

    if (level === "MEDIUM" || level === "MODERATE") {
      return {
        badge: "bg-amber-100 text-amber-700",
        border: "border-amber-200",
        icon: "text-amber-600",
      };
    }

    if (level === "LOW" || level === "NORMAL") {
      return {
        badge: "bg-emerald-100 text-emerald-700",
        border: "border-emerald-200",
        icon: "text-emerald-600",
      };
    }

    return {
      badge: "bg-slate-100 text-slate-600",
      border: "border-slate-200",
      icon: "text-slate-500",
    };
  };

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const selectedDiver = selectedItem?.diver;
  const telemetry = selectedItem?.latestTelemetry;
  const fatigue = selectedItem?.latestFatigue;
  const displayLevel = getUiRiskLevel(selectedItem);
  const currentRisk = riskStyle(displayLevel);
  const aiPriority = aiResult?.priority || null;
  const recommendation = aiLoading
    ? "Generating recommendation..."
    : aiError
      ? "AI decision support unavailable"
      : formatRecommendation(aiResult?.recommendation);
  const explanation = aiLoading
    ? "Please wait while decision support is generated from current fatigue and telemetry data."
    : aiError
      ? aiError
      : aiResult?.explanation ||
        (!fatigue
          ? "No backend fatigue assessment is available for this diver, so AI decision support was not requested."
          : "N/A");
  const factors = Array.isArray(aiResult?.contributing_signals)
    ? aiResult.contributing_signals
    : Array.isArray(fatigue?.factors)
      ? fatigue.factors
      : [];
  const isLoading = isLoadingMissions || isLoadingDashboard;
  const hasMissions = missions.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar2 />

      <main className="px-6 py-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-600">
              <Brain size={18} />
              AI DECISION SUPPORT
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              Decision Center
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Review AI recommendations and take operational action for
              monitored divers.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={selectedMissionId}
              onChange={(e) => {
                setSelectedMissionId(e.target.value);
                setActionStatus("");
                setActionError("");
              }}
              disabled={!hasMissions || isLoadingMissions}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm outline-none hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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

            <button
              onClick={() => navigate("/risk")}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Brain size={17} />
              Open Risk Analysis
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Top Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Divers Monitored
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {isLoading ? "—" : stats.diversMonitored}
                </p>
              </div>

              <div className="rounded-xl bg-sky-50 p-3 text-sky-600">
                <UserRound size={22} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">High Risk</p>
                <p className="mt-2 text-2xl font-bold text-red-600">
                  {isLoading ? "—" : stats.highRisk}
                </p>
              </div>

              <div className="rounded-xl bg-red-50 p-3 text-red-600">
                <ShieldAlert size={22} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending Decisions</p>
                <p className="mt-2 text-2xl font-bold text-amber-600">
                  {isLoading ? "—" : stats.pendingDecisions}
                </p>
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
                <Clock3 size={22} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Mission Status
                </p>
                <p className="mt-2 text-lg font-bold text-emerald-600">
                  {isLoading ? "—" : stats.missionStatus}
                </p>
              </div>

              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
                <CheckCircle2 size={22} />
              </div>
            </div>
          </div>
        </div>

        {!hasMissions && !isLoadingMissions ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-bold">No missions found</h2>
            <p className="mt-2 text-sm text-slate-500">
              There are no missions linked to this account yet.
            </p>
          </div>
        ) : isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-medium text-slate-600">
              Loading decision data...
            </p>
          </div>
        ) : diversWithData.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-bold">No divers found</h2>
            <p className="mt-2 text-sm text-slate-500">
              This mission does not have any divers to review.
            </p>
          </div>
        ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          {/* Diver List */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Active Divers
              </p>

              <h2 className="mt-1 text-lg font-semibold">
                Select Diver
              </h2>
            </div>

            <div className="space-y-3">
              {diversWithData.map((item) => {
                const diver = item.diver || {};
                const itemFatigue = item.latestFatigue;
                const uiLevel = getUiRiskLevel(item);
                const style = riskStyle(uiLevel);
                const score = getStoredFatigueScore(itemFatigue);

                return (
                  <button
                    key={diver._id}
                    onClick={() => {
                      setSelectedDiverId(diver._id);
                      setActionStatus("");
                      setActionError("");
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      String(selectedDiverId) === String(diver._id)
                        ? "border-sky-300 bg-sky-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {diver.name || "Unnamed diver"}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {diver._id}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {diver.status || "N/A"}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.badge}`}
                      >
                        {uiLevel || "N/A"}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        Risk Score
                      </span>

                      <span className="text-sm font-bold">
                        {score === null ? "N/A" : `${score}/100`}
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          uiLevel === "HIGH" ||
                          uiLevel === "CRITICAL"
                            ? "bg-red-500"
                            : uiLevel === "MODERATE"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${score === null ? 0 : Math.min(score, 100)}%` }}
                      ></div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <button
                onClick={() =>
                  selectedDiver?._id &&
                  navigate(`/monitoring/${selectedDiver._id}`)
                }
                disabled={!selectedDiver?._id}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Open Monitoring
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          {/* Main Decision Area */}
          <section className="space-y-6">
            {/* Selected Diver Heading */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold">
                      {selectedDiver?.name || "Select a diver"}
                    </h2>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {selectedDiver?._id || "N/A"}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${currentRisk.badge}`}
                    >
                      {displayLevel ? `${displayLevel} RISK` : "NO RISK DATA"}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    {mission?.missionName || "N/A"} · Decision generated from
                    current telemetry
                  </p>
                </div>

                <div className="text-left lg:text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    AI Confidence
                  </p>

                  <p className="mt-1 text-2xl font-bold text-sky-600">
                    N/A
                  </p>
                </div>
              </div>
            </div>

            {/* AI Recommendation */}
            <div
              className={`rounded-2xl border ${currentRisk.border} bg-white p-6 shadow-sm`}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                      displayLevel === "HIGH" || displayLevel === "CRITICAL"
                        ? "bg-red-100 text-red-600"
                        : displayLevel === "MODERATE"
                        ? "bg-amber-100 text-amber-600"
                        : "bg-emerald-100 text-emerald-600"
                    }`}
                  >
                    <Brain size={25} />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      AI Recommended Decision
                    </p>

                    <h3 className="mt-1 text-2xl font-bold">
                      {recommendation}
                    </h3>

                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      {explanation}
                    </p>
                  </div>
                </div>

                <div
                  className={`shrink-0 rounded-xl px-4 py-3 text-center ${
                    aiPriority === "HIGH" || aiPriority === "CRITICAL"
                      ? "bg-red-50"
                      : aiPriority === "MEDIUM"
                      ? "bg-amber-50"
                      : "bg-emerald-50"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Priority
                  </p>

                  <p
                    className={`mt-1 text-lg font-bold ${
                      aiPriority === "HIGH" || aiPriority === "CRITICAL"
                        ? "text-red-600"
                        : aiPriority === "MEDIUM"
                        ? "text-amber-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {aiLoading ? "..." : aiPriority || "N/A"}
                  </p>
                </div>
              </div>

              {/* AI Factors */}
              <div className="mt-6 border-t border-slate-200 pt-5">
                <p className="mb-3 text-sm font-semibold text-slate-800">
                  Decision Factors
                </p>

                {aiLoading ? (
                  <p className="text-sm text-slate-500">
                    Loading contributing signals...
                  </p>
                ) : factors.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No contributing signals available.
                  </p>
                ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {factors.map((factor, index) => (
                    <div
                      key={`${factor}-${index}`}
                      className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3"
                    >
                      <CheckCircle2
                        size={16}
                        className={currentRisk.icon}
                      />

                      <span className="text-sm text-slate-600">
                        {factor}
                      </span>
                    </div>
                  ))}
                </div>
                )}
              </div>
            </div>

            {/* Telemetry */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Supporting Telemetry
                  </h3>

                  <p className="mt-1 text-xs text-slate-400">
                    Current data used for decision support
                  </p>
                </div>

                <Activity size={20} className="text-sky-500" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <HeartPulse size={17} />
                    <span className="text-xs">Heart Rate</span>
                  </div>

                  <p className="mt-2 text-xl font-bold">
                    {formatMetric(telemetry?.heartRate)}
                    {telemetry?.heartRate !== null &&
                    telemetry?.heartRate !== undefined ? (
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        BPM
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Wind size={17} />
                    <span className="text-xs">Oxygen</span>
                  </div>

                  <p className="mt-2 text-xl font-bold">
                    {formatMetric(telemetry?.oxygenSaturation, "%")}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Gauge size={17} />
                    <span className="text-xs">Depth</span>
                  </div>

                  <p className="mt-2 text-xl font-bold">
                    {formatMetric(telemetry?.depth)}
                    {telemetry?.depth !== null &&
                    telemetry?.depth !== undefined ? (
                      <span className="ml-1 text-xs font-normal text-slate-400">
                        m
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Battery size={17} />
                    <span className="text-xs">Battery</span>
                  </div>

                  <p className="mt-2 text-xl font-bold">
                    {formatMetric(telemetry?.batteryLevel, "%")}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <span className="text-sm text-slate-500">
                    Ascent Rate
                  </span>

                  <span className="font-semibold">
                    N/A
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <span className="text-sm text-slate-500">
                    Dive Time
                  </span>

                  <span className="font-semibold">
                    N/A
                  </span>
                </div>
              </div>
            </div>

            {/* Action Panel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h3 className="font-semibold text-slate-900">
                  Supervisor Action
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Review the AI recommendation and record the operational
                  response.
                </p>
              </div>

              {actionStatus && (
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  <CheckCircle2 size={18} />
                  {actionStatus}
                </div>
              )}

              {actionError && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {actionError}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  onClick={() =>
                    handleEmergencyAction("RECALL_DIVER", "Diver recall")
                  }
                  disabled={!selectedDiver?._id || isPersistingAction}
                  className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw size={17} />
                  Recall Diver
                </button>

                <button
                  onClick={() =>
                    handleEmergencyAction(
                      "REQUEST_BACKUP",
                      "Emergency support"
                    )
                  }
                  disabled={!selectedDiver?._id || isPersistingAction}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Siren size={17} />
                  Emergency Support
                </button>

                <button
                  onClick={() =>
                    handleEmergencyAction("EMERGENCY_SOS", "Emergency SOS")
                  }
                  disabled={!selectedDiver?._id || isPersistingAction}
                  className="flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <AlertTriangle size={17} />
                  Emergency SOS
                </button>
              </div>
            </div>

            {/* Decision History */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    Recent Decision History
                  </h3>

                  <p className="mt-1 text-xs text-slate-400">
                    Previous AI-assisted operational decisions
                  </p>
                </div>

                <FileText size={19} className="text-slate-400" />
              </div>

              {emergencies.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No decision history available.
                </p>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-3 font-semibold">Time</th>
                      <th className="pb-3 font-semibold">Diver</th>
                      <th className="pb-3 font-semibold">Decision</th>
                      <th className="pb-3 font-semibold">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {emergencies.map((item) => (
                      <tr
                        key={item._id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-4 text-sm text-slate-500">
                          {formatDateTime(item.triggeredAt)}
                        </td>

                        <td className="py-4">
                          <p className="text-sm font-semibold text-slate-800">
                            {item.diverId?.name || "Unknown diver"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {item.diverId?._id || item.diverId || "N/A"}
                          </p>
                        </td>

                        <td className="py-4 text-sm text-slate-600">
                          {formatRecommendation(item.action)}
                        </td>

                        <td className="py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                item.status === "RESOLVED"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : item.status === "ACKNOWLEDGED"
                                  ? "bg-sky-100 text-sky-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {item.status}
                            </span>
                            {item.status === "TRIGGERED" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleEmergencyStatus(
                                    item._id,
                                    "acknowledge"
                                  )
                                }
                                disabled={isPersistingAction}
                                className="rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                              >
                                Acknowledge
                              </button>
                            ) : null}
                            {item.status !== "RESOLVED" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleEmergencyStatus(item._id, "resolve")
                                }
                                disabled={isPersistingAction}
                                className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                              >
                                Resolve
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </section>
        </div>
        )}

        {/* Footer Note */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500 shadow-sm">
          <strong className="text-slate-700">
            Decision Support Notice:
          </strong>{" "}
          AI recommendations shown here are intended to support the dive
          supervisor's operational review. Final actions remain under
          supervisor control.
        </div>
      </main>
    </div>
  );
}

export default Decision;
