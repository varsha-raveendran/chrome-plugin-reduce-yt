function pnNormalizeTitle(title) {
  // Lowercase, strip punctuation, collapse whitespace.
  return String(title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pnScoreTitle(t, rules) {
  // rules: array of { re: RegExp, w: number }
  let score = 0;
  for (const r of rules) {
    if (r.re.test(t)) score += r.w;
  }
  return score;
}

function pnCategorizeTitle(title) {
  const t = pnNormalizeTitle(title);
  if (!t) return "Entertainment";

  // Title-only heuristics: score-based so it works without exact category words.
  // These are intentionally broad, but weighted to reduce false positives.
  const TECH = [
    { re: /\b(tutorial|guide|walkthrough|explained|deep dive|crash course|course|lecture)\b/, w: 3 },
    { re: /\b(how to|step by step|beginner|advanced)\b/, w: 2 },
    { re: /\b(code|coding|program|programming|developer|dev)\b/, w: 3 },
    { re: /\b(debug|bug|fix|error|performance|optimi[sz]e)\b/, w: 2 },
    { re: /\b(api|rest|graphql|backend|frontend|fullstack|database|sql|nosql)\b/, w: 2 },
    { re: /\b(system design|architecture|distributed|scalab(le|ility))\b/, w: 3 },
    { re: /\b(javascript|typescript|python|java|golang|go\b|rust|c\+\+|c#|php|ruby)\b/, w: 3 },
    { re: /\b(react|nextjs|next|node|express|django|flask|spring|dotnet)\b/, w: 2 },
    { re: /\b(docker|kubernetes|k8s|aws|gcp|azure|terraform|git|linux)\b/, w: 2 },
    { re: /\b(interview|leetcode|dsa|algorithm|data structure)\b/, w: 2 }
  ];

  const TRAVEL = [
    { re: /\b(travel|trip|itinerary|vacation|holiday|journey)\b/, w: 3 },
    { re: /\b(vlog|day \d+|weekend|tour|walking tour|walk)\b/, w: 2 },
    { re: /\b(airport|flight|train|metro|bus|ferry|road trip)\b/, w: 3 },
    { re: /\b(hotel|hostel|airbnb|resort)\b/, w: 2 },
    { re: /\b(things to do in|where to eat|food tour|street food)\b/, w: 3 },
    { re: /\b(beach|mountain|hike|trek|national park)\b/, w: 2 }
  ];

  const HOBBY = [
    { re: /\b(recipe|cook|cooking|bake|baking|meal prep)\b/, w: 3 },
    { re: /\b(workout|yoga|pilates|gym|run|running|marathon|hiit)\b/, w: 3 },
    { re: /\b(game|gaming|gameplay|speedrun|walkthrough)\b/, w: 2 },
    { re: /\b(minecraft|valorant|fortnite|zelda|pokemon|roblox)\b/, w: 2 },
    { re: /\b(music|guitar|piano|drums|sing|cover|song)\b/, w: 3 },
    { re: /\b(drawing|painting|sketch|art|illustration)\b/, w: 3 },
    { re: /\b(photography|camera|lens|editing|lightroom|photoshop)\b/, w: 2 },
    { re: /\b(garden|gardening|plants|houseplants)\b/, w: 2 },
    { re: /\b(chess|puzzle|rubik)\b/, w: 2 }
  ];

  const FINANCE = [
    { re: /\b(invest|investing|investment|investor)\b/, w: 3 },
    { re: /\b(stock|stocks|market|trading|trader|portfolio)\b/, w: 3 },
    { re: /\b(crypto|bitcoin|ethereum|nft|defi|blockchain)\b/, w: 3 },
    { re: /\b(budget|budgeting|personal finance|financial|money)\b/, w: 2 },
    { re: /\b(retire|retirement|passive income|net worth|wealth)\b/, w: 3 },
    { re: /\b(etf|index fund|dividend|compound interest|401k|roth)\b/, w: 3 },
    { re: /\b(debt|loan|mortgage|credit|saving|savings)\b/, w: 2 }
  ];

  const NEWS = [
    { re: /\b(news|breaking|update|latest|today|happening)\b/, w: 2 },
    { re: /\b(politics|political|election|government|president|congress|senate)\b/, w: 3 },
    { re: /\b(war|conflict|crisis|protest|climate|policy)\b/, w: 2 },
    { re: /\b(world|global|international|geopolit)\b/, w: 2 },
    { re: /\b(economy|economic|inflation|recession|gdp)\b/, w: 2 },
    { re: /\b(interview|press conference|debate|speech|explained)\b/, w: 1 }
  ];

  const techScore    = pnScoreTitle(t, TECH);
  const travelScore  = pnScoreTitle(t, TRAVEL);
  const hobbyScore   = pnScoreTitle(t, HOBBY);
  const financeScore = pnScoreTitle(t, FINANCE);
  const newsScore    = pnScoreTitle(t, NEWS);

  // Tie-breakers: some keywords overlap (e.g., "walkthrough" gaming vs tutorial).
  // If "game/gameplay" appears, bias toward hobby unless strong tech indicators exist.
  const hasGame = /\b(game|gaming|gameplay|minecraft|valorant|fortnite)\b/.test(t);
  const hasCode = /\b(code|coding|program|programming|api|javascript|python|react|node|sql)\b/.test(t);
  if (hasGame && !hasCode) return "hobby";

  const best = Math.max(techScore, travelScore, hobbyScore, financeScore, newsScore);
  if (best <= 0) return "entertainment?";
  if (best === techScore)    return "technical";
  if (best === travelScore)  return "travel";
  if (best === financeScore) return "finance";
  if (best === newsScore)    return "news";
  return "hobby";
}

function pnFunMessage(category, fmtDuration, ms) {
  const time = fmtDuration(ms || 0);
  switch (category) {
    case "technical":
      return `Nice. You invested ${time} in learning mode.`;
    case "hobby":
      return `Wholesome. ${time} on hobbies—future you will approve.`;
    case "travel":
      return `Mentally abroad for ${time}. Passport: imaginary (for now).`;
    case "finance":
      return `${time} thinking about money. Now go do something with it.`;
    case "news":
      return `${time} staying informed. Or spiraling. Hard to tell.`;
    case "Entertainment":
    default:
      return `WTH! You spent ${time} on this!`;
  }
}

window.PN_Categorize = {
  normalizeTitle: pnNormalizeTitle,
  categorizeTitle: pnCategorizeTitle,
  funMessage: pnFunMessage
};

