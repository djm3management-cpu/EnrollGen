const OHB_BASE =
  "https://cdn.jsdelivr.net/npm/@metaxia/scriptures-source-openscriptures-ohb@2.0.0/data/openscriptures-OHB";
const TR_BASE =
  "https://cdn.jsdelivr.net/npm/@metaxia/scriptures-source-stepbible-tagnt-tr@2.0.0/data/stepbible-tagnt-tr";
const KJV_STRONGS_BASE = "https://bibleengine.org/v1/kjv";
const STRONGS_LEXICON_BASE = "https://bibleengine.org/v1/lexicon";

// Curated Daily Verse Psalms whose KJV numbering is one verse behind the WLC.
const DAILY_PSALM_WLC_VERSES = {
  "34:18": 19,
  "46:1": 2,
  "46:10": 11,
};

const BOOKS = {
  Genesis: { osis: "Gen", number: 1 },
  Exodus: { osis: "Exod", number: 2 },
  Leviticus: { osis: "Lev", number: 3 },
  Numbers: { osis: "Num", number: 4 },
  Deuteronomy: { osis: "Deut", number: 5 },
  Joshua: { osis: "Josh", number: 6 },
  Judges: { osis: "Judg", number: 7 },
  Ruth: { osis: "Ruth", number: 8 },
  "1 Samuel": { osis: "1Sam", number: 9 },
  "2 Samuel": { osis: "2Sam", number: 10 },
  "1 Kings": { osis: "1Kgs", number: 11 },
  "2 Kings": { osis: "2Kgs", number: 12 },
  "1 Chronicles": { osis: "1Chr", number: 13 },
  "2 Chronicles": { osis: "2Chr", number: 14 },
  Ezra: { osis: "Ezra", number: 15 },
  Nehemiah: { osis: "Neh", number: 16 },
  Esther: { osis: "Esth", number: 17 },
  Job: { osis: "Job", number: 18 },
  Psalm: { osis: "Ps", number: 19 },
  Psalms: { osis: "Ps", number: 19 },
  Proverbs: { osis: "Prov", number: 20 },
  Ecclesiastes: { osis: "Eccl", number: 21 },
  "Song of Solomon": { osis: "Song", number: 22 },
  "Song of Songs": { osis: "Song", number: 22 },
  Isaiah: { osis: "Isa", number: 23 },
  Jeremiah: { osis: "Jer", number: 24 },
  Lamentations: { osis: "Lam", number: 25 },
  Ezekiel: { osis: "Ezek", number: 26 },
  Daniel: { osis: "Dan", number: 27 },
  Hosea: { osis: "Hos", number: 28 },
  Joel: { osis: "Joel", number: 29 },
  Amos: { osis: "Amos", number: 30 },
  Obadiah: { osis: "Obad", number: 31 },
  Jonah: { osis: "Jonah", number: 32 },
  Micah: { osis: "Mic", number: 33 },
  Nahum: { osis: "Nah", number: 34 },
  Habakkuk: { osis: "Hab", number: 35 },
  Zephaniah: { osis: "Zeph", number: 36 },
  Haggai: { osis: "Hag", number: 37 },
  Zechariah: { osis: "Zech", number: 38 },
  Malachi: { osis: "Mal", number: 39 },
  Matthew: { osis: "Matt", number: 40 },
  Mark: { osis: "Mark", number: 41 },
  Luke: { osis: "Luke", number: 42 },
  John: { osis: "John", number: 43 },
  Acts: { osis: "Acts", number: 44 },
  Romans: { osis: "Rom", number: 45 },
  "1 Corinthians": { osis: "1Cor", number: 46 },
  "2 Corinthians": { osis: "2Cor", number: 47 },
  Galatians: { osis: "Gal", number: 48 },
  Ephesians: { osis: "Eph", number: 49 },
  Philippians: { osis: "Phil", number: 50 },
  Colossians: { osis: "Col", number: 51 },
  "1 Thessalonians": { osis: "1Thess", number: 52 },
  "2 Thessalonians": { osis: "2Thess", number: 53 },
  "1 Timothy": { osis: "1Tim", number: 54 },
  "2 Timothy": { osis: "2Tim", number: 55 },
  Titus: { osis: "Titus", number: 56 },
  Philemon: { osis: "Phlm", number: 57 },
  Hebrews: { osis: "Heb", number: 58 },
  James: { osis: "Jas", number: 59 },
  "1 Peter": { osis: "1Pet", number: 60 },
  "2 Peter": { osis: "2Pet", number: 61 },
  "1 John": { osis: "1John", number: 62 },
  "2 John": { osis: "2John", number: 63 },
  "3 John": { osis: "3John", number: 64 },
  Jude: { osis: "Jude", number: 65 },
  Revelation: { osis: "Rev", number: 66 },
};

const lexiconBucketCache = new Map();

function parseReference(reference) {
  const match = reference?.match(/^(.+?)\s+(\d+):(\d+)/);
  if (!match) throw new Error(`Unsupported Bible reference: ${reference}`);
  const book = BOOKS[match[1].trim()];
  if (!book) throw new Error(`Unsupported Bible book: ${match[1]}`);
  return {
    ...book,
    bookName: match[1].trim(),
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Original-language data ${response.status}`);
  return response.json();
}

async function fetchOptionalJson(url, { signal } = {}) {
  try {
    return await fetchJson(url, { signal });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return null;
  }
}

function tokenizeEnglish(value = "") {
  return (value.match(/[\p{L}\p{N}']+/gu) || []).map((word) =>
    word.toLocaleLowerCase("en-US")
  );
}

function findDisplayedVerseWords(words = [], englishText = "") {
  const target = tokenizeEnglish(englishText);
  if (!target.length || !words.length) return { words, exact: false };

  const source = words.map(([word]) => tokenizeEnglish(word)[0] || "");
  for (let start = 0; start <= source.length - target.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < target.length; offset += 1) {
      if (source[start + offset] !== target[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return {
        words: words.slice(start, start + target.length),
        exact: true,
      };
    }
  }
  return { words, exact: false };
}

function strongFrequencyFromKjv(words = []) {
  const frequency = new Map();
  words.forEach(([, strongs = []]) => {
    strongs.forEach((strong) => {
      frequency.set(strong, (frequency.get(strong) || 0) + 1);
    });
  });
  return frequency;
}

function scoreHebrewCandidate(candidate, kjvStrongFrequency) {
  const candidateFrequency = new Map();
  (candidate?.words || []).forEach((word) => {
    (word.strongs || []).forEach((strong) => {
      candidateFrequency.set(strong, (candidateFrequency.get(strong) || 0) + 1);
    });
  });

  let score = 0;
  candidateFrequency.forEach((count, strong) => {
    score += Math.min(count, kjvStrongFrequency.get(strong) || 0);
  });
  return score;
}

function trimPsalmHeading(words, contextWords, hasExactEnglishMatch) {
  if (!hasExactEnglishMatch) return words;
  const contextStrongs = new Set(
    contextWords.flatMap(([, strongs = []]) => strongs)
  );
  const matchingIndexes = words
    .map((word, index) =>
      (word.strongs || []).some((strong) => contextStrongs.has(strong))
        ? index
        : -1
    )
    .filter((index) => index >= 0);

  if (!matchingIndexes.length) return words;
  return words.slice(
    Math.min(...matchingIndexes),
    Math.max(...matchingIndexes) + 1
  );
}

function buildContextGlosses(words = []) {
  const glosses = new Map();
  words.forEach(([english, strongs = []]) => {
    if (strongs.length !== 1) return;
    strongs.forEach((strong) => {
      const current = glosses.get(strong) || [];
      if (current[current.length - 1] !== english) current.push(english);
      glosses.set(strong, current);
    });
  });
  return glosses;
}

function specialHebrewGloss(word, strong) {
  if (strong !== "H853") return "";
  return String(word?.lemma || "").startsWith("c/")
    ? "and · object marker"
    : "object marker";
}

function prefixGloss(word) {
  const prefixLabels = {
    b: "in/with",
    c: "and",
    h: "the",
    k: "as/like",
    l: "to/for",
    m: "from",
  };
  const suffixLabels = {
    "1cs": "me",
    "1cp": "us",
    "2ms": "you",
    "2fs": "you",
    "2mp": "you",
    "2fp": "you",
    "3ms": "him",
    "3fs": "her",
    "3mp": "them",
    "3fp": "them",
  };
  const pieces = String(word?.lemma || "").split("/");
  const prefix = pieces.find((piece) => prefixLabels[piece]);
  const suffixCode = String(word?.morph || "").match(/Sp(\d(?:c|m|f)[sp])/i)?.[1];
  const parts = [prefixLabels[prefix], suffixLabels[suffixCode]].filter(Boolean);
  return parts.join(" ") || "grammar word";
}

function cleanGloss(value = "") {
  return String(value)
    .replace(/[<>\u005b\u005d]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lexiconGloss(entry) {
  const raw = String(entry?.str || "");
  const concordance = raw.includes(":--") ? raw.split(":--").pop() : raw;
  return cleanGloss(concordance)
    .replace(/^[+×]\s*/, "")
    .split(/[,;.]/)[0]
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim();
}

async function loadLexiconBucket(language, bucket) {
  const cacheKey = `${language}/${bucket}`;
  if (!lexiconBucketCache.has(cacheKey)) {
    lexiconBucketCache.set(
      cacheKey,
      fetchJson(`${STRONGS_LEXICON_BASE}/${language}/${bucket}.json`).catch(
        () => ({})
      )
    );
  }
  return lexiconBucketCache.get(cacheKey);
}

async function loadMissingGlosses(strongs) {
  const unique = [...new Set(strongs.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (strong) => {
      const match = strong.match(/^([HG])0*(\d+)$/i);
      if (!match) return [strong, ""];
      const normalized = `${match[1].toUpperCase()}${Number(match[2])}`;
      const bucket = Math.floor(Number(match[2]) / 100);
      const data = await loadLexiconBucket(match[1].toUpperCase(), bucket);
      return [strong, lexiconGloss(data?.[normalized])];
    })
  );
  return new Map(entries);
}

async function fetchHebrewVerse(parsed, { signal, englishText } = {}) {
  const chapterUrl = `${KJV_STRONGS_BASE}/${String(parsed.number).padStart(
    2,
    "0"
  )}/${String(parsed.chapter).padStart(3, "0")}.json`;
  const mappedPsalmVerse = DAILY_PSALM_WLC_VERSES[
    `${parsed.chapter}:${parsed.verse}`
  ];
  const candidateOffsets = mappedPsalmVerse
    ? [mappedPsalmVerse - parsed.verse]
    : parsed.osis === "Ps"
      ? [0, 1, 2]
      : [0];
  const [kjvChapter, ...candidates] = await Promise.all([
    fetchOptionalJson(chapterUrl, { signal }),
    ...candidateOffsets.map((offset) =>
      fetchOptionalJson(
        `${OHB_BASE}/${parsed.osis}/${parsed.chapter}/${parsed.verse + offset}.json`,
        { signal }
      ).then((data) => (data ? { ...data, offset } : null))
    ),
  ]);

  const available = candidates.filter(Boolean);
  if (!available.length) throw new Error("WLC verse unavailable");

  const kjvRecord = kjvChapter?.[String(parsed.verse)];
  const context = findDisplayedVerseWords(kjvRecord?.w || [], englishText);
  const kjvStrongFrequency = strongFrequencyFromKjv(context.words);
  const selected = available.reduce((best, candidate) =>
    scoreHebrewCandidate(candidate, kjvStrongFrequency) >
    scoreHebrewCandidate(best, kjvStrongFrequency)
      ? candidate
      : best
  );
  const selectedWords =
    parsed.osis === "Ps"
      ? trimPsalmHeading(selected.words || [], context.words, context.exact)
      : selected.words || [];
  const contextualGlosses = buildContextGlosses(context.words);
  const glossIndexes = new Map();
  const missingStrongs = selectedWords
    .flatMap((word) => word.strongs || [])
    .filter((strong) => !contextualGlosses.has(strong));
  const fallbackGlosses = await loadMissingGlosses(missingStrongs);

  const words = selectedWords.map((word) => {
    const strong = word.strongs?.[0] || null;
    const choices = strong ? contextualGlosses.get(strong) || [] : [];
    const used = strong ? glossIndexes.get(strong) || 0 : 0;
    const contextual = choices[Math.min(used, Math.max(choices.length - 1, 0))];
    if (strong && choices.length) glossIndexes.set(strong, used + 1);
    return {
      text: word.text,
      strong,
      gloss:
        specialHebrewGloss(word, strong) ||
        cleanGloss(contextual) ||
        cleanGloss(fallbackGlosses.get(strong)) ||
        prefixGloss(word),
    };
  });

  return {
    text: words.map((word) => word.text).join(" "),
    words,
    credit: "Open Scriptures Hebrew Bible",
    creditUrl: "https://github.com/openscriptures/morphhb",
  };
}

async function fetchGreekVerse(parsed, { signal } = {}) {
  const data = await fetchJson(
    `${TR_BASE}/${parsed.osis}/${parsed.chapter}/${parsed.verse}.json`,
    { signal }
  );
  const words = (data?.words || []).map((word) => ({
    text: word.text,
    strong: word.strongs?.[0] || null,
    gloss:
      cleanGloss(word.translation) ||
      cleanGloss(word.metadata?.gloss?.split("/")?.[0]) ||
      "See lexicon",
  }));

  return {
    text: data?.text || words.map((word) => word.text).join(" "),
    words,
    credit: "STEP Bible / Tyndale House, Cambridge",
    creditUrl: "https://www.stepbible.org",
  };
}

export async function fetchOriginalLanguageVerse(
  reference,
  { signal, englishText } = {}
) {
  const parsed = parseReference(reference);
  return parsed.number <= 39
    ? fetchHebrewVerse(parsed, { signal, englishText })
    : fetchGreekVerse(parsed, { signal });
}

export function strongsLexiconUrl(strong) {
  const match = String(strong || "").match(/^([HG])0*(\d+)$/i);
  if (!match) return null;
  const language = match[1].toUpperCase();
  const normalized = `${language.toLowerCase()}${Number(match[2])}`;
  return language === "H"
    ? `https://www.blueletterbible.org/lexicon/${normalized}/wlc/wlc/`
    : `https://www.blueletterbible.org/lexicon/${normalized}/kjv/tr/`;
}
