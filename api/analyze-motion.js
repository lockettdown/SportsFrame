const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const fallbackResult = {
  sport: "Baseball / softball mechanics",
  issue: "AI swing and pitching analysis is not connected yet",
  confidence: "low",
  evidence: [
    "The analysis service is not configured yet."
  ],
  corrections: [
    "Add OPENAI_API_KEY to the server environment and try again.",
    "Use the saved frames to compare setup, load, stride, rotation, contact or release, and finish."
  ],
  drills: [
    "For hitting: pause at launch position, contact, and finish to check balance and barrel path.",
    "For pitching: pause at leg lift, stride foot strike, release, and follow-through to check timing and direction."
  ],
  disclaimer: "AI feedback is coaching guidance only and is not a medical diagnosis."
};

function json(response, status, body) {
  response.status(status).json(body);
}

function coerceResult(text) {
  try {
    const jsonText = extractJson(text);
    const parsed = JSON.parse(jsonText);
    return {
      sport: String(parsed.sport || "Unknown movement"),
      issue: String(parsed.issue || "No clear issue identified"),
      confidence: String(parsed.confidence || "medium"),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 5).map(String) : [],
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections.slice(0, 5).map(String) : [],
      drills: Array.isArray(parsed.drills) ? parsed.drills.slice(0, 5).map(String) : [],
      disclaimer: String(parsed.disclaimer || fallbackResult.disclaimer)
    };
  } catch {
    return {
      ...fallbackResult,
      issue: "The model returned an unreadable analysis.",
      evidence: [text.slice(0, 400) || "No analysis text was returned."]
    };
  }
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    json(response, 200, { result: fallbackResult, demo: true });
    return;
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const { frames = [], athlete = "Athlete", notes = "" } = body;
    const cleanFrames = frames
      .filter((frame) => typeof frame?.image === "string" && frame.image.startsWith("data:image/"))
      .slice(0, 30);

    if (cleanFrames.length < 1) {
      json(response, 400, { error: "At least one frame image is required" });
      return;
    }

    const content = [
      {
        type: "input_text",
        text: [
          "You are a careful baseball and softball technique coach analyzing saved frames from a training session.",
          "Use all provided frames together as one sequence. First decide whether the athlete appears to be hitting, pitching, or doing another baseball/softball movement.",
          "If the athlete is hitting, summarize how they can become a better hitter. Focus on stance, load, stride, hip/shoulder separation, head stability, barrel path, contact position, extension, balance, and finish.",
          "If the athlete is pitching, summarize how to improve pitching mechanics. Focus on leg lift, posture, stride direction, hip/shoulder separation, arm timing, release position, glove-side control, deceleration, and follow-through.",
          "If both hitting and pitching frames are present, provide separate hitter and pitcher corrections.",
          "Identify the most likely primary technique issue and practical coaching corrections. Avoid medical diagnosis. Do not claim certainty beyond the frames.",
          `Athlete label: ${athlete}`,
          notes ? `Coach notes: ${notes}` : "Coach notes: none",
          "Return only valid JSON with keys: sport, issue, confidence, evidence, corrections, drills, disclaimer. evidence/corrections/drills must be arrays of short, specific baseball/softball coaching strings."
        ].join("\n")
      },
      ...cleanFrames.flatMap((frame, index) => [
        {
          type: "input_text",
          text: `Frame ${index + 1}${frame.timeLabel ? ` at ${frame.timeLabel}` : ""}`
        },
        {
          type: "input_image",
          image_url: frame.image,
          detail: "low"
        }
      ])
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          {
            role: "user",
            content
          }
        ],
        max_output_tokens: 1200
      })
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) {
      json(response, openaiResponse.status, { error: data.error?.message || "OpenAI request failed" });
      return;
    }

    const text = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n") || "";
    json(response, 200, { result: coerceResult(text), model: DEFAULT_MODEL });
  } catch (error) {
    json(response, 500, { error: error.message });
  }
}
