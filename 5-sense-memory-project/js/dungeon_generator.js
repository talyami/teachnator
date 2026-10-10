/* ============================================================================
   AI DUNGEON GENERATOR
   OmniRoute /v1/chat/completions
   The lesson is sent the way the study app sends it:
   pasted text and Word text as text, PDFs and photos as the original file.
============================================================================ */

class AiDungeonGenerator {
  constructor() {
    this.apiUrl = localStorage.getItem("omniroute_api_url") || "https://srv875806.tail759794.ts.net:10000/v1";
    this.apiKey = localStorage.getItem("omniroute_api_key") || "sk-ccd78d6a7b57c9a2-fca2af-835113fc";
    this.model = localStorage.getItem("omniroute_model") || "combo-gemini-flash";
  }

  setConfig(url, key, model) {
    if (url) {
      this.apiUrl = url.replace(/\/+$/, "");
      localStorage.setItem("omniroute_api_url", this.apiUrl);
    }
    if (key) {
      this.apiKey = key;
      localStorage.setItem("omniroute_api_key", this.apiKey);
    }
    if (model) {
      this.model = model;
      localStorage.setItem("omniroute_model", this.model);
    }
  }

  normalize(material) {
    if (typeof material === "string") {
      const text = material.trim();
      return { type: "multi", items: text ? [{ type: "text", name: "Pasted lesson", data: text }] : [] };
    }
    if (material && Array.isArray(material.items)) return material;
    return { type: "multi", items: [] };
  }

  async generate(material, options = {}) {
    const payload = this.normalize(material);
    if (!payload.items.length) {
      throw new Error("Add a lesson file or paste the lesson.");
    }
    console.log(`[OmniRoute] Forging from ${payload.items.length} attachment(s) with ${this.model}`);
    return this.callOmniRouteApi(payload, options);
  }

  buildUserContent(payload, options) {
    const genre = options.genre || "sci-fi";
    const difficulty = options.difficulty || "apprentice";
    const instruction = `You are the game master of a study game.
Read EVERY attached lesson below. PDFs and photos are the actual pages. Read scanned pages and handwriting as carefully as digital text.
Build one playable quest whose facts, names, dates, and answers come only from those attachments.
Write the quest in the same language as the lesson. Arabic lessons stay in Arabic. English lessons stay in English.
Flavor only: genre "${genre}", difficulty "${difficulty}". Do not replace the lesson with a generic science topic.
If you cannot read the attachments, respond with {"error":"Could not read the lesson file."} and nothing else.

Respond with JSON only, no markdown:
{
  "title": "Short quest title, max 6 words",
  "sector": "Place name taken from the lesson world",
  "themeColor": "emerald" | "cyan" | "rose" | "purple" | "amber",
  "icon": "one emoji",
  "story": "2-3 sentences that use the real lesson stakes",
  "puzzleMechanic": {
    "name": "Challenge name",
    "instruction": "What the student does",
    "items": [
      { "id": 1, "label": "Real concept from the lesson", "desc": "What the lesson says it does" },
      { "id": 2, "label": "Real concept from the lesson", "desc": "What the lesson says it does" },
      { "id": 3, "label": "Real concept from the lesson", "desc": "What the lesson says it does" }
    ]
  },
  "boss": {
    "name": "Boss name",
    "icon": "one emoji",
    "intro": "One sentence tied to a real idea in the lesson",
    "questions": [
      {
        "prompt": "Question a student can answer only from this lesson",
        "options": [
          { "text": "Correct fact from the lesson", "correct": true },
          { "text": "Wrong but plausible", "correct": false },
          { "text": "Wrong but plausible", "correct": false },
          { "text": "Wrong but plausible", "correct": false }
        ]
      },
      {
        "prompt": "Second question from a different part of the lesson",
        "options": [
          { "text": "Correct fact from the lesson", "correct": true },
          { "text": "Wrong", "correct": false },
          { "text": "Wrong", "correct": false },
          { "text": "Wrong", "correct": false }
        ]
      },
      {
        "prompt": "Third question from the lesson",
        "options": [
          { "text": "Correct fact from the lesson", "correct": true },
          { "text": "Wrong", "correct": false },
          { "text": "Wrong", "correct": false },
          { "text": "Wrong", "correct": false }
        ]
      }
    ]
  }
}`;

    const content = [{ type: "text", text: instruction }];
    payload.items.forEach((item, index) => {
      const label = item.name || `Attachment ${index + 1}`;
      if (item.type === "text") {
        content.push({
          type: "text",
          text: `\n--- Attachment ${index + 1}: ${label} ---\n${item.data}`
        });
        return;
      }

      const mime = item.mimeType || "application/octet-stream";
      content.push({
        type: "text",
        text: `\n--- Attachment ${index + 1}: ${label} ---`
      });
      if (mime.startsWith("image/")) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${mime};base64,${item.data}` }
        });
      } else {
        content.push({
          type: "file",
          file: {
            filename: label,
            file_data: `data:${mime};base64,${item.data}`
          }
        });
      }
    });
    return content;
  }

  async callOmniRouteApi(payload, options) {
    const endpoint = `${this.apiUrl.replace(/\/+$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: "You read the student's real lesson and answer with JSON only." },
          { role: "user", content: this.buildUserContent(payload, options) }
        ],
        temperature: 0.4
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(this.readableApiError(response.status, errText));
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw || !String(raw).trim()) {
      throw new Error("The model returned an empty lesson.");
    }

    const jsonMatch = String(raw).trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("The model did not return a quest.");

    let quest;
    try {
      quest = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error("The model returned a quest that could not be read.");
    }

    if (quest.error) throw new Error(String(quest.error));
    if (!quest.title || !quest.boss || !Array.isArray(quest.boss.questions) || !quest.boss.questions.length) {
      throw new Error("The quest was missing the lesson questions.");
    }
    return quest;
  }

  readableApiError(status, body) {
    let detail = "";
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error?.message || parsed.message || "";
    } catch (err) {
      detail = String(body || "").slice(0, 180);
    }
    if (status === 413) return "That lesson file is too large for one request. Split it into smaller parts.";
    return detail ? `OmniRoute ${status}: ${detail}` : `OmniRoute ${status}`;
  }
}

window.aiDungeonGenerator = new AiDungeonGenerator();
window.DungeonGenerator = window.aiDungeonGenerator;
