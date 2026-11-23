const express = require("express");

const router = express.Router();

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

router.post("/decision-support", async (req, res) => {
  try {
    const {
      risk_score,
      risk_level,
      warning,
      severity,
      signals,
    } = req.body;

    // Validate request
    if (
      typeof risk_score !== "number" ||
      typeof risk_level !== "string" ||
      typeof warning !== "boolean" ||
      typeof severity !== "string" ||
      !Array.isArray(signals)
    ) {
      return res.status(400).json({
        error: "Invalid decision-support request",
      });
    }

    // Send request to FastAPI AI service
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

    // Forward AI service error
    if (!response.ok) {
      return res.status(response.status).json({
        error: "AI service returned an error",
        details: data,
      });
    }

    // Return AI result to frontend
    res.json(data);
  } catch (error) {
    console.error(
      "AI decision-support error:",
      error.message
    );

    res.status(500).json({
      error: "Unable to connect to AI service",
      details: error.message,
    });
  }
});

module.exports = router;