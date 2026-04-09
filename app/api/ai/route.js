export async function POST(request) {
  try {
    const { type, chapter, searchQuery, masteryRound, prevQuestions } = await request.json();

    let prompt = "";
    let maxTokens = 1000;

    if (type === "lesson") {
      maxTokens = 4000;
      prompt = `You are writing a comprehensive dental insurance training lesson for a dental office manager / insurance coordinator. This is Chapter ${chapter.num}: "${chapter.title}".

Topics to cover in depth: ${chapter.topics.join(", ")}

Write a thorough, detailed lesson (1500-2500 words) that would train someone to actually DO this work in a dental office. Include:
- Detailed explanations of every concept with specific examples
- Real CDT codes where relevant (e.g., D0120, D2750, D4341)
- Step-by-step workflows and procedures they can follow
- Specific dollar amounts in examples (e.g., "If your fee is $1,400 and the PPO fee is $1,000...")
- Common mistakes to avoid
- Pro tips from experienced insurance coordinators
- How this topic connects to getting claims PAID and maximizing collections

Use **bold** for key terms and section headers. Write in a direct, practical training style — not academic. The reader needs to be able to apply this information tomorrow at the front desk.

Do NOT include any meta-commentary about the lesson. Just write the training content directly. Start with the first section header.`;
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
