// Supabase Edge Function: keyword-analyze
// Calls Anthropic (Claude) securely server-side. Set CLAUDE_API_KEY in Supabase secrets.

type AnalyzeRequest = {
  resumeText: string;
  jobDescription: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "authorization, x-client-info, apikey, content-type",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const apiKey = Deno.env.get("CLAUDE_API_KEY");
  if (!apiKey) return jsonResponse({ error: "Missing CLAUDE_API_KEY" }, 500);

  let payload: AnalyzeRequest;
  try {
    payload = (await req.json()) as AnalyzeRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const resumeText = (payload.resumeText ?? "").trim();
  const jobDescription = (payload.jobDescription ?? "").trim();
  if (!resumeText || !jobDescription) {
    return jsonResponse(
      { error: "resumeText and jobDescription are required" },
      400,
    );
  }

  const system =
    "You are an expert finance recruiting resume reviewer. Return only valid JSON.";

  const user = `Compare the resume to the job description.\n\nReturn JSON with exactly:\n{\n  \"missing_keywords\": string[] ,\n  \"suggested_improvements\": string[]\n}\n\nRules:\n- missing_keywords: specific terms/skills from the job description not present in the resume\n- suggested_improvements: concise bullets (max 8) with actionable edits\n- Do not include markdown, only JSON.\n\nRESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 900,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!anthropicRes.ok) {
    const text = await anthropicRes.text();
    return jsonResponse(
      { error: "Claude API error", status: anthropicRes.status, details: text },
      502,
    );
  }

  const data = await anthropicRes.json();
  const contentText =
    (data?.content ?? [])
      .map((c: { type: string; text?: string }) => (c.type === "text" ? c.text : ""))
      .join("") ?? "";

  try {
    const parsed = JSON.parse(contentText);
    const missing = Array.isArray(parsed?.missing_keywords)
      ? parsed.missing_keywords.filter((x: unknown) => typeof x === "string")
      : [];
    const suggestions = Array.isArray(parsed?.suggested_improvements)
      ? parsed.suggested_improvements.filter((x: unknown) => typeof x === "string")
      : [];

    return jsonResponse({
      missing_keywords: missing,
      suggested_improvements: suggestions,
    });
  } catch {
    return jsonResponse(
      {
        error: "Claude response was not valid JSON",
        raw: contentText.slice(0, 4000),
      },
      502,
    );
  }
});

