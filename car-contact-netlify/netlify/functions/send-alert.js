// netlify/functions/send-alert.js
//
// The visitor's browser calls THIS function (relative path, no secret exposed).
// This function looks up which owner a given plate belongs to, then forwards
// the alert to that owner's private ntfy topic — the topic never appears in
// any HTML/JS the visitor can view-source.
//
// PLATE -> OWNER TOPIC MAPPING
// Set an environment variable called PLATE_TOPIC_MAP containing JSON like:
//   {"PNW2990":"your-secret-topic-abc","PKJ999":"your-secret-topic-abc"}
// Keys are plate numbers with NO spaces, uppercase (the code normalizes
// incoming plates the same way before looking them up).
// All your own cars can point to the SAME topic (your phone). If you ever
// add a car for a different owner, just point that plate at their topic
// instead — no code changes needed, just update this one variable.
//
// A single NTFY_TOPIC variable is still supported as a fallback for any
// plate not found in the map, so this stays backward compatible.

const lastSentByIp = new Map();
const COOLDOWN_MS = 30 * 1000; // 30 seconds between alerts per IP

function normalizePlate(p) {
  return (p || "").toUpperCase().replace(/\s+/g, "");
}

function resolveTopic(plate) {
  const normalized = normalizePlate(plate);
  let map = {};
  try {
    map = JSON.parse(process.env.PLATE_TOPIC_MAP || "{}");
  } catch (e) {
    console.error("PLATE_TOPIC_MAP is not valid JSON:", e.message);
  }
  if (normalized && map[normalized]) {
    return { topic: map[normalized], matchedPlate: normalized };
  }
  // Fallback to a single default topic if the plate isn't in the map
  if (process.env.NTFY_TOPIC) {
    return { topic: process.env.NTFY_TOPIC, matchedPlate: normalized || null };
  }
  return { topic: null, matchedPlate: null };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
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

  const { title, message, priority, tags, replyTopic, plate } = payload;
  if (!message || typeof message !== "string") {
    return { statusCode: 400, body: "Missing message" };
  }
  if (!plate || typeof plate !== "string") {
    return { statusCode: 400, body: "Missing plate" };
  }

  const { topic, matchedPlate } = resolveTopic(plate);
  if (!topic) {
    return { statusCode: 404, body: "That plate isn't registered." };
  }

  // HTTP headers can only contain Latin-1 characters — emoji break fetch()
  // with "Cannot convert argument to a ByteString" if left in a header.
  const safeTitle = (title || "Vehicle Contact Alert").replace(/[^\x00-\xFF]/g, "").trim() || "Vehicle Contact Alert";

  const baseUrl = process.env.URL || process.env.PUBLIC_BASE_URL || "";
  let fullMessage = message.slice(0, 500);
  if (replyTopic && typeof replyTopic === "string" && baseUrl) {
    const safeTopic = replyTopic.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safeTopic) {
      fullMessage += `\n\nReply: ${baseUrl}/reply.html?topic=${safeTopic}`;
    }
  }

  try {
    const resp = await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: {
        Title: safeTitle,
        Priority: priority || "high",
        Tags: tags || "car",
      },
      body: fullMessage,
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
