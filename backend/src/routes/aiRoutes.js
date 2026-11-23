const express = require("express");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

router.post("/decision-support", protect, async (req, res) => {
  try {
    const {
      risk_score,
      risk_level,
      warning,
      severity,
      signals,
    } = req.body;

    // Basic validation
    if (
      typeof risk_score !== "number" ||
      typeof risk_level !== "string" ||
      typeof warning !== "boolean" ||
      typeof severity !== "string" ||
      !Array.isArray(signals)
    ) {
      return res.status(400).json({
        error: "Invalid decision-support request",
        required: {
          risk_score: "number",
          risk_level: "string",
          warning: "boolean",
          severity: "string",
          signals: "array",
        },
      });
    }

    const response = await fetch(
      `${AI_SERVICE_URL}/decision-support`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          risk_score,
          risk_level,
          warning,
          severity,
          signals,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "AI service returned an error",
        details: data,
      });
    }

    res.json(data);
  } catch (error) {
    console.error("AI decision-support error:", error.message);

    res.status(500).json({
      error: "Unable to connect to AI service",
      details: error.message,
    });
  }
});

module.exports = router;