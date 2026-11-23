import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";

function AIDecisionSupport() {
  const [showChat, setShowChat] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState("");
  const [mission, setMission] = useState(null);
  const [riskScore, setRiskScore] = useState(null);
  const [riskLevel, setRiskLevel] = useState("N/A");

  // Connect to the Node backend -> FastAPI AI service
  const getDecisionSupport = async () => {
  try {
    setAiLoading(true);
    setAiError("");

    const missionsData = await apiRequest("/api/missions");
    const missions = Array.isArray(missionsData?.missions)
      ? missionsData.missions
      : [];
    const selectedMission =
      missions.find((item) => item.status === "ACTIVE") || missions[0];

    if (!selectedMission?._id) {
      setMission(null);
      setRiskScore(null);
      setRiskLevel("N/A");
      setAiResult(null);
      setAiLoading(false);
      return;
    }

    setMission(selectedMission);
    const dashboardData = await apiRequest(
      `/api/dashboard/mission/${selectedMission._id}`
    );
    const divers = Array.isArray(dashboardData?.divers)
      ? dashboardData.divers
      : [];
    const selectedDiver =
      divers.find((item) => {
        const level = item?.latestFatigue?.fatigueLevel;
        return level === "HIGH" || level === "CRITICAL";
      }) || divers.find((item) => item?.latestFatigue?.fatigueScore !== null);

    const fatigue = selectedDiver?.latestFatigue;
    const telemetry = selectedDiver?.latestTelemetry;
    const score =
      fatigue?.fatigueScore === null || fatigue?.fatigueScore === undefined
        ? null
        : Number(fatigue.fatigueScore);

    if (!selectedDiver || !Number.isFinite(score)) {
      setRiskScore(null);
      setRiskLevel("N/A");
      setAiResult(null);
      setAiLoading(false);
      return;
    }

    const fatigueLevel = fatigue.fatigueLevel || "LOW";
    const level =
      selectedDiver.diver?.status === "EMERGENCY"
        ? "CRITICAL"
        : fatigueLevel;
    const severity =
      level === "CRITICAL" || level === "HIGH"
        ? "HIGH"
        : level === "MODERATE"
          ? "MEDIUM"
          : "LOW";
    const signals = Array.isArray(fatigue.factors)
      ? [...fatigue.factors]
      : [];
    if (
      telemetry?.decompressionStatus &&
      telemetry.decompressionStatus !== "NORMAL"
    ) {
      signals.push(`decompression_${telemetry.decompressionStatus}`);
    }

    setRiskScore(score);
    setRiskLevel(level);
    const data = await apiRequest("/api/ai/decision-support", {
      method: "POST",
      body: {
        risk_score: score,
        risk_level: level,
        warning: ["MODERATE", "HIGH", "CRITICAL"].includes(level),
        severity,
        signals,
      },
    });
    setAiResult(data);
  } catch (error) {
    console.error("AI DECISION SUPPORT FAILED:", error);

    setAiError(error.message);
  } finally {
    setAiLoading(false);
  }
};

  useEffect(() => {
    getDecisionSupport();
  }, []);

  const sendMessage = () => {
    if (!message.trim()) return;

    const userMessage = message.trim();

    setMessages((prev) => [
      ...prev,
      {
        type: "user",
        text: userMessage,
      },
      {
        type: "ai",
        text: "The live assistant chat endpoint is not available. Use the mission recommendation above for real backend-supported decision support.",
      },
    ]);

    setMessage("");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              AI Decision Support
            </h1>

            <p className="text-slate-300 mt-1">
              Intelligent mission analysis and supervisor decision support
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-emerald-400"></span>

            <span
              className={`text-sm font-semibold ${
                aiResult?.priority === "CRITICAL"
                  ? "text-red-400"
                  : aiResult?.priority === "HIGH"
                  ? "text-orange-400"
                  : aiResult?.priority === "MEDIUM"
                  ? "text-yellow-400"
                  : "text-emerald-400"
              }`}
            >
              {aiLoading
                ? "Analyzing mission conditions..."
                : aiResult
                ? `AI Priority: ${aiResult.priority}`
                : "AI analysis unavailable"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Mission Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 font-semibold">
              Mission Status
            </p>

            <p className="text-2xl font-bold text-emerald-600 mt-2">
              {mission?.status || "N/A"}
            </p>

            <p className="text-sm text-slate-500 mt-2">
              {mission?.missionName || "No mission data available"}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 font-semibold">
              Current Risk Score
            </p>

            <p className="text-2xl font-bold text-orange-600 mt-2">
              {riskScore === null ? "N/A" : riskScore}
            </p>

            <p className="text-sm text-slate-500 mt-2">
              {riskLevel === "N/A"
                ? "No fatigue assessment available"
                : `${riskLevel} risk level`}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 font-semibold">
              AI Status
            </p>

            <p className="text-2xl font-bold text-sky-600 mt-2">
              ONLINE
            </p>

            <p className="text-sm text-slate-500 mt-2">
              Decision support service connected
            </p>
          </div>
        </div>

        {/* AI Recommendation */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                AI Mission Recommendation
              </h2>

              <p className="text-slate-500 mt-1">
                Real-time recommendation generated by the DiveQ AI engine
              </p>
            </div>

            <div className="px-4 py-2 rounded-full bg-sky-100 text-sky-700 font-semibold">
              AI Analysis
            </div>
          </div>

          {aiLoading ? (
            <div className="py-10 text-center">
              <div className="animate-pulse">
                <p className="text-slate-500 text-lg">
                  Analyzing current dive conditions...
                </p>
              </div>
            </div>
          ) : aiError ? (
            <div className="rounded-xl bg-red-50 border border-red-200 p-6">
              <p className="text-red-600 text-lg font-semibold">
                AI Service Error
              </p>

              <p className="text-red-500 mt-2">
                {aiError}
              </p>
            </div>
          ) : (
            <div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-6">
                <p className="text-slate-700 text-lg leading-relaxed">
                  {aiResult?.explanation}
                </p>
              </div>

              {/* Recommendation */}
              <div className="mt-6">
                <p className="text-sm text-slate-500 font-semibold">
                  Recommendation
                </p>

                <p className="text-xl font-bold text-sky-700 mt-1">
                  {aiResult?.recommendation}
                </p>
              </div>

              {/* Priority */}
              <div className="mt-5">
                <p className="text-sm text-slate-500 font-semibold">
                  Priority
                </p>

                <p
                  className={`text-lg font-bold mt-1 ${
                    aiResult?.priority === "CRITICAL"
                      ? "text-red-600"
                      : aiResult?.priority === "HIGH"
                      ? "text-orange-600"
                      : aiResult?.priority === "MEDIUM"
                      ? "text-yellow-600"
                      : "text-emerald-600"
                  }`}
                >
                  {aiResult?.priority}
                </p>
              </div>

              {/* Contributing Signals */}
              <div className="mt-5">
                <p className="text-sm text-slate-500 font-semibold">
                  Contributing Signals
                </p>

                <div className="flex flex-wrap gap-2 mt-2">
                  {aiResult?.contributing_signals?.map((signal) => (
                    <span
                      key={signal}
                      className="px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-sm font-medium"
                    >
                      {signal.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Decision Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Risk Indicators */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-bold text-slate-900">
              Detected Risk Indicators
            </h2>

            <p className="text-slate-500 mt-1 mb-6">
              Signals currently contributing to the AI assessment
            </p>

            <div className="space-y-4">
              {aiResult?.contributing_signals?.map((signal) => (
                <div
                  key={signal}
                  className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-4"
                >
                  <span className="font-medium text-slate-700 capitalize">
                    {signal.replaceAll("_", " ")}
                  </span>

                  <span className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-sm font-semibold">
                    Detected
                  </span>
                </div>
              ))}

              {!aiResult?.contributing_signals?.length && (
                <p className="text-slate-500">
                  No contributing signals detected.
                </p>
              )}
            </div>
          </div>

          {/* Supervisor Action */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-bold text-slate-900">
              Supervisor Action
            </h2>

            <p className="text-slate-500 mt-1 mb-6">
              AI-generated guidance for mission supervision
            </p>

            <div
              className={`rounded-xl p-6 ${
                aiResult?.priority === "CRITICAL"
                  ? "bg-red-50 border border-red-200"
                  : "bg-sky-50 border border-sky-200"
              }`}
            >
              <p
                className={`text-lg font-bold ${
                  aiResult?.priority === "CRITICAL"
                    ? "text-red-700"
                    : "text-sky-700"
                }`}
              >
                {aiResult?.recommendation || "Awaiting AI analysis"}
              </p>

              <p className="text-slate-600 mt-3 leading-relaxed">
                {aiResult?.explanation ||
                  "The AI system is analyzing the current mission conditions."}
              </p>
            </div>

            <p className="text-xs text-slate-400 mt-5">
              AI recommendations are decision-support information for the
              dive supervisor and should be reviewed alongside mission
              procedures and live diver conditions.
            </p>
          </div>
        </div>
      </main>

      {/* AI Assistant Button */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-6 right-6 bg-sky-600 hover:bg-sky-700 text-white rounded-full px-6 py-4 shadow-lg font-semibold transition"
      >
        {showChat ? "Close AI Assistant" : "AI Assistant"}
      </button>

      {/* AI Chat */}
      {showChat && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 text-white px-5 py-4">
            <h3 className="font-bold">
              DiveQ AI Assistant
            </h3>

            <p className="text-xs text-slate-300 mt-1">
              Mission decision support
            </p>
          </div>

          <div className="h-80 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-sm text-slate-500">
                Ask the AI assistant about the current dive conditions.
              </div>
            ) : (
              messages.map((item, index) => (
                <div
                  key={index}
                  className={`rounded-xl p-3 text-sm ${
                    item.type === "user"
                      ? "bg-sky-100 text-sky-900 ml-8"
                      : "bg-slate-100 text-slate-700 mr-8"
                  }`}
                >
                  {item.text}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-200 p-3 flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
              placeholder="Ask the AI assistant..."
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />

            <button
              onClick={sendMessage}
              className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIDecisionSupport;