"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PARTS, REFERENCE, SCENARIOS, LEVELS, getLevel } from "./data";

// localStorage helpers that match window.storage API shape
const _lsGet = async (key) => {
  try { const v = localStorage.getItem(key); return v ? { value: v } : null; } catch { return null; }
};
const _lsSet = async (key, value) => {
  try { localStorage.setItem(key, value); return true; } catch { return null; }
};
const _lsDel = async (key) => {
  try { localStorage.removeItem(key); return true; } catch { return null; }
};

/* ── BRIGHT THEME ── */
const T = {
  bg: "#f7f8fa",
  surface: "#ffffff",
  card: "#f0f2f5",
  cardHover: "#e8ebf0",
  border: "#e2e5ea",
  borderFocus: "#58cc02",
  text: "#1a2035",
  textSecondary: "#4b5975",
  muted: "#8b95a8",
  dim: "#bcc3cf",
  green: "#58cc02",
  greenDark: "#46a302",
  greenLight: "#e6f8d4",
  greenGlow: "rgba(88,204,2,0.12)",
  blue: "#1cb0f6",
  blueLight: "#ddf4ff",
  blueGlow: "rgba(28,176,246,0.12)",
  orange: "#ff9600",
  orangeLight: "#fff3e0",
  orangeGlow: "rgba(255,150,0,0.12)",
  red: "#ff4b4b",
  redLight: "#ffe0e0",
  purple: "#a560e8",
  purpleLight: "#f3e8ff",
  pink: "#e05abe",
  pinkLight: "#fce4f6",
  gold: "#ffc800",
  shadow: "0 2px 8px rgba(0,0,0,0.06)",
  shadowLg: "0 4px 20px rgba(0,0,0,0.08)",
};

const font = "'Nunito', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const stripMd = (t) => t.replace(/\*\*/g, "").replace(/^#+\s/gm, "").replace(/^-\s/gm, "").trim();

const getBestVoice = () => {
  const voices = window.speechSynthesis.getVoices();
  const prefs = ["Samantha", "Ava", "Zoe", "Karen", "Tessa", "Moira", "Google US English", "Microsoft Aria"];
  for (const name of prefs) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang === "en-US") || voices.find(v => v.lang.startsWith("en")) || null;
};

function WordHighlight({ text, charIdx }) {
  const tokens = [];
  const re = /\S+|\s+/g;
  let m;
  while ((m = re.exec(text)) !== null) tokens.push({ t: m[0], s: m.index, w: /\S/.test(m[0]) });
  let active = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].w && tokens[i].s <= charIdx) active = i;
  }
  return (
    <div style={{ fontSize: 14, lineHeight: 1.9, fontWeight: 500 }}>
      {tokens.map((tok, i) => (
        <span key={i} style={i === active ? { background: "#e6f8d4", color: "#46a302", borderRadius: 3, fontWeight: 800, padding: "0 1px" } : {}}>
          {tok.t}
        </span>
      ))}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [gd, setGd] = useState({ xp: 0, streak: 0, lastDate: null, completed: {}, completedScenarios: {} });
  const [selPart, setSelPart] = useState(null);
  const [selChapter, setSelChapter] = useState(null);
  const [quizState, setQuizState] = useState(null);
  const [quizFeedback, setQuizFeedback] = useState(null);
  const [scenarioState, setScenarioState] = useState(null);
  const [scenarioAnswer, setScenarioAnswer] = useState(null);
  const [dailyPractice, setDailyPractice] = useState(null);
  const [glossaryQ, setGlossaryQ] = useState("");
  const [expandedTerm, setExpandedTerm] = useState(null);
  const [showLevelUp, setShowLevelUp] = useState(null);
  const [showCorrectAnim, setShowCorrectAnim] = useState(false);
  const [deepContent, setDeepContent] = useState({});
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [masteryCount, setMasteryCount] = useState({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakRate, setSpeakRate] = useState(1);
  const [speakCharIdx, setSpeakCharIdx] = useState(-1);
  const glossaryRef = useRef(null);
  const deepContentRef = useRef({});
  const speakTextRef = useRef("");
  const speakCharIdxRef = useRef(-1);
  const speakRafRef = useRef(null);
  const speakRateRef = useRef(1);

  // Load ALL persisted data on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await _lsGet("diq-v3");
        if (r) {
          setGd(JSON.parse(r.value));
        } else {
          setShowOnboarding(true); // First time user
        }
      } catch { setShowOnboarding(true); }
      // Load cached lesson content
      try {
        const c = await _lsGet("diq-content");
        if (c) { const parsed = JSON.parse(c.value); deepContentRef.current = parsed; setDeepContent(parsed); }
      } catch {}
      // Load mastery counts
      try {
        const m = await _lsGet("diq-mastery");
        if (m) setMasteryCount(JSON.parse(m.value));
      } catch {}
    })();
  }, []);

  const save = useCallback(async (d) => {
    setGd(d);
    try { await _lsSet("diq-v3", JSON.stringify(d)); } catch {}
  }, []);

  // Save deep content to persistent storage when it changes
  const saveDeepContent = useCallback(async (newContent) => {
    deepContentRef.current = newContent;
    setDeepContent(newContent);
    try { await _lsSet("diq-content", JSON.stringify(newContent)); } catch {}
  }, []);

  // Save mastery counts when they change
  const saveMastery = useCallback(async (newMastery) => {
    setMasteryCount(newMastery);
    try { await _lsSet("diq-mastery", JSON.stringify(newMastery)); } catch {}
  }, []);

  // Reset all progress
  const resetProgress = useCallback(async () => {
    const fresh = { xp: 0, streak: 0, lastDate: null, completed: {}, completedScenarios: {} };
    setGd(fresh);
    setDeepContent({});
    setMasteryCount({});
    try {
      await _lsSet("diq-v3", JSON.stringify(fresh));
      await _lsDel("diq-content");
      await _lsDel("diq-mastery");
    } catch {}
    setShowSettings(false);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streakActive = gd.lastDate === today;
  const streakAlive = gd.lastDate === today || gd.lastDate === yesterday;

  const addXP = useCallback((amount, chapterId) => {
    const oldLvl = getLevel(gd.xp);
    const newXP = gd.xp + amount;
    const newLvl = getLevel(newXP);
    const newStreak = gd.lastDate === today ? gd.streak : (gd.lastDate === yesterday ? gd.streak + 1 : 1);
    const nd = { ...gd, xp: newXP, streak: newStreak, lastDate: today, completed: { ...gd.completed, [chapterId]: true } };
    save(nd);
    if (newLvl.idx > oldLvl.idx) setTimeout(() => setShowLevelUp(newLvl), 300);
  }, [gd, save, today, yesterday]);

  const allChapters = useMemo(() => PARTS.flatMap(p => p.chapters), []);
  const completedCount = Object.keys(gd.completed).length;
  const totalChapters = allChapters.length;
  const level = getLevel(gd.xp);

  const glossaryResults = useMemo(() => {
    if (!glossaryQ.trim()) return [];
    const q = glossaryQ.toLowerCase();
    return REFERENCE.filter(e => e.term.toLowerCase().includes(q) || e.def.toLowerCase().includes(q) || e.cat.toLowerCase().includes(q));
  }, [glossaryQ]);

  // Quiz
  const answerQ = useCallback((idx) => {
    const q = quizState.questions[quizState.current];
    const correct = idx === q.a;
    if (correct) { setShowCorrectAnim(true); setTimeout(() => setShowCorrectAnim(false), 800); }
    setQuizFeedback({ idx, correct, correctAnswer: q.a });
  }, [quizState]);
  const advanceQuiz = useCallback(() => {
    setQuizState(prev => ({ ...prev, answers: [...prev.answers, quizFeedback.idx], score: prev.score + (quizFeedback.correct ? 1 : 0), current: prev.current + 1 }));
    setQuizFeedback(null);
  }, [quizFeedback]);

  // Scenarios
  const answerScenario = useCallback((idx) => {
    const sc = scenarioState.scenarios[scenarioState.current];
    const correct = idx === sc.answer;
    if (correct) { setShowCorrectAnim(true); setTimeout(() => setShowCorrectAnim(false), 800); }
    setScenarioAnswer({ idx, correct });
  }, [scenarioState]);
  const advanceScenario = useCallback(() => {
    const xpE = scenarioAnswer.correct ? SCENARIOS[scenarioState.scenarios[scenarioState.current]?.id === scenarioState.scenarios[scenarioState.current]?.id ? 0 : 0] ? 15 : 5 : 5;
    const correct = scenarioAnswer.correct;
    const earned = correct ? 15 : 5;
    const oldLvl = getLevel(gd.xp);
    const newXP = gd.xp + earned;
    const newLvl = getLevel(newXP);
    const ns = gd.lastDate === today ? gd.streak : (gd.lastDate === yesterday ? gd.streak + 1 : 1);
    save({ ...gd, xp: newXP, streak: ns, lastDate: today, completedScenarios: { ...gd.completedScenarios, [scenarioState.scenarios[scenarioState.current].id]: true } });
    if (newLvl.idx > oldLvl.idx) setTimeout(() => setShowLevelUp(newLvl), 300);
    if (scenarioState.current + 1 < scenarioState.scenarios.length) {
      setScenarioState(prev => ({ ...prev, current: prev.current + 1, totalXP: prev.totalXP + earned }));
    } else {
      setScenarioState(prev => ({ ...prev, finished: true, totalXP: prev.totalXP + earned }));
    }
    setScenarioAnswer(null);
  }, [scenarioAnswer, scenarioState, gd, save, today, yesterday]);

  // Daily Practice
  const startDaily = useCallback(() => {
    const allQs = [];
    PARTS.forEach(p => p.chapters.forEach(ch => ch.quiz.forEach(q => allQs.push({ ...q, chNum: ch.num, chTitle: ch.title }))));
    setDailyPractice({ questions: allQs.sort(() => Math.random() - 0.5).slice(0, 5), current: 0, answers: [], score: 0 });
    setScreen("daily");
  }, []);

  // Get next chapter in sequence
  const getNextChapter = useCallback((currentCh) => {
    const all = PARTS.flatMap(p => p.chapters);
    const idx = all.findIndex(c => c.id === currentCh.id);
    return idx >= 0 && idx < all.length - 1 ? { ch: all[idx + 1], part: PARTS.find(p => p.chapters.some(c => c.id === all[idx + 1].id)) } : null;
  }, []);

  // Get first incomplete chapter for "Continue Learning"
  const getFirstIncomplete = useCallback(() => {
    for (const part of PARTS) {
      for (const ch of part.chapters) {
        if (!gd.completed[ch.id]) return { ch, part };
      }
    }
    return null;
  }, [gd.completed]);

  // Load deep AI-generated content for a chapter
  const loadDeepContent = useCallback(async (chapter) => {
    if (deepContentRef.current[chapter.id]) return;
    setLoadingContent(true);
    try {
      const r = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "lesson", chapter: { num: chapter.num, title: chapter.title, topics: chapter.topics } })
      });
      const d = await r.json();
      const text = d.text || "";
      saveDeepContent({ ...deepContentRef.current, [chapter.id]: text });
    } catch (e) {
      console.error("Failed to load deep content:", e);
    }
    setLoadingContent(false);
  }, [saveDeepContent]);

  // Auto-load deep content when chapter is selected
  useEffect(() => {
    if (selChapter && screen === "learn" && !quizState) {
      loadDeepContent(selChapter);
    }
  }, [selChapter, screen, quizState, loadDeepContent]);

  // Generate fresh AI quiz questions for mastery practice
  const generateNewQuiz = useCallback(async (chapter) => {
    setLoadingQuiz(true);
    try {
      const topicsStr = chapter.topics.join(", ");
      const prevQuestions = chapter.quiz.map(q => q.q).join("; ");
      const roundNum = (masteryCount[chapter.id] || 0) + 1;

      const prompt = `You are a dental insurance training quiz generator. Generate 5 NEW multiple-choice questions for Chapter ${chapter.num}: "${chapter.title}".

Topics: ${topicsStr}

This is mastery round ${roundNum}. The student has already answered basic questions. Generate HARDER, more specific, more practical questions that test real-world application — not just definitions.

Previous questions already asked (DO NOT repeat these): ${prevQuestions}

Rules:
- Each question must have exactly 4 answer options
- Exactly 1 correct answer per question
- Include specific CDT codes, dollar amounts, and realistic scenarios where relevant
- Test application of knowledge, not just recall
- Make wrong answers plausible (common misconceptions)
- Round ${roundNum > 2 ? "3+" : roundNum}: Make questions progressively harder — include edge cases, calculations, and "what would you do" scenarios

Respond ONLY with a JSON array, no markdown, no backticks, no explanation. Format:
[{"q":"question text","opts":["option A","option B","option C","option D"],"a":0}]
Where "a" is the zero-based index of the correct answer.`;

      const r = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "quiz", chapter: { num: chapter.num, title: chapter.title, topics: chapter.topics }, masteryRound: roundNum, prevQuestions })
      });
      const d = await r.json();
      const text = d.text || d.content?.map(i => i.text || "").join("") || "[]";
      const cleaned = text.replace(/```json|```/g, "").trim();
      const questions = JSON.parse(cleaned);

      if (Array.isArray(questions) && questions.length > 0) {
        setMasteryCount(prev => {
          const updated = { ...prev, [chapter.id]: (prev[chapter.id] || 0) + 1 };
          saveMastery(updated);
          return updated;
        });
        setQuizFeedback(null);
        setQuizState({ questions, current: 0, answers: [], score: 0, isAI: true, round: roundNum });
      }
    } catch (e) {
      console.error("Failed to generate quiz:", e);
    }
    setLoadingQuiz(false);
  }, [masteryCount]);

  /* ── SHARED COMPONENTS ── */
  const Wrap = ({ children }) => <div style={{ fontFamily: font, background: T.bg, minHeight: "100vh", color: T.text }}>{children}</div>;

  const Nav = ({ title, onBack }) => (
    <div style={{ background: T.surface, borderBottom: `2px solid ${T.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10, boxShadow: T.shadow }}>
      <button onClick={onBack} style={{ background: T.card, border: `2px solid ${T.border}`, borderRadius: 12, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 800, color: T.textSecondary, fontFamily: font }}>← Back</button>
      <span style={{ fontSize: 14, fontWeight: 800, color: T.textSecondary, flex: 1 }}>{title}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13 }}>🔥</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: streakAlive ? T.orange : T.dim }}>{streakAlive ? gd.streak : 0}</span>
        <div style={{ width: 1, height: 16, background: T.border, margin: "0 4px" }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: T.gold }}>{gd.xp} XP</span>
      </div>
    </div>
  );

  const ProgressBar = ({ pct, color = T.green, height = 10 }) => (
    <div style={{ height, background: T.card, borderRadius: height, overflow: "hidden", border: `2px solid ${T.border}` }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: height, transition: "width 0.5s ease" }} />
    </div>
  );

  const Btn = ({ children, color = T.green, dark, onClick, disabled, full, style: s = {} }) => (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? T.dim : color, color: dark || "#fff", border: "none",
      borderBottom: disabled ? "none" : `4px solid ${color === T.green ? T.greenDark : color === T.blue ? "#0f8bc0" : color === T.orange ? "#cc7a00" : "rgba(0,0,0,0.2)"}`,
      borderRadius: 16, padding: "14px 24px", fontSize: 15, fontWeight: 800, cursor: disabled ? "default" : "pointer",
      fontFamily: font, width: full ? "100%" : "auto", transition: "all 0.15s", letterSpacing: "0.02em",
      ...(disabled ? { opacity: 0.5 } : {}), ...s,
    }}>{children}</button>
  );

  const CorrectOverlay = () => showCorrectAnim ? (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 100 }}>
      <div style={{ fontSize: 80, animation: "popIn 0.5s ease" }}>✅</div>
      <style>{`@keyframes popIn { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 50% { transform: scale(1.3) rotate(5deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 0; } }`}</style>
    </div>
  ) : null;

  /* ── ONBOARDING ── */
  if (showOnboarding) return (
    <Wrap>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🦷</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: T.text, marginBottom: 8, lineHeight: 1.3 }}>Dental Insurance Mastery</h1>
          <p style={{ fontSize: 15, color: T.textSecondary, lineHeight: 1.7, marginBottom: 8, fontWeight: 600 }}>
            A complete training course to master dental insurance — from basics to advanced coding, claims, appeals, and profitability.
          </p>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 28, fontWeight: 600 }}>
            Based on Dr. Travis Campbell's 32-chapter guide. 
            Earn XP, build streaks, and achieve mastery through quizzes with unlimited practice questions.
          </p>
          <div style={{ background: T.surface, border: `2px solid ${T.border}`, borderRadius: 18, padding: "16px", marginBottom: 24, textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: T.muted, marginBottom: 10, letterSpacing: "0.08em" }}>WHAT YOU'LL LEARN</div>
            {["Insurance types, networks & how carriers work", "CDT coding, claims filing & X-ray billing", "Verification, COB & coordination workflows", "Denials, appeals & getting claims paid", "PPO contracts, fee schedules & negotiation", "Profitability analysis & when to drop plans", "Real-world scenarios & 16 case studies"].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ color: T.green, fontWeight: 900, fontSize: 14 }}>✓</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{item}</span>
              </div>
            ))}
          </div>
          <Btn onClick={() => setShowOnboarding(false)} full>
            Start Learning
          </Btn>
          <p style={{ fontSize: 11, color: T.dim, marginTop: 12, fontWeight: 600 }}>Your progress saves automatically</p>
        </div>
      </div>
    </Wrap>
  );

  /* ── SETTINGS ── */
  if (showSettings) return (
    <Wrap>
      <Nav title="Settings" onBack={() => setShowSettings(false)} />
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
        <div style={{ background: T.surface, border: `2px solid ${T.border}`, borderRadius: 18, padding: "20px", marginBottom: 16, boxShadow: T.shadow }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, marginTop: 0, marginBottom: 12 }}>Your Progress</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: T.card, borderRadius: 12, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.gold }}>{gd.xp}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Total XP</div>
            </div>
            <div style={{ background: T.card, borderRadius: 12, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.green }}>{completedCount}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Chapters</div>
            </div>
            <div style={{ background: T.card, borderRadius: 12, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.orange }}>{Object.values(masteryCount).filter(v => v >= 3).length}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Mastered</div>
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Level: {level.emoji} {level.name}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, marginTop: 2 }}>Streak: {streakAlive ? gd.streak : 0} days</div>
        </div>

        <div style={{ background: T.surface, border: `2px solid ${T.border}`, borderRadius: 18, padding: "20px", marginBottom: 16, boxShadow: T.shadow }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, marginTop: 0, marginBottom: 8 }}>Share This App</h3>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>Share the link to this conversation and anyone with a Claude account can use the app. Each person gets their own progress tracking.</p>
          <button onClick={() => { try { navigator.clipboard.writeText(window.location.href); alert("Link copied!"); } catch(e) { prompt("Copy this link:", window.location.href); } }} style={{ background: T.blueLight, border: `2px solid ${T.blue}40`, borderRadius: 12, padding: "10px 16px", cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 800, color: T.blue, width: "100%" }}>
            📋 Copy Link to Share
          </button>
        </div>

        <div style={{ background: T.surface, border: `2px solid ${T.border}`, borderRadius: 18, padding: "20px", marginBottom: 16, boxShadow: T.shadow }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, marginTop: 0, marginBottom: 8 }}>Cached Lessons</h3>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, lineHeight: 1.6, marginBottom: 4 }}>{Object.keys(deepContent).length} of {totalChapters} lessons cached locally. Cached lessons load instantly without waiting.</p>
        </div>

        <div style={{ background: T.surface, border: `2px solid ${T.red}30`, borderRadius: 18, padding: "20px", boxShadow: T.shadow }}>
          <h3 style={{ fontSize: 16, fontWeight: 900, marginTop: 0, marginBottom: 8, color: T.red }}>Danger Zone</h3>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>Reset all progress, XP, streaks, mastery, and cached lessons. This cannot be undone.</p>
          <button onClick={() => { if (confirm("Are you sure? This will erase ALL your progress, XP, streaks, and cached lessons. This cannot be undone.")) resetProgress(); }} style={{ background: T.redLight, border: `2px solid ${T.red}40`, borderRadius: 12, padding: "10px 16px", cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 800, color: T.red, width: "100%" }}>
            🗑 Reset All Progress
          </button>
        </div>
      </div>
    </Wrap>
  );

  /* ── LEVEL UP ── */
  if (showLevelUp) return (
    <Wrap>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 32 }}>
        <div style={{ textAlign: "center", background: T.surface, borderRadius: 24, padding: "48px 32px", boxShadow: T.shadowLg, border: `2px solid ${T.border}`, maxWidth: 360 }}>
          <div style={{ fontSize: 72, marginBottom: 16, animation: "levelBounce 0.6s ease" }}>{showLevelUp.emoji}</div>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.15em", color: T.orange, marginBottom: 4 }}>LEVEL UP!</div>
          <h2 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px", color: T.text }}>{showLevelUp.name}</h2>
          <p style={{ color: T.muted, fontSize: 15, marginBottom: 28 }}>Keep going to reach the next level!</p>
          <Btn onClick={() => setShowLevelUp(null)} full>Continue</Btn>
        </div>
      </div>
      <style>{`@keyframes levelBounce { 0%,100% { transform: scale(1); } 40% { transform: scale(1.3); } 60% { transform: scale(0.95); } }`}</style>
    </Wrap>
  );

  /* ── HOME ── */
  if (screen === "home") {
    const pct = level.nextXP ? ((gd.xp - level.minXP) / (level.nextXP - level.minXP)) * 100 : 100;
    return (
      <Wrap>
        <CorrectOverlay />
        <div style={{ background: T.green, padding: "28px 20px 20px", color: "#fff" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", opacity: 0.85, marginBottom: 4 }}>DENTAL INSURANCE MASTERY</div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 4px" }}>Insurance Intelligence</h1>
              <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>Based on Dr. Campbell's 32-chapter guide</p>
            </div>
            <button onClick={() => setShowSettings(true)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 12, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, flexShrink: 0, marginTop: 4 }}>⚙️</button>
          </div>
        </div>

        <div style={{ maxWidth: 560, margin: "-12px auto 0", padding: "0 16px 32px" }}>
          {/* Stats card */}
          <div style={{ background: T.surface, borderRadius: 20, border: `2px solid ${T.border}`, padding: "18px 18px 14px", boxShadow: T.shadow, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>{level.emoji}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: T.text }}>{level.name}</div>
                  <div style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>{gd.xp} XP {level.nextXP ? `/ ${level.nextXP}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20 }}>🔥</div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: streakAlive ? T.orange : T.dim }}>{streakAlive ? gd.streak : 0}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20 }}>✅</div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: T.green }}>{completedCount}/{totalChapters}</div>
                </div>
              </div>
            </div>
            <ProgressBar pct={pct} />
          </div>

          {!streakActive && streakAlive && (
            <div style={{ background: T.orangeLight, border: `2px solid ${T.orange}40`, borderRadius: 16, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>🔥</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.orange }}>Complete a lesson to keep your {gd.streak}-day streak!</span>
            </div>
          )}

          {/* Continue Learning button */}
          {(() => {
            const next = getFirstIncomplete();
            if (next && completedCount > 0) return (
              <button onClick={() => { setSelPart(next.part); setSelChapter(next.ch); setScreen("learn"); }} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", background: T.green, border: "none", borderBottom: `4px solid ${T.greenDark}`, borderRadius: 18, padding: "16px 18px", marginBottom: 16, cursor: "pointer", fontFamily: font, color: "#fff" }}>
                <div style={{ width: 46, height: 46, borderRadius: 23, background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>▶</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>Continue Learning</div>
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>Ch {next.ch.num}: {next.ch.title}</div>
                </div>
              </button>
            );
            if (!next) return null;
            return (
              <button onClick={() => { const first = PARTS[0].chapters[0]; setSelPart(PARTS[0]); setSelChapter(first); setScreen("learn"); }} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", background: T.green, border: "none", borderBottom: `4px solid ${T.greenDark}`, borderRadius: 18, padding: "16px 18px", marginBottom: 16, cursor: "pointer", fontFamily: font, color: "#fff" }}>
                <div style={{ width: 46, height: 46, borderRadius: 23, background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>▶</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>Start Course</div>
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>Ch 1: What Is the Purpose of Dental Insurance?</div>
                </div>
              </button>
            );
          })()}

          {/* 4 mode buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {[
              { icon: "📖", label: "Learn", sub: "32 chapters", color: T.green, bg: T.greenLight, action: () => setScreen("learn") },
              { icon: "📚", label: "Glossary", sub: "Terms & definitions", color: T.blue, bg: T.blueLight, action: () => { setScreen("glossary"); setTimeout(() => glossaryRef.current?.focus(), 100); } },
              { icon: "🎯", label: "Scenarios", sub: "Real-world", color: T.orange, bg: T.orangeLight, action: () => { setScenarioState({ scenarios: [...SCENARIOS].sort(() => Math.random() - 0.5).slice(0, 3), current: 0, totalXP: 0, finished: false }); setScreen("scenarios"); } },
              { icon: "⚡", label: "Daily Practice", sub: "5 questions", color: T.purple, bg: T.purpleLight, action: startDaily },
            ].map(m => (
              <button key={m.label} onClick={m.action} style={{ background: T.surface, border: `2px solid ${T.border}`, borderBottom: `4px solid ${T.border}`, borderRadius: 18, padding: "18px 14px", cursor: "pointer", textAlign: "left", transition: "all 0.1s", fontFamily: font }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 8 }}>{m.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{m.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginTop: 2 }}>{m.sub}</div>
              </button>
            ))}
          </div>

          {/* Course path */}
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.08em", color: T.muted, marginBottom: 14 }}>COURSE OUTLINE</div>
          {PARTS.map((part, pi) => {
            const done = part.chapters.filter(ch => gd.completed[ch.id]).length;
            const total = part.chapters.length;
            const colors = [T.green, T.blue, T.orange, T.purple, T.pink, T.green];
            const pc = colors[pi % colors.length];
            return (
              <button key={part.id} onClick={() => { setSelPart(part); setScreen("learn"); }} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", background: T.surface, border: `2px solid ${T.border}`, borderBottom: `4px solid ${T.border}`, borderRadius: 18, padding: "16px", marginBottom: 10, cursor: "pointer", textAlign: "left", fontFamily: font, transition: "all 0.1s" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: done === total ? T.greenLight : `${pc}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: done === total ? 20 : 15, fontWeight: 900, color: done === total ? T.green : pc, border: `2px solid ${done === total ? T.green : pc}30`, flexShrink: 0 }}>
                  {done === total ? "✓" : `${done}/${total}`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{part.title}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>{total} chapters · {part.chapters.reduce((a, c) => a + c.xp, 0)} XP</div>
                </div>
              </button>
            );
          })}
        </div>
      </Wrap>
    );
  }

  /* ── LEARN ── */
  if (screen === "learn" && !selChapter) {
    const colors = [T.green, T.blue, T.orange, T.purple, T.pink, T.green];
    if (!selPart) {
      return (
        <Wrap>
          <Nav title="Learn" onBack={() => setScreen("home")} />
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
            {PARTS.map((part, pi) => (
              <div key={part.id} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: colors[pi % colors.length], marginBottom: 10, letterSpacing: "0.04em" }}>{part.title.toUpperCase()}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {part.chapters.map((ch) => {
                    const done = gd.completed[ch.id];
                    const pc = colors[pi % colors.length];
                    return (
                      <button key={ch.id} onClick={() => { setSelPart(part); setSelChapter(ch); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: done ? T.greenLight : T.surface, border: `2px solid ${done ? T.green + "60" : T.border}`, borderRadius: 12, padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: font }}>
                        <span style={{ fontSize: 10, fontWeight: 900, color: done ? T.green : pc, background: done ? `${T.green}20` : `${pc}18`, padding: "3px 8px", borderRadius: 6, flexShrink: 0 }}>{done ? "✓" : `CH ${ch.num}`}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>{ch.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.muted }}>{ch.xp} XP</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Wrap>
      );
    }
    const pi = PARTS.indexOf(selPart);
    const pc = colors[pi % colors.length];
    return (
      <Wrap>
        <Nav title={selPart.title} onBack={() => setSelPart(null)} />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
          {selPart.chapters.map((ch) => {
            const done = gd.completed[ch.id];
            return (
              <button key={ch.id} onClick={() => setSelChapter(ch)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: done ? T.greenLight : T.surface, border: `2px solid ${done ? T.green + "60" : T.border}`, borderBottom: `4px solid ${done ? T.green + "60" : T.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 8, cursor: "pointer", textAlign: "left", fontFamily: font }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: done ? T.green : pc, background: done ? `${T.green}20` : `${pc}18`, padding: "4px 10px", borderRadius: 8, flexShrink: 0 }}>{done ? "✓ DONE" : `CH ${ch.num}`}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{ch.title}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginTop: 2 }}>{ch.topics.slice(0, 3).join(" · ")}{ch.topics.length > 3 ? " …" : ""}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: pc }}>{ch.xp} XP</span>
              </button>
            );
          })}
        </div>
      </Wrap>
    );
  }

  /* ── LESSON + QUIZ ── */
  if (screen === "learn" && selChapter) {
    if (quizState) {
      const isDone = quizState.current >= quizState.questions.length;
      return (
        <Wrap>
          <CorrectOverlay />
          <Nav title={`Ch ${selChapter.num} Quiz`} onBack={() => { setQuizState(null); setQuizFeedback(null); }} />
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
            {isDone ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 60, marginBottom: 12 }}>{quizState.score === quizState.questions.length ? "🎉" : quizState.score >= quizState.questions.length * 0.5 ? "👍" : "📚"}</div>
                <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>{quizState.isAI ? `Mastery Round ${quizState.round}` : "Quiz Complete!"}</h2>
                <p style={{ fontSize: 16, color: T.muted, fontWeight: 700, marginBottom: 4 }}>{quizState.score}/{quizState.questions.length} correct</p>
                <p style={{ fontSize: 16, fontWeight: 900, color: T.orange, marginBottom: 8 }}>+{quizState.isAI ? quizState.score * 5 : selChapter.xp} XP</p>

                {/* Mastery progress */}
                {(() => {
                  const rounds = (masteryCount[selChapter.id] || 0);
                  const mastered = rounds >= 3;
                  return (
                    <div style={{ background: mastered ? T.greenLight : T.card, border: `2px solid ${mastered ? T.green : T.border}`, borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "inline-block" }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: mastered ? T.green : T.muted, marginBottom: 4 }}>
                        {mastered ? "🏆 MASTERED" : "MASTERY PROGRESS"}
                      </div>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        {[1, 2, 3].map(r => (
                          <div key={r} style={{ width: 28, height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, background: r <= rounds ? T.green : T.surface, color: r <= rounds ? "#fff" : T.dim, border: `2px solid ${r <= rounds ? T.green : T.border}`, fontWeight: 900 }}>
                            {r <= rounds ? "★" : r}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginTop: 4 }}>
                        {mastered ? "You've demonstrated mastery of this topic!" : `${3 - rounds} more round${3 - rounds !== 1 ? "s" : ""} to mastery`}
                      </div>
                    </div>
                  );
                })()}

                {quizState.questions.map((q, i) => {
                  const ok = quizState.answers[i] === q.a;
                  return (
                    <div key={i} style={{ background: ok ? T.greenLight : T.redLight, border: `2px solid ${ok ? T.green : T.red}30`, borderRadius: 14, padding: "12px 14px", marginBottom: 8, textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>{q.q}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: ok ? T.green : T.red }}>
                        {ok ? "✓ " : "✗ "}{q.opts[quizState.answers[i]]}
                        {!ok && <span style={{ color: T.greenDark }}> → {q.opts[q.a]}</span>}
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 20 }}>
                  {!quizState.isAI && (
                    <Btn onClick={() => { addXP(selChapter.xp, selChapter.id); setQuizState(null); }} full>
                      {gd.completed[selChapter.id] ? "Continue" : `Claim ${selChapter.xp} XP ✓`}
                    </Btn>
                  )}
                  {quizState.isAI && (
                    <Btn onClick={() => {
                      const earned = quizState.score * 5;
                      const oldLvl = getLevel(gd.xp);
                      const newXP = gd.xp + earned;
                      const newLvl = getLevel(newXP);
                      const ns = gd.lastDate === today ? gd.streak : (gd.lastDate === yesterday ? gd.streak + 1 : 1);
                      save({ ...gd, xp: newXP, streak: ns, lastDate: today });
                      if (newLvl.idx > oldLvl.idx) setTimeout(() => setShowLevelUp(newLvl), 300);
                      setQuizState(null);
                    }} full>
                      Claim {quizState.score * 5} XP ✓
                    </Btn>
                  )}

                  {/* Keep Practicing — generates new AI questions */}
                  <button onClick={() => generateNewQuiz(selChapter)} disabled={loadingQuiz} style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
                    background: loadingQuiz ? T.card : T.surface, border: `2px solid ${T.orange}`,
                    borderBottom: loadingQuiz ? `2px solid ${T.orange}` : `4px solid ${T.orange}`,
                    borderRadius: 16, padding: "14px", marginTop: 10, cursor: loadingQuiz ? "wait" : "pointer",
                    fontFamily: font, fontSize: 14, fontWeight: 800, color: T.orange,
                    opacity: loadingQuiz ? 0.7 : 1,
                  }}>
                    {loadingQuiz ? (
                      <><span style={{ display: "inline-block", width: 16, height: 16, border: `2px solid ${T.orange}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Generating new questions...</>
                    ) : (
                      <>🔄 Keep Practicing — New Questions</>
                    )}
                  </button>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                  {!quizState.isAI && (() => {
                    const next = getNextChapter(selChapter);
                    if (next) return (
                      <button onClick={() => { addXP(selChapter.xp, selChapter.id); setQuizState(null); setQuizFeedback(null); setSelChapter(next.ch); setSelPart(next.part); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: T.surface, border: `2px solid ${T.green}`, borderBottom: `4px solid ${T.green}`, borderRadius: 16, padding: "14px", marginTop: 10, cursor: "pointer", fontFamily: font, fontSize: 14, fontWeight: 800, color: T.green }}>
                        Next: Ch {next.ch.num} →
                      </button>
                    );
                    return null;
                  })()}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 5, marginBottom: 20 }}>
                  {quizState.questions.map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < quizState.current ? T.green : i === quizState.current ? `${T.green}50` : T.card, border: `2px solid ${i < quizState.current ? T.green : T.border}`, transition: "all 0.3s" }} />
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: T.muted, marginBottom: 14 }}>QUESTION {quizState.current + 1} OF {quizState.questions.length}</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.5, marginBottom: 20, color: T.text }}>{quizState.questions[quizState.current].q}</h3>
                {quizState.questions[quizState.current].opts.map((opt, i) => {
                  const fb = quizFeedback;
                  const sel = fb && fb.idx === i;
                  const isRight = fb && fb.correctAnswer === i;
                  const bg = fb ? (isRight ? T.greenLight : sel ? T.redLight : T.surface) : T.surface;
                  const bd = fb ? (isRight ? T.green : sel ? T.red : T.border) : T.border;
                  return (
                    <button key={i} onClick={() => !fb && answerQ(i)} disabled={!!fb} style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%", background: bg,
                      border: `2px solid ${bd}`, borderBottom: fb ? `2px solid ${bd}` : `4px solid ${bd}`,
                      borderRadius: 14, padding: "14px 16px", marginBottom: 8, cursor: fb ? "default" : "pointer",
                      textAlign: "left", fontSize: 14, fontWeight: 700, color: T.text, fontFamily: font, transition: "all 0.15s",
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                        background: fb ? (isRight ? T.green : sel ? T.red : T.card) : T.card,
                        color: fb ? (isRight || sel ? "#fff" : T.muted) : T.muted,
                        fontSize: 13, fontWeight: 900, flexShrink: 0, border: `2px solid ${fb ? (isRight ? T.green : sel ? T.red : T.border) : T.border}`,
                      }}>{fb ? (isRight ? "✓" : sel ? "✗" : String.fromCharCode(65 + i)) : String.fromCharCode(65 + i)}</div>
                      {opt}
                    </button>
                  );
                })}
                {quizFeedback && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ background: quizFeedback.correct ? T.greenLight : T.redLight, border: `2px solid ${quizFeedback.correct ? T.green : T.red}40`, borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: quizFeedback.correct ? T.green : T.red, marginBottom: 4 }}>{quizFeedback.correct ? "✓ Correct!" : "✗ Not quite!"}</div>
                      {!quizFeedback.correct && <div style={{ fontSize: 13, fontWeight: 700, color: T.textSecondary }}>Correct answer: <strong style={{ color: T.greenDark }}>{quizState.questions[quizState.current].opts[quizFeedback.correctAnswer]}</strong></div>}
                    </div>
                    <Btn onClick={advanceQuiz} full color={quizFeedback.correct ? T.green : T.red}>Continue</Btn>
                  </div>
                )}
              </div>
            )}
          </div>
        </Wrap>
      );
    }
    // Lesson content
    const displayContent = deepContent[selChapter.id] || selChapter.content;
    const isDeep = !!deepContent[selChapter.id];
    return (
      <Wrap>
        <Nav title={selPart?.title || "Learn"} onBack={() => { window.speechSynthesis?.cancel(); setSpeaking(false); setSelChapter(null); }} />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, flex: 1, lineHeight: 1.3 }}>Ch {selChapter.num}: {selChapter.title}</h2>
            {gd.completed[selChapter.id] && <span style={{ fontSize: 11, fontWeight: 900, color: T.green, background: T.greenLight, padding: "4px 10px", borderRadius: 8 }}>DONE</span>}
          </div>
          {selChapter.topics.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 16 }}>
              {selChapter.topics.map(t => <span key={t} style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary, background: T.card, padding: "4px 10px", borderRadius: 8, border: `1px solid ${T.border}` }}>{t}</span>)}
            </div>
          )}

          {loadingContent && !deepContent[selChapter.id] ? (
            <div style={{ background: T.surface, border: `2px solid ${T.border}`, borderRadius: 20, padding: "24px 18px", marginBottom: 20, boxShadow: T.shadow }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 24, height: 24, border: `3px solid ${T.green}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: T.green }}>Getting AI take...</span>
              </div>
              {/* Skeleton lines */}
              {[100, 85, 92, 70, 95, 88, 60, 93, 80, 75].map((w, i) => (
                <div key={i} style={{ height: 14, width: `${w}%`, background: T.card, borderRadius: 7, marginBottom: 10, animation: `pulse 1.5s ease-in-out infinite`, animationDelay: `${i * 0.1}s` }} />
              ))}
              <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
              {/* Show brief content while loading */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, marginBottom: 8 }}>QUICK OVERVIEW (AI take loading...)</div>
                {selChapter.content.split("\n\n").map((para, i) => (
                  <p key={i} style={{ margin: i === 0 ? 0 : "10px 0 0", lineHeight: 1.7, fontSize: 13, color: T.textSecondary, fontWeight: 500 }}>
                    {para.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => seg.startsWith("**") ? <strong key={j} style={{ color: T.blue, fontWeight: 800 }}>{seg.replace(/\*\*/g, "")}</strong> : seg)}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ background: T.surface, border: `2px solid ${T.border}`, borderRadius: 20, padding: "20px 18px", marginBottom: 20, boxShadow: T.shadow }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {isDeep && <div style={{ fontSize: 10, fontWeight: 900, color: T.green, background: T.greenLight, padding: "3px 8px", borderRadius: 6 }}>AI TAKE</div>}
                <button onClick={() => {
                  if (speaking) {
                    window.speechSynthesis.cancel();
                    cancelAnimationFrame(speakRafRef.current);
                    setSpeaking(false); setSpeakCharIdx(-1); speakCharIdxRef.current = -1;
                    return;
                  }
                  const text = stripMd(displayContent);
                  speakTextRef.current = text;
                  const startUtter = (rate) => {
                    const utter = new SpeechSynthesisUtterance(text);
                    utter.rate = rate;
                    const voice = getBestVoice();
                    if (voice) utter.voice = voice;
                    utter.onboundary = (e) => {
                      if (e.name !== "word") return;
                      speakCharIdxRef.current = e.charIndex;
                      cancelAnimationFrame(speakRafRef.current);
                      speakRafRef.current = requestAnimationFrame(() => setSpeakCharIdx(e.charIndex));
                    };
                    utter.onend = () => { cancelAnimationFrame(speakRafRef.current); setSpeaking(false); setSpeakCharIdx(-1); speakCharIdxRef.current = -1; };
                    utter.onerror = () => { cancelAnimationFrame(speakRafRef.current); setSpeaking(false); setSpeakCharIdx(-1); speakCharIdxRef.current = -1; };
                    window.speechSynthesis.speak(utter);
                  };
                  setSpeaking(true); setSpeakCharIdx(0); speakCharIdxRef.current = 0;
                  if (window.speechSynthesis.getVoices().length === 0) {
                    window.speechSynthesis.onvoiceschanged = () => startUtter(speakRateRef.current);
                  } else {
                    startUtter(speakRateRef.current);
                  }
                }} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: speaking ? T.red : T.blue, background: speaking ? T.redLight : T.blueLight, border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                  {speaking ? "⏹ Stop" : "▶ Listen"}
                </button>
                <div style={{ display: "flex", gap: 3 }}>
                  {[1, 1.5, 2].map(r => (
                    <button key={r} onClick={() => {
                      speakRateRef.current = r;
                      setSpeakRate(r);
                      if (speaking) {
                        window.speechSynthesis.cancel();
                        cancelAnimationFrame(speakRafRef.current);
                        const text = speakTextRef.current;
                        const utter = new SpeechSynthesisUtterance(text);
                        utter.rate = r;
                        const voice = getBestVoice();
                        if (voice) utter.voice = voice;
                        utter.onboundary = (e) => {
                          if (e.name !== "word") return;
                          speakCharIdxRef.current = e.charIndex;
                          cancelAnimationFrame(speakRafRef.current);
                          speakRafRef.current = requestAnimationFrame(() => setSpeakCharIdx(e.charIndex));
                        };
                        utter.onend = () => { cancelAnimationFrame(speakRafRef.current); setSpeaking(false); setSpeakCharIdx(-1); };
                        utter.onerror = () => { cancelAnimationFrame(speakRafRef.current); setSpeaking(false); setSpeakCharIdx(-1); };
                        window.speechSynthesis.speak(utter);
                      }
                    }} style={{ fontSize: 10, fontWeight: 800, color: speakRate === r ? T.green : T.muted, background: speakRate === r ? T.greenLight : T.card, border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                      {r}x
                    </button>
                  ))}
                </div>
              </div>
              {speaking && speakTextRef.current ? (
                <WordHighlight text={speakTextRef.current} charIdx={speakCharIdx} />
              ) : displayContent.split("\n\n").map((para, i) => {
                // Handle markdown-style headers
                if (para.startsWith("**") && para.endsWith("**") && para.length < 100) {
                  return <h3 key={i} style={{ fontSize: 16, fontWeight: 900, color: T.blue, margin: i === 0 ? "0 0 8px" : "20px 0 8px", lineHeight: 1.4 }}>{para.replace(/\*\*/g, "")}</h3>;
                }
                if (para.startsWith("# ")) {
                  return <h3 key={i} style={{ fontSize: 16, fontWeight: 900, color: T.blue, margin: i === 0 ? "0 0 8px" : "20px 0 8px" }}>{para.replace(/^# /, "")}</h3>;
                }
                if (para.startsWith("## ")) {
                  return <h4 key={i} style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: "18px 0 6px" }}>{para.replace(/^## /, "")}</h4>;
                }
                // Handle bullet points
                if (para.includes("\n- ") || para.startsWith("- ")) {
                  const lines = para.split("\n");
                  return <div key={i} style={{ margin: "10px 0" }}>
                    {lines.map((line, li) => {
                      if (line.startsWith("- ")) {
                        return <div key={li} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
                          <span style={{ color: T.green, fontWeight: 900, flexShrink: 0 }}>•</span>
                          <span style={{ fontSize: 13.5, lineHeight: 1.7, color: T.text, fontWeight: 500 }}>
                            {line.slice(2).split(/(\*\*[^*]+\*\*)/g).map((seg, sj) => seg.startsWith("**") ? <strong key={sj} style={{ color: T.blue, fontWeight: 800 }}>{seg.replace(/\*\*/g, "")}</strong> : seg)}
                          </span>
                        </div>;
                      }
                      return <p key={li} style={{ margin: "6px 0", lineHeight: 1.7, fontSize: 13.5, color: T.text, fontWeight: 500 }}>
                        {line.split(/(\*\*[^*]+\*\*)/g).map((seg, sj) => seg.startsWith("**") ? <strong key={sj} style={{ color: T.blue, fontWeight: 800 }}>{seg.replace(/\*\*/g, "")}</strong> : seg)}
                      </p>;
                    })}
                  </div>;
                }
                return <p key={i} style={{ margin: i === 0 ? 0 : "12px 0 0", lineHeight: 1.8, fontSize: 14, color: T.text, fontWeight: 500 }}>
                  {para.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => seg.startsWith("**") ? <strong key={j} style={{ color: T.blue, fontWeight: 800 }}>{seg.replace(/\*\*/g, "")}</strong> : seg)}
                </p>;
              })}
            </div>
          )}
          <Btn onClick={() => setQuizState({ questions: selChapter.quiz, current: 0, answers: [], score: 0 })} full>
            Take Quiz · {selChapter.quiz.length} Questions · {selChapter.xp} XP
          </Btn>
        </div>
      </Wrap>
    );
  }

  /* ── SCENARIOS ── */
  if (screen === "scenarios") {
    if (!scenarioState) { setScreen("home"); return null; }
    if (scenarioState.finished) return (
      <Wrap>
        <Nav title="Scenarios" onBack={() => { setScenarioState(null); setScreen("home"); }} />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 60, marginBottom: 12 }}>🎯</div>
          <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>Scenarios Complete!</h2>
          <p style={{ color: T.orange, fontSize: 18, fontWeight: 900, marginBottom: 28 }}>+{scenarioState.totalXP} XP earned</p>
          <Btn onClick={() => { setScenarioState(null); setScreen("home"); }} full>Back to Home</Btn>
        </div>
      </Wrap>
    );
    const sc = scenarioState.scenarios[scenarioState.current];
    return (
      <Wrap>
        <CorrectOverlay />
        <Nav title="Scenario Challenge" onBack={() => { setScenarioState(null); setScenarioAnswer(null); setScreen("home"); }} />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
            {scenarioState.scenarios.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < scenarioState.current ? T.orange : i === scenarioState.current ? `${T.orange}50` : T.card, border: `2px solid ${i < scenarioState.current ? T.orange : T.border}` }} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: T.orange, background: T.orangeLight, padding: "4px 10px", borderRadius: 8 }}>{sc.difficulty}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.orange }}>{sc.xp} XP</span>
          </div>
          <h3 style={{ fontSize: 19, fontWeight: 900, marginBottom: 14 }}>{sc.title}</h3>
          <div style={{ background: T.orangeLight, border: `2px solid ${T.orange}30`, borderRadius: 18, padding: "16px 18px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", color: T.orange, marginBottom: 8 }}>SITUATION</div>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: T.text, margin: 0, fontWeight: 500 }}>{sc.situation}</p>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 14 }}>{sc.question}</div>
          {sc.opts.map((opt, i) => {
            const sa = scenarioAnswer;
            const sel = sa && sa.idx === i;
            const isRight = sa && sc.answer === i;
            const bg = sa ? (isRight ? T.greenLight : sel ? T.redLight : T.surface) : T.surface;
            const bd = sa ? (isRight ? T.green : sel ? T.red : T.border) : T.border;
            return (
              <button key={i} onClick={() => !sa && answerScenario(i)} disabled={!!sa} style={{
                display: "flex", alignItems: "flex-start", gap: 12, width: "100%", background: bg,
                border: `2px solid ${bd}`, borderBottom: sa ? `2px solid ${bd}` : `4px solid ${bd}`,
                borderRadius: 14, padding: "13px 14px", marginBottom: 8, cursor: sa ? "default" : "pointer",
                textAlign: "left", fontSize: 13, fontWeight: 600, color: T.text, fontFamily: font, lineHeight: 1.6,
              }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: sa ? (isRight ? T.green : sel ? T.red : T.card) : T.card, color: sa ? (isRight || sel ? "#fff" : T.muted) : T.muted, fontSize: 12, fontWeight: 900, flexShrink: 0, marginTop: 2, border: `2px solid ${sa ? (isRight ? T.green : sel ? T.red : T.border) : T.border}` }}>
                  {sa ? (isRight ? "✓" : sel ? "✗" : String.fromCharCode(65 + i)) : String.fromCharCode(65 + i)}
                </div>
                <span>{opt}</span>
              </button>
            );
          })}
          {scenarioAnswer && (
            <div style={{ marginTop: 14 }}>
              <div style={{ background: scenarioAnswer.correct ? T.greenLight : T.redLight, border: `2px solid ${scenarioAnswer.correct ? T.green : T.red}40`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: scenarioAnswer.correct ? T.green : T.red, marginBottom: 6 }}>{scenarioAnswer.correct ? "✓ Great thinking!" : "✗ Not quite — here's why:"}</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: T.textSecondary, fontWeight: 600 }}>{sc.explanation}</div>
              </div>
              <Btn onClick={advanceScenario} full color={scenarioAnswer.correct ? T.green : T.orange}>
                {scenarioState.current + 1 < scenarioState.scenarios.length ? "Next Scenario →" : "Finish"}
              </Btn>
            </div>
          )}
        </div>
      </Wrap>
    );
  }

  /* ── DAILY PRACTICE ── */
  if (screen === "daily" && dailyPractice) {
    const dp = dailyPractice;
    if (dp.current >= dp.questions.length) {
      const xpE = dp.score * 8;
      return (
        <Wrap>
          <Nav title="Daily Practice" onBack={() => { setDailyPractice(null); setScreen("home"); }} />
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>⚡</div>
            <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>Practice Complete!</h2>
            <p style={{ fontSize: 16, color: T.muted, fontWeight: 700, marginBottom: 4 }}>{dp.score}/{dp.questions.length} correct</p>
            <p style={{ color: T.purple, fontSize: 18, fontWeight: 900, marginBottom: 20 }}>+{xpE} XP</p>
            {dp.questions.map((q, i) => {
              const ok = dp.answers[i] === q.a;
              return (
                <div key={i} style={{ background: ok ? T.greenLight : T.redLight, border: `2px solid ${ok ? T.green : T.red}30`, borderRadius: 14, padding: "10px 14px", marginBottom: 6, textAlign: "left" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.muted }}>Ch {q.chNum}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 2 }}>{q.q}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ok ? T.green : T.red }}>
                    {ok ? "✓ " : "✗ "}{q.opts[dp.answers[i]]}
                    {!ok && <span style={{ color: T.greenDark }}> → {q.opts[q.a]}</span>}
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 20 }}>
              <Btn onClick={() => {
                const old = getLevel(gd.xp); const nx = gd.xp + xpE; const nl = getLevel(nx);
                const ns = gd.lastDate === today ? gd.streak : (gd.lastDate === yesterday ? gd.streak + 1 : 1);
                save({ ...gd, xp: nx, streak: ns, lastDate: today });
                if (nl.idx > old.idx) setTimeout(() => setShowLevelUp(nl), 300);
                setDailyPractice(null); setScreen("home");
              }} full color={T.purple}>Claim {xpE} XP</Btn>
            </div>
          </div>
        </Wrap>
      );
    }
    const q = dp.questions[dp.current];
    return (
      <Wrap>
        <Nav title="Daily Practice" onBack={() => { setDailyPractice(null); setScreen("home"); }} />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
            {dp.questions.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < dp.current ? T.purple : i === dp.current ? `${T.purple}50` : T.card, border: `2px solid ${i < dp.current ? T.purple : T.border}` }} />
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, marginBottom: 4 }}>From Ch {q.chNum}: {q.chTitle}</div>
          <h3 style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.5, marginBottom: 16 }}>{q.q}</h3>
          {q.opts.map((opt, i) => (
            <button key={i} onClick={() => setDailyPractice(prev => ({ ...prev, answers: [...prev.answers, i], score: prev.score + (i === q.a ? 1 : 0), current: prev.current + 1 }))} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", background: T.surface,
              border: `2px solid ${T.border}`, borderBottom: `4px solid ${T.border}`, borderRadius: 14,
              padding: "14px 16px", marginBottom: 8, cursor: "pointer", textAlign: "left", fontSize: 14,
              fontWeight: 700, color: T.text, fontFamily: font,
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: T.card, border: `2px solid ${T.border}`, fontSize: 13, fontWeight: 900, color: T.muted, flexShrink: 0 }}>{String.fromCharCode(65 + i)}</div>
              {opt}
            </button>
          ))}
        </div>
      </Wrap>
    );
  }

  /* ── GLOSSARY ── */
  if (screen === "glossary") {
    const filtered = glossaryQ.trim()
      ? REFERENCE.filter(e => e.term.toLowerCase().includes(glossaryQ.toLowerCase()) || e.def.toLowerCase().includes(glossaryQ.toLowerCase()) || e.cat.toLowerCase().includes(glossaryQ.toLowerCase()))
      : null;
    return (
      <Wrap>
        <Nav title="Glossary" onBack={() => { setScreen("home"); setGlossaryQ(""); }} />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <input ref={glossaryRef} type="text" placeholder="Search terms…" value={glossaryQ} onChange={e => setGlossaryQ(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", background: T.surface, border: `2px solid ${T.border}`, borderRadius: 14, padding: "13px 16px 13px 42px", fontSize: 15, color: T.text, outline: "none", fontFamily: font, fontWeight: 600 }}
              onFocus={e => e.target.style.borderColor = T.blue} onBlur={e => e.target.style.borderColor = T.border} />
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔍</span>
          </div>
          {filtered ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: T.muted, marginBottom: 12 }}>{filtered.length} RESULT{filtered.length !== 1 ? "S" : ""}</div>
              {filtered.map(e => (
                <button key={e.term} onClick={() => setExpandedTerm(expandedTerm === e.term ? null : e.term)} style={{ display: "block", width: "100%", background: T.surface, border: `2px solid ${expandedTerm === e.term ? T.blue + "40" : T.border}`, borderRadius: 14, padding: "12px 16px", marginBottom: 8, cursor: "pointer", textAlign: "left", fontFamily: font }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: T.blue, background: T.blueLight, padding: "3px 8px", borderRadius: 6 }}>{e.cat}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{e.term}</span>
                  </div>
                  {expandedTerm === e.term && <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, fontSize: 13, lineHeight: 1.7, color: T.textSecondary, fontWeight: 500 }}>{e.def}</div>}
                </button>
              ))}
            </div>
          ) : (
            <div>
              {[...new Set(REFERENCE.map(e => e.cat))].sort().map(cat => (
                <div key={cat} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: T.blue, letterSpacing: "0.08em", marginBottom: 8, paddingBottom: 6, borderBottom: `2px solid ${T.border}` }}>{cat}</div>
                  {REFERENCE.filter(e => e.cat === cat).map(e => (
                    <button key={e.term} onClick={() => setExpandedTerm(expandedTerm === e.term ? null : e.term)} style={{ display: "block", width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${T.border}40`, padding: "10px 0", cursor: "pointer", textAlign: "left", fontFamily: font }}>
                      <div style={{ fontSize: 14, color: T.text, fontWeight: expandedTerm === e.term ? 800 : 600 }}>{e.term}</div>
                      {expandedTerm === e.term && <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: T.textSecondary, fontWeight: 500 }}>{e.def}</div>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </Wrap>
    );
  }

  return null;
}
