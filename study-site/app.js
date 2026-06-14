const data = window.EMBED_STUDY_DATA;
const storeKey = "embed-study-v1";

const $ = (selector) => document.querySelector(selector);
const els = {
  card: $("#studyCard"),
  tabs: [...document.querySelectorAll(".tab")],
  search: $("#searchInput"),
  chapter: $("#chapterSelect"),
  shuffle: $("#shuffleBtn"),
  deckCount: $("#deckCount"),
  statDone: $("#statDone"),
  statRate: $("#statRate"),
  statStreak: $("#statStreak"),
  progressPercent: $("#progressPercent"),
  progressRing: document.querySelector(".progress-ring"),
};

const defaultState = {
  mode: "choice",
  query: "",
  chapter: "all",
  active: null,
  stats: {
    done: 0,
    correct: 0,
    streak: 0,
    mastered: {},
    mistakes: {},
  },
};

let state = loadState();

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(storeKey) || "{}") };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function includesQuery(item, query) {
  if (!query) return true;
  const haystack = normalize([
    item.prompt,
    item.title,
    item.answer,
    item.chapter,
    item.section,
    ...(item.tags || []),
    ...(item.options || []).map((option) => option.text).join(" "),
  ].join(" "));
  return haystack.includes(normalize(query));
}

function chapterOf(item) {
  return item.chapter || item.section || item.tags?.[0] || "未分组";
}

function baseDeck(mode = state.mode) {
  if (mode === "choice" || mode === "judge") return data.objective;
  if (mode === "qa") return data.qa;
  if (mode === "cards") return data.knowledge;
  if (mode === "mistakes") {
    const ids = new Set(Object.keys(state.stats.mistakes));
    return [...data.objective, ...data.qa, ...data.knowledge].filter((item) => ids.has(item.id));
  }
  return data.objective;
}

function filteredDeck(mode = state.mode) {
  return baseDeck(mode).filter((item) => {
    const chapterMatch = state.chapter === "all" || chapterOf(item) === state.chapter || item.tags?.includes(state.chapter);
    return chapterMatch && includesQuery(item, state.query);
  });
}

function buildChapterOptions() {
  const chapters = new Set();
  [...data.objective, ...data.qa, ...data.knowledge].forEach((item) => chapters.add(chapterOf(item)));
  els.chapter.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "全部资料";
  els.chapter.append(all);
  [...chapters].sort((a, b) => a.localeCompare(b, "zh-CN")).forEach((chapter) => {
    const option = document.createElement("option");
    option.value = chapter;
    option.textContent = chapter;
    els.chapter.append(option);
  });
  els.chapter.value = state.chapter;
}

function makeActive(item) {
  if (!item) return null;
  if (state.mode === "choice" || state.mode === "mistakes") {
    return {
      id: item.id,
      order: item.options.map((option) => option.key),
      selected: [],
      answered: false,
      correct: null,
    };
  }
  if (state.mode === "judge") {
    const option = shuffle(item.options)[0];
    return {
      id: item.id,
      judgeKey: option.key,
      answered: false,
      correct: null,
    };
  }
  return {
    id: item.id,
    revealed: false,
    draft: "",
  };
}

function pickNext() {
  const deck = filteredDeck();
  if (!deck.length) {
    state.active = null;
    render();
    return;
  }
  state.active = makeActive(shuffle(deck)[0]);
  saveState();
  render();
}

function getActiveItem() {
  if (!state.active) return null;
  return filteredDeck().find((item) => item.id === state.active.id) || null;
}

function ensureActive() {
  const item = getActiveItem();
  if (item) return item;
  const deck = filteredDeck();
  state.active = deck.length ? makeActive(shuffle(deck)[0]) : null;
  return getActiveItem();
}

function updateStats() {
  const done = state.stats.done;
  const rate = done ? Math.round((state.stats.correct / done) * 100) : 0;
  const masteredCount = Object.keys(state.stats.mastered).length;
  const total = data.objective.length + data.qa.length + data.knowledge.length;
  const progress = total ? Math.min(100, Math.round((masteredCount / total) * 100)) : 0;

  els.statDone.textContent = done;
  els.statRate.textContent = `${rate}%`;
  els.statStreak.textContent = state.stats.streak;
  els.progressPercent.textContent = `${progress}%`;
  els.progressRing.style.setProperty("--progress", `${progress}%`);
  els.deckCount.textContent = `${filteredDeck().length} 题`;
}

function markResult(item, isCorrect) {
  state.stats.done += 1;
  if (isCorrect) {
    state.stats.correct += 1;
    state.stats.streak += 1;
    state.stats.mastered[item.id] = Date.now();
    delete state.stats.mistakes[item.id];
  } else {
    state.stats.streak = 0;
    state.stats.mistakes[item.id] = {
      at: Date.now(),
      prompt: item.prompt,
      answer: item.answer.join(""),
    };
  }
  saveState();
  updateStats();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metaRow(item, extra = []) {
  const row = el("div", "card-meta");
  [chapterOf(item), ...(item.tags || []), ...extra].filter(Boolean).forEach((text, index) => {
    row.append(el("span", `pill ${index === 0 ? "hot" : ""}`, text));
  });
  return row;
}

function answerText(item) {
  return item.answer.map((key) => {
    const option = item.options.find((candidate) => candidate.key === key);
    return `${key}. ${option?.text || ""}`;
  }).join("\n");
}

function renderChoice() {
  const item = ensureActive();
  if (!item) return renderEmpty();
  const active = state.active;
  const selected = new Set(active.selected);
  const answer = new Set(item.answer);
  const isMulti = item.answer.length > 1;
  const ordered = item.options;

  els.card.innerHTML = "";
  els.card.append(metaRow(item, [isMulti ? "可多选" : "单选", active.answered ? "已作答" : "原题顺序"]));
  els.card.append(el("h2", "prompt", item.prompt));

  const list = el("div", "option-list");
  ordered.forEach((option, index) => {
    const button = el("button", "option", undefined);
    button.type = "button";
    button.dataset.key = option.key;
    if (selected.has(option.key)) button.classList.add("selected");
    if (active.answered && answer.has(option.key)) button.classList.add("correct");
    if (active.answered && selected.has(option.key) && !answer.has(option.key)) button.classList.add("wrong");
    button.append(el("span", "option-key", option.key));
    button.append(el("span", "", option.text));
    button.addEventListener("click", () => {
      if (active.answered) return;
      if (isMulti) {
        selected.has(option.key) ? selected.delete(option.key) : selected.add(option.key);
      } else {
        selected.clear();
        selected.add(option.key);
      }
      active.selected = [...selected];
      saveState();
      renderChoice();
    });
    list.append(button);
  });
  els.card.append(list);

  if (active.answered) {
    const feedback = el("div", "feedback");
    feedback.textContent = active.correct ? "答对了。这个点可以往后放一放。" : `这题要再看一眼。正确答案：${answerText(item).replace(/\n/g, "；")}`;
    els.card.append(feedback);
    const answer = el("div", "answer-block", answerText(item));
    els.card.append(answer);
  }

  const actions = el("div", "actions");
  const submit = el("button", "primary", active.answered ? "下一题" : "提交");
  submit.type = "button";
  submit.addEventListener("click", () => {
    if (active.answered) {
      pickNext();
      return;
    }
    const chosen = [...selected].sort().join("");
    const right = [...answer].sort().join("");
    active.answered = true;
    active.correct = chosen === right;
    markResult(item, active.correct);
    renderChoice();
  });
  const next = el("button", "secondary", "跳过");
  next.type = "button";
  next.addEventListener("click", pickNext);
  actions.append(submit, next);
  els.card.append(actions);
}

function renderJudge() {
  const item = ensureActive();
  if (!item) return renderEmpty();
  const active = state.active;
  const option = item.options.find((candidate) => candidate.key === active.judgeKey);
  const correctTruth = item.answer.includes(active.judgeKey);

  els.card.innerHTML = "";
  els.card.append(metaRow(item, ["由选择题变形"]));
  els.card.append(el("h2", "prompt", item.prompt));
  const statement = el("div", "answer-block");
  statement.textContent = `判断该说法是否为正确答案：\n${option.text}`;
  els.card.append(statement);

  if (active.answered) {
    const feedback = el("div", "feedback");
    feedback.textContent = active.correct
      ? "判断正确。"
      : `判断错了。这个说法实际为「${correctTruth ? "正确" : "错误"}」。`;
    els.card.append(feedback);
  }

  const grid = el("div", "judge-grid");
  [
    ["true", "正确"],
    ["false", "错误"],
  ].forEach(([value, label]) => {
    const button = el("button", `judge-button ${value}`, label);
    button.type = "button";
    button.disabled = active.answered;
    button.addEventListener("click", () => {
      const userTruth = value === "true";
      active.answered = true;
      active.correct = userTruth === correctTruth;
      markResult(item, active.correct);
      saveState();
      renderJudge();
    });
    grid.append(button);
  });
  els.card.append(grid);

  const actions = el("div", "actions");
  const next = el("button", "secondary", "下一题");
  next.type = "button";
  next.addEventListener("click", pickNext);
  actions.append(next);
  els.card.append(actions);
}

function keywords(answer) {
  const stop = new Set(["以及", "可以", "系统", "进行", "通过", "需要", "说明", "其中", "具有", "一个", "主要"]);
  return [...new Set(answer.split(/[，。；：、\s\n（）()《》“”"'.]+/))]
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && word.length <= 16 && !stop.has(word))
    .slice(0, 12);
}

function renderQa() {
  const item = ensureActive();
  if (!item) return renderEmpty();
  const active = state.active;

  els.card.innerHTML = "";
  els.card.append(metaRow(item, ["默写后自查"]));
  els.card.append(el("h2", "prompt", item.prompt));

  const textarea = el("textarea", "writebox");
  textarea.placeholder = "先默写要点，再点“看答案”。碎片时间里能写出关键词就算赚到。";
  textarea.value = active.draft || "";
  textarea.addEventListener("input", () => {
    active.draft = textarea.value;
    saveState();
  });
  els.card.append(textarea);

  const keyRow = el("div", "keyword-row");
  keywords(item.answer).forEach((word) => keyRow.append(el("span", "keyword", word)));
  els.card.append(keyRow);

  if (active.revealed) {
    els.card.append(el("div", "answer-block", item.answer));
  }

  const actions = el("div", "actions");
  const reveal = el("button", "primary", active.revealed ? "收起答案" : "看答案");
  reveal.type = "button";
  reveal.addEventListener("click", () => {
    active.revealed = !active.revealed;
    saveState();
    renderQa();
  });
  const known = el("button", "secondary", "我会了");
  known.type = "button";
  known.addEventListener("click", () => {
    markResult(item, true);
    pickNext();
  });
  const weak = el("button", "secondary", "加入待背");
  weak.type = "button";
  weak.addEventListener("click", () => {
    state.stats.mistakes[item.id] = { at: Date.now(), prompt: item.prompt, answer: "简答待背" };
    state.stats.streak = 0;
    saveState();
    pickNext();
  });
  actions.append(reveal, known, weak);
  els.card.append(actions);
}

function renderCards() {
  const item = ensureActive();
  if (!item) return renderEmpty();
  const active = state.active;

  els.card.innerHTML = "";
  els.card.append(metaRow(item, [item.kind === "concept" ? "基础概念" : "问答卡"]));
  els.card.append(el("h2", "prompt", item.title));
  if (active.revealed) {
    els.card.append(el("div", "answer-block", item.body));
  } else {
    const hint = el("div", "feedback");
    hint.textContent = "先在脑子里过一遍定义、关键词和例子，再翻面。";
    els.card.append(hint);
  }

  const actions = el("div", "actions");
  const flip = el("button", "primary", active.revealed ? "隐藏" : "翻面");
  flip.type = "button";
  flip.addEventListener("click", () => {
    active.revealed = !active.revealed;
    saveState();
    renderCards();
  });
  const mastered = el("button", "secondary", "记住了");
  mastered.type = "button";
  mastered.addEventListener("click", () => {
    markResult(item, true);
    pickNext();
  });
  const next = el("button", "secondary", "下一张");
  next.type = "button";
  next.addEventListener("click", pickNext);
  actions.append(flip, mastered, next);
  els.card.append(actions);
}

function renderMistakes() {
  const deck = filteredDeck("mistakes");
  els.card.innerHTML = "";
  els.card.append(metaRow({ section: "错题本", tags: [`${deck.length} 道`] }));
  els.card.append(el("h2", "prompt", "错题复盘"));

  if (!deck.length) {
    const empty = el("div", "feedback");
    empty.textContent = "目前没有错题。继续刷几轮，这里会自动收集薄弱点。";
    els.card.append(empty);
    return;
  }

  const list = el("div", "mistake-list");
  deck.slice(0, 20).forEach((item) => {
    const row = el("article", "mistake-item");
    row.append(el("h3", "", item.prompt || item.title));
    const stored = state.stats.mistakes[item.id];
    const answer = Array.isArray(item.answer) ? item.answer.join("、") : stored?.answer || "待复习";
    row.append(el("p", "", `答案：${answer}｜${chapterOf(item)}`));
    const practice = el("button", "secondary", "练这题");
    practice.type = "button";
    practice.addEventListener("click", () => {
      state.mode = item.options ? "choice" : item.body ? "cards" : "qa";
      setActiveTab();
      state.active = makeActive(item);
      saveState();
      render();
    });
    row.append(practice);
    list.append(row);
  });
  els.card.append(list);
}

function renderEmpty() {
  const template = $("#emptyTemplate");
  els.card.innerHTML = "";
  els.card.append(template.content.cloneNode(true));
}

function setActiveTab() {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === state.mode));
}

function render() {
  setActiveTab();
  els.search.value = state.query;
  els.chapter.value = state.chapter;
  updateStats();

  if (state.mode === "choice" || state.mode === "mistakes") {
    if (state.mode === "mistakes") return renderMistakes();
    return renderChoice();
  }
  if (state.mode === "judge") return renderJudge();
  if (state.mode === "qa") return renderQa();
  if (state.mode === "cards") return renderCards();
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.mode = tab.dataset.mode;
    state.active = null;
    saveState();
    render();
  });
});

els.search.addEventListener("input", () => {
  state.query = els.search.value;
  state.active = null;
  saveState();
  render();
});

els.chapter.addEventListener("change", () => {
  state.chapter = els.chapter.value;
  state.active = null;
  saveState();
  render();
});

els.shuffle.addEventListener("click", pickNext);

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.jump;
    state.active = null;
    saveState();
    render();
  });
});

buildChapterOptions();
render();
