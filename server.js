import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); // key stays on the server
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" })); // set ALLOWED_ORIGIN in production
app.use(express.json({ limit: "6mb" }));
app.use(rateLimit({ windowMs: 60_000, max: 20 })); // 20 requests per minute per IP
app.use(express.static("public")); // optional: put index.html in ./public

const SYSTEM =
  "You are SeeForMe, a visual assistant for blind and low-vision people. " +
  "Your answer will be read aloud, so use short, plain sentences. " +
  "No markdown, no lists, no emojis. Describe positions as left, right, ahead, or behind the user. " +
  "Use distances in steps or meters when you can estimate them. " +
  "If the image is too dark, blurry, or blocked, say so and tell the user how to retake it. " +
  "Never guess about things you cannot see clearly.";

const PROMPTS = {
  scene:
    "Describe this scene in 3 to 4 sentences. Start with the setting, then the most important objects and people, " +
    "then anything that matters for safety.",
  text:
    "Read all visible text exactly as written, in natural reading order. " +
    "If there is no readable text, say 'I can't see any readable text.' Do not add commentary.",
  obstacle:
    "The user is walking. Say first whether the path ahead looks clear or not. " +
    "Then list any obstacles, stairs, curbs, vehicles, or people with direction and rough distance. " +
    "Keep it under 3 sentences. If unsure, advise caution.",
  money:
    "Identify any banknotes or coins: currency, denomination, and how many. " +
    "If you are not fully sure, say so and suggest holding the note flat in good light. " +
    "Remind the user to double check before paying.",
};

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/describe", async (req, res) => {
  const { image, mode = "scene" } = req.body || {};

  if (!PROMPTS[mode]) return res.status(400).json({ error: "Unknown mode." });
  if (typeof image !== "string" || image.length < 100)
    return res.status(400).json({ error: "Missing image." });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: PROMPTS[mode] },
          ],
        },
      ],
    });

    const description = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    res.json({ description });
  } catch (err) {
    console.error("Vision request failed:", err.status, err.message);
    res.status(502).json({ error: "The vision service is unavailable. Try again." });
  }
});

app.listen(PORT, () => console.log(`SeeForMe backend running on port ${PORT}`));
