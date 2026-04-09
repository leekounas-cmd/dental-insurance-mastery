export async function POST(request) {
  try {
    const { type, chapter, searchQuery, masteryRound, prevQuestions } = await request.json();

    let prompt = "";
    let maxTokens = 1000;

    if (type === "lesson") {
      maxTokens = 400;
      prompt = `You are a straight-talking dental insurance expert giving your personal take on a topic to a dental office manager. This is Chapter ${chapter.num}: "${chapter.title}". Topics: ${chapter.topics.join(", ")}.

Give your honest 2026 take on this topic in about 150-200 words. What actually matters here, what most offices get wrong, and the one thing they should do differently. Be direct and opinionated — not a textbook summary. Use **bold** for the most important point. No intro fluff, just your take.`;
    } else if (type === "quiz") {
      maxTokens = 2000;
      prompt = `You are a dental insurance training quiz generator. Generate 5 NEW multiple-choice questions for Chapter ${chapter.num}: "${chapter.title}".

Topics: ${chapter.topics.join(", ")}

This is mastery round ${masteryRound}. The student has already answered basic questions. Generate HARDER, more specific, more practical questions that test real-world application — not just definitions.

Previous questions already asked (DO NOT repeat these): ${prevQuestions || "none"}

Rules:
- Each question must have exactly 4 answer options
- Exactly 1 correct answer per question
- Include specific CDT codes, dollar amounts, and realistic scenarios where relevant
- Test application of knowledge, not just recall
- Make wrong answers plausible (common misconceptions)
- Round ${masteryRound > 2 ? "3+" : masteryRound}: Make questions progressively harder — include edge cases, calculations, and "what would you do" scenarios

Respond ONLY with a JSON array, no markdown, no backticks, no explanation. Format:
[{"q":"question text","opts":["option A","option B","option C","option D"],"a":0}]
Where "a" is the zero-based index of the correct answer.`;
    } else if (type === "search") {
      prompt = `You are a dental insurance expert. Answer this question from a dental office manager/insurance coordinator: ${searchQuery}

Be specific and actionable. Use CDT codes when relevant. Keep the answer concise but thorough. Use **bold** for emphasis.`;
    } else {
      return Response.json({ error: "Invalid type" }, { status: 400 });
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();
    const text = data.content?.map(i => i.text || "").join("\n") || "";

    return Response.json({ text });
  } catch (e) {
    console.error("AI API error:", e);
    return Response.json({ error: "Failed to generate content" }, { status: 500 });
  }
}
