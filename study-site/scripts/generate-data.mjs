import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sourcePath = resolve(root, "嵌门永存.txt");
const outPath = resolve(root, "study-site/data.js");

const raw = readFileSync(sourcePath, "utf8")
  .replace(/\f/g, "\n")
  .replace(/\r/g, "")
  .replace(/[ \t]+\n/g, "\n");

const compact = (value) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stripSectionNoise = (value) =>
  value
    .replace(/\n?\s*\d+\s+(?:第[一二三四五六七八九十]+章|OnAndroid|OnARM|ARM)\s*$/g, "")
    .replace(/\n?\s*[二三四五]、[^\n]+资料\s*$/g, "");

const lineCompact = (value) => stripSectionNoise(compact(value)).replace(/\n+/g, " ");

const sectionOf = (index) => {
  const before = raw.slice(0, index);
  const matches = [...before.matchAll(/^\s*(\d+)\s+([^\n]+)$/gm)];
  const last = matches.at(-1);
  if (!last) return "基础概念";
  return `${last[1]} ${last[2].trim()}`;
};

const conceptSlice = raw.slice(0, raw.indexOf("一、单选题&多选题资料"));
const conceptMatches = [
  ...conceptSlice.matchAll(/^\s*(\d+)\s+([^\n]+)\n([\s\S]*?)(?=^\s*\d+\s+[^\n]+\n|恭喜你成功入门嵌入式了！)/gm),
];
const concepts = conceptMatches.map((match) => ({
  id: `concept-${match[1]}`,
  title: lineCompact(match[2]),
  answer: compact(match[3]),
  tags: ["基础概念"],
}));

const objectiveSlice = raw.slice(
  raw.indexOf("一、单选题&多选题资料"),
  raw.indexOf("二、简答题资料"),
);
const objectiveMatches = [
  ...objectiveSlice.matchAll(/【([^】]+)】([\s\S]*?)(?=【[^】]+】|\n\s*二、简答题资料|$)/g),
];

const objective = objectiveMatches
  .map((match, idx) => {
    const type = lineCompact(match[1]);
    const body = match[2].replace(/\n\s*\n/g, "\n").trim();
    const firstOptionIndex = body.search(/(?:^|\n)\s*A[\s.．、]/);
    if (firstOptionIndex === -1) return null;

    let promptPart = body.slice(0, firstOptionIndex).trim();
    const optionPart = body.slice(firstOptionIndex).trim();
    const answerMatch = promptPart.match(/([A-D]{1,4})\s*$/);
    if (!answerMatch) return null;
    const answer = [...answerMatch[1]];
    promptPart = promptPart.slice(0, answerMatch.index).replace(/[：:，,、\s]+$/g, "");

    const options = [];
    const optionMatches = [...optionPart.matchAll(/(?:^|\n)\s*([A-D])[\s.．、]+([\s\S]*?)(?=(?:\n\s*[A-D][\s.．、]+)|$)/g)];
    for (const option of optionMatches) {
      options.push({
        key: option[1],
        text: lineCompact(stripSectionNoise(option[2])),
      });
    }

    return {
      id: `choice-${idx + 1}`,
      type,
      chapter: sectionOf(raw.indexOf(match[0])),
      prompt: lineCompact(promptPart),
      options,
      answer,
      tags: [type, sectionOf(raw.indexOf(match[0])).replace(/^\d+\s*/, "")],
    };
  })
  .filter(Boolean);

const longSlice = raw.slice(raw.indexOf("二、简答题资料"));
const bigSectionPattern = /^\s*([二三四五]、[^\n]+)$/gm;
const bigSections = [...longSlice.matchAll(bigSectionPattern)].map((match) => ({
  title: lineCompact(match[1]),
  index: match.index,
}));

function bigSectionFor(localIndex) {
  const current = bigSections.filter((section) => section.index <= localIndex).at(-1);
  return current?.title ?? "二、简答题资料";
}

function isQuestionStart(line, previousLine) {
  const text = line.trim();
  if (/^【[^】]+关联题】/.test(text)) return true;
  if (!/^\d+\./.test(text)) return false;
  if (!/[？?]/.test(text) && !/(简述|说明|解释|论述|理解|讨论|综述|给出|说出|总结|结合|依据|按照)/.test(text)) {
    return false;
  }
  if (/^\d+\.\s*(硬件|软件|认知局限|隐藏缺陷|不断变化|复杂互动)[:：]/.test(text)) return false;
  if (previousLine && /^[A-Z]、|^【/.test(text)) return false;
  return true;
}

const lines = longSlice.split("\n");
const qaBlocks = [];
let current = null;
let cursor = 0;
let readingPrompt = false;

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const previous = lines[i - 1]?.trim() ?? "";
  const trimmed = line.trim();
  const localIndex = cursor;
  cursor += line.length + 1;

  if (isQuestionStart(line, previous)) {
    if (current) qaBlocks.push(current);
    current = {
      question: trimmed,
      answerLines: [],
      section: bigSectionFor(localIndex),
    };
    readingPrompt = true;
    continue;
  }

  if (current) {
    if (readingPrompt) {
      if (!trimmed) {
        readingPrompt = false;
        continue;
      }
      if (!/^\s*(?:\d+\s+[^\n]+|[二三四五]、[^\n]+资料)\s*$/.test(line)) {
        current.question = `${current.question}${trimmed}`;
        continue;
      }
      readingPrompt = false;
    }
    current.answerLines.push(line);
  }
}
if (current) qaBlocks.push(current);

const qa = qaBlocks
  .map((block, idx) => ({
    id: `qa-${idx + 1}`,
    section: block.section,
    prompt: lineCompact(stripSectionNoise(block.question)),
    answer: compact(stripSectionNoise(block.answerLines.join("\n"))),
    tags: [block.section.replace(/^[二三四五]、/, "")],
  }))
  .filter((item) => item.prompt.length > 6 && item.answer.length > 20);

const knowledge = [
  ...concepts.map((item) => ({
    id: item.id,
    kind: "concept",
    title: item.title,
    body: item.answer,
    tags: item.tags,
  })),
  ...qa.slice(0, 24).map((item) => ({
    id: `knowledge-${item.id}`,
    kind: "qa",
    title: item.prompt,
    body: item.answer,
    tags: item.tags,
  })),
];

const data = {
  meta: {
    title: "嵌门永存",
    source: "嵌门永存.pdf",
    generatedAt: new Date().toISOString(),
    counts: {
      objective: objective.length,
      concepts: concepts.length,
      qa: qa.length,
      knowledge: knowledge.length,
    },
  },
  objective,
  concepts,
  qa,
  knowledge,
};

writeFileSync(
  outPath,
  `window.EMBED_STUDY_DATA = ${JSON.stringify(data, null, 2)};\n`,
  "utf8",
);

console.log(`Generated ${outPath}`);
console.log(data.meta.counts);
