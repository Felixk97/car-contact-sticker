// netlify/functions/send-alert.js
//
// The visitor's browser calls THIS function (relative path, no secret exposed).
// This function runs on Netlify's servers, reads the real ntfy topic from an
// environment variable, and forwards the alert to ntfy.sh from the server side.
// The topic never appears in any HTML/JS the visitor can view-source.

// Very lightweight best-effort rate limiting: keeps a small in-memory map of
// "last sent time" per visitor IP. This resets whenever Netlify spins up a
// fresh function instance (cold start), so it's not bulletproof — but it
// stops casual repeat-click spam, which is the realistic threat here.
const lastSentByIp = new Map();
const COOLDOWN_MS = 30 * 1000; // 30 seconds between alerts per IP

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.error("NTFY_TOPIC environment variable is not set");
    return { statusCode: 500, body: "Server not configured" };
  }

  // Basic rate limiting by caller IP
  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    "unknown";
  const now = Date.now();
  const last = lastSentByIp.get(ip);
  if (last && now - last < COOLDOWN_MS) {
    return { statusCode: 429, body: "Please wait before sending another alert." };
  }
  lastSentByIp.set(ip, now);

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid request body" };
  }

  const { title, message, priority, tags } = payload;
  if (!message || typeof message !== "string") {
    return { statusCode: 400, body: "Missing message" };
  }

  try {
    const resp = await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: {
        Title: title || "Vehicle Contact Alert",
        Priority: priority || "high",
        Tags: tags || "car",
      },
      body: message.slice(0, 500), // basic length cap
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("ntfy.sh rejected the request:", text);
      return { statusCode: 502, body: "Could not deliver the alert." };
    }

    return { statusCode: 200, body: "Alert sent." };
  } catch (err) {
    console.error("Error forwarding to ntfy.sh:", err);
    return { statusCode: 500, body: "Unexpected error sending the alert." };
  }
};
