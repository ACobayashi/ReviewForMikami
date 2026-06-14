const payload = window.REVIEW_DATA || { cards: [] };
const allCards = payload.cards || [];

const storage = {
  starred: new Set(JSON.parse(localStorage.getItem("historyReview.starred") || "[]")),
  status: JSON.parse(localStorage.getItem("historyReview.status") || "{}"),
};

const state = {
  type: "all",
  filter: "all",
  tag: "all",
  query: "",
  deck: allCards.map((_, index) => index),
  cursor: 0,
  revealed: false,
  listMode: false,
};

const typeLabels = {
  term: "名词解释",
  essay: "问答题",
};

const els = {
  totalStat: document.querySelector("#totalStat"),
  knownStat: document.querySelector("#knownStat"),
  starStat: document.querySelector("#starStat"),
  dailyBtn: document.querySelector("#dailyBtn"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  searchInput: document.querySelector("#searchInput"),
  tagCloud: document.querySelector("#tagCloud"),
  deckTitle: document.querySelector("#deckTitle"),
  cardViewBtn: document.querySelector("#cardViewBtn"),
  listViewBtn: document.querySelector("#listViewBtn"),
  cardView: document.querySelector("#cardView"),
  listView: document.querySelector("#listView"),
  cardType: document.querySelector("#cardType"),
  starBtn: document.querySelector("#starBtn"),
  cardPrompt: document.querySelector("#cardPrompt"),
  cardSection: document.querySelector("#cardSection"),
  answerBox: document.querySelector("#answerBox"),
  cardAnswer: document.querySelector("#cardAnswer"),
  revealBtn: document.querySelector("#revealBtn"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  againBtn: document.querySelector("#againBtn"),
  knownBtn: document.querySelector("#knownBtn"),
  positionStat: document.querySelector("#positionStat"),
  sourceStat: document.querySelector("#sourceStat"),
  listCount: document.querySelector("#listCount"),
  cardList: document.querySelector("#cardList"),
  resetProgressBtn: document.querySelector("#resetProgressBtn"),
};

function persist() {
  localStorage.setItem("historyReview.starred", JSON.stringify([...storage.starred]));
  localStorage.setItem("historyReview.status", JSON.stringify(storage.status));
}

function uniqueTags() {
  const tags = new Set();
  allCards.forEach((card) => card.tags.forEach((tag) => {
    if (tag !== "名词" && tag !== "论述") tags.add(tag);
  }));
  return [...tags];
}

function setupTypeButtons() {
  document.querySelectorAll("[data-type]").forEach((button) => {
    const type = button.dataset.type;
    const count = type === "all"
      ? allCards.length
      : allCards.filter((card) => card.type === type).length;

    button.textContent = `${button.textContent.replace(/\s*\d+$/, "")} ${count}`;
    if (type !== "all" && count === 0) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    }
  });
}

function cardMatches(card) {
  if (state.type !== "all" && card.type !== state.type) return false;
  if (state.tag !== "all" && !card.tags.includes(state.tag)) return false;
  if (state.filter === "starred" && !storage.starred.has(card.id)) return false;
  if (state.filter === "known" && storage.status[card.id] !== "known") return false;
  if (state.filter === "learning" && storage.status[card.id] === "known") return false;

  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  const haystack = [card.title, card.prompt, card.answer, card.section, card.source, ...card.tags]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function rebuildDeck(keepCardId = null) {
  state.deck = allCards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => cardMatches(card))
    .map(({ index }) => index);

  if (keepCardId) {
    const nextIndex = state.deck.findIndex((index) => allCards[index].id === keepCardId);
    state.cursor = nextIndex >= 0 ? nextIndex : 0;
  } else {
    state.cursor = Math.min(state.cursor, Math.max(state.deck.length - 1, 0));
  }
  state.revealed = false;
  render();
}

function currentCard() {
  if (!state.deck.length) return null;
  return allCards[state.deck[state.cursor]];
}

function formatAnswer(answer) {
  return answer
    .split(/\n+/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function statusLabel(card) {
  const status = storage.status[card.id];
  if (status === "known") return "已掌握";
  if (status === "again") return "待巩固";
  return "未标记";
}

function deckName() {
  const names = [];
  if (state.type === "term") names.push(typeLabels.term);
  if (state.type === "essay") names.push(typeLabels.essay);
  if (state.filter === "learning") names.push("待巩固");
  if (state.filter === "known") names.push("已掌握");
  if (state.filter === "starred") names.push("收藏");
  if (state.tag !== "all") names.push(state.tag);
  if (state.query) names.push(`“${state.query}”`);
  return names.length ? names.join(" · ") : "全部题库";
}

function renderStats() {
  const known = allCards.filter((card) => storage.status[card.id] === "known").length;
  els.totalStat.textContent = `${allCards.length} 题`;
  els.knownStat.textContent = `${known} 已掌握`;
  els.starStat.textContent = `${storage.starred.size} 收藏`;
}

function renderTags() {
  els.tagCloud.innerHTML = "";
  const allButton = makeTagButton("all", "全部专题");
  els.tagCloud.append(allButton);
  uniqueTags().forEach((tag) => els.tagCloud.append(makeTagButton(tag, tag)));
}

function makeTagButton(tag, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tag-button${state.tag === tag ? " is-active" : ""}`;
  button.textContent = label;
  button.addEventListener("click", () => {
    state.tag = tag;
    rebuildDeck(currentCard()?.id);
    renderTags();
  });
  return button;
}

function renderCard() {
  const card = currentCard();
  els.deckTitle.textContent = deckName();

  if (!card) {
    els.cardType.textContent = "空";
    els.cardPrompt.textContent = "没有匹配的题目";
    els.cardSection.textContent = "换一个筛选条件试试";
    els.answerBox.hidden = true;
    els.revealBtn.hidden = true;
    els.positionStat.textContent = "0 / 0";
    els.sourceStat.textContent = "";
    els.starBtn.classList.remove("is-starred");
    els.starBtn.textContent = "☆";
    return;
  }

  els.revealBtn.hidden = false;
  els.cardType.textContent = typeLabels[card.type] || "问答题";
  els.cardPrompt.textContent = card.prompt;
  els.cardSection.textContent = card.section;
  els.cardAnswer.innerHTML = formatAnswer(card.answer);
  els.answerBox.hidden = !state.revealed;
  els.revealBtn.textContent = state.revealed ? "收起答案" : "显示答案";
  els.positionStat.textContent = `${state.cursor + 1} / ${state.deck.length} · ${statusLabel(card)}`;
  els.sourceStat.textContent = card.source;
  els.starBtn.classList.toggle("is-starred", storage.starred.has(card.id));
  els.starBtn.textContent = storage.starred.has(card.id) ? "★" : "☆";
}

function renderList() {
  els.listCount.textContent = `${state.deck.length} 条`;
  els.cardList.innerHTML = "";

  if (!state.deck.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "没有匹配的题目";
    els.cardList.append(empty);
    return;
  }

  state.deck.forEach((cardIndex, deckIndex) => {
    const card = allCards[cardIndex];
    const item = document.createElement("button");
    item.type = "button";
    item.className = "list-item";
    item.innerHTML = `
      <span>
        <strong>${escapeHtml(card.title)}</strong>
        <span>${escapeHtml(card.section)} · ${escapeHtml(statusLabel(card))}</span>
      </span>
      <span class="badge ${card.type === "term" ? "badge--term" : ""}">${card.type === "term" ? "名词" : "问答"}</span>
    `;
    item.addEventListener("click", () => {
      state.cursor = deckIndex;
      state.listMode = false;
      state.revealed = false;
      render();
    });
    els.cardList.append(item);
  });
}

function renderViewMode() {
  els.cardView.hidden = state.listMode;
  els.listView.hidden = !state.listMode;
  els.cardViewBtn.classList.toggle("is-active", !state.listMode);
  els.listViewBtn.classList.toggle("is-active", state.listMode);
}

function render() {
  renderStats();
  renderViewMode();
  renderCard();
  renderList();
}

function moveCursor(delta) {
  if (!state.deck.length) return;
  state.cursor = (state.cursor + delta + state.deck.length) % state.deck.length;
  state.revealed = false;
  render();
}

function shuffleDeck(limit = null) {
  const activeId = currentCard()?.id;
  const pool = allCards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => cardMatches(card))
    .map(({ index }) => index);

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  state.deck = limit ? pool.slice(0, limit) : pool;
  state.cursor = Math.max(0, state.deck.findIndex((index) => allCards[index].id === activeId));
  if (state.cursor < 0) state.cursor = 0;
  state.revealed = false;
  render();
}

function markStatus(status) {
  const card = currentCard();
  if (!card) return;
  storage.status[card.id] = status;
  persist();
  render();
}

function setupEvents() {
  document.querySelectorAll("[data-type]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      document.querySelectorAll("[data-type]").forEach((el) => el.classList.remove("is-active"));
      button.classList.add("is-active");
      state.type = button.dataset.type;
      rebuildDeck();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((el) => el.classList.remove("is-active"));
      button.classList.add("is-active");
      state.filter = button.dataset.filter;
      rebuildDeck();
    });
  });

  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    rebuildDeck(currentCard()?.id);
  });

  els.revealBtn.addEventListener("click", () => {
    state.revealed = !state.revealed;
    render();
  });
  els.prevBtn.addEventListener("click", () => moveCursor(-1));
  els.nextBtn.addEventListener("click", () => moveCursor(1));
  els.shuffleBtn.addEventListener("click", () => shuffleDeck());
  els.dailyBtn.addEventListener("click", () => shuffleDeck(20));
  els.againBtn.addEventListener("click", () => markStatus("again"));
  els.knownBtn.addEventListener("click", () => markStatus("known"));
  els.cardViewBtn.addEventListener("click", () => {
    state.listMode = false;
    render();
  });
  els.listViewBtn.addEventListener("click", () => {
    state.listMode = true;
    render();
  });
  els.starBtn.addEventListener("click", () => {
    const card = currentCard();
    if (!card) return;
    if (storage.starred.has(card.id)) storage.starred.delete(card.id);
    else storage.starred.add(card.id);
    persist();
    render();
  });
  els.resetProgressBtn.addEventListener("click", () => {
    localStorage.removeItem("historyReview.starred");
    localStorage.removeItem("historyReview.status");
    storage.starred.clear();
    storage.status = {};
    rebuildDeck();
  });

  let startX = null;
  els.cardView.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
  });
  els.cardView.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const distance = event.clientX - startX;
    startX = null;
    if (Math.abs(distance) > 70) moveCursor(distance > 0 ? -1 : 1);
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input")) return;
    if (event.key === "ArrowLeft") moveCursor(-1);
    if (event.key === "ArrowRight") moveCursor(1);
    if (event.key === " ") {
      event.preventDefault();
      state.revealed = !state.revealed;
      render();
    }
  });
}

setupTypeButtons();
renderTags();
setupEvents();
rebuildDeck();
