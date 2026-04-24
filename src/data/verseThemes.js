/**
 * Curated theme → verse mapping. References must exist in
 * src/data/dailyVerseSelections.js so the theme filter can pick
 * a verse that the rest of the pipeline knows how to load.
 */
export const VERSE_THEMES = [
  {
    id: "hope",
    label: "Hope",
    verses: [
      "Jeremiah 29:11",
      "Romans 15:13",
      "Lamentations 3:22",
      "Romans 8:28",
      "Revelation 21:4",
    ],
  },
  {
    id: "courage",
    label: "Courage",
    verses: [
      "Joshua 1:9",
      "Deuteronomy 31:6",
      "2 Timothy 1:7",
      "Psalm 27:1",
      "Ephesians 6:10",
    ],
  },
  {
    id: "peace",
    label: "Peace",
    verses: [
      "John 14:27",
      "Philippians 4:6",
      "Isaiah 26:3",
      "John 16:33",
      "Psalm 46:10",
    ],
  },
  {
    id: "perseverance",
    label: "Perseverance",
    verses: [
      "Hebrews 12:1",
      "James 1:2",
      "1 Corinthians 15:58",
      "Romans 5:8",
      "Philippians 1:6",
    ],
  },
  {
    id: "faith",
    label: "Faith",
    verses: [
      "Hebrews 11:1",
      "Romans 10:9",
      "Mark 10:27",
      "Ephesians 2:8",
      "Luke 1:37",
    ],
  },
  {
    id: "love",
    label: "Love",
    verses: [
      "John 3:16",
      "1 Corinthians 13:4",
      "1 John 4:8",
      "1 John 4:19",
      "Romans 5:8",
    ],
  },
  {
    id: "wisdom",
    label: "Wisdom",
    verses: [
      "Proverbs 3:5",
      "Proverbs 3:6",
      "James 1:5",
      "Proverbs 27:17",
      "Ecclesiastes 3:1",
    ],
  },
  {
    id: "identity",
    label: "Identity",
    verses: [
      "Galatians 2:20",
      "2 Corinthians 5:17",
      "Psalm 139:14",
      "Ephesians 2:8",
      "Romans 8:38",
    ],
  },
  {
    id: "strength",
    label: "Strength",
    verses: [
      "Philippians 4:13",
      "Isaiah 40:31",
      "Isaiah 41:10",
      "2 Corinthians 12:9",
      "Habakkuk 3:19",
    ],
  },
  {
    id: "gratitude",
    label: "Gratitude",
    verses: [
      "1 Thessalonians 5:16",
      "Psalm 118:24",
      "Colossians 3:23",
      "Psalm 139:14",
      "James 1:2",
    ],
  },
  {
    id: "forgiveness",
    label: "Forgiveness",
    verses: [
      "Ephesians 4:32",
      "1 John 1:9",
      "Romans 5:8",
      "Matthew 6:33",
      "2 Corinthians 5:17",
    ],
  },
  {
    id: "guidance",
    label: "Guidance",
    verses: [
      "Psalm 119:105",
      "Psalm 23:1",
      "Proverbs 3:6",
      "John 14:6",
      "Proverbs 16:3",
    ],
  },
  {
    id: "rest",
    label: "Rest",
    verses: [
      "Matthew 11:28",
      "Psalm 23:1",
      "Psalm 46:10",
      "Psalm 91:1",
      "Psalm 16:8",
    ],
  },
  {
    id: "purpose",
    label: "Purpose",
    verses: [
      "Jeremiah 29:11",
      "Matthew 28:19",
      "Acts 1:8",
      "Colossians 3:23",
      "Romans 12:2",
    ],
  },
  {
    id: "fear",
    label: "Fear",
    verses: [
      "Isaiah 41:10",
      "Psalm 34:18",
      "1 Peter 5:7",
      "Psalm 27:1",
      "2 Timothy 1:7",
    ],
  },
];

export function pickRandomVerseForTheme(themeId) {
  const theme = VERSE_THEMES.find((t) => t.id === themeId);
  if (!theme || !theme.verses.length) return null;
  const idx = Math.floor(Math.random() * theme.verses.length);
  return theme.verses[idx];
}

export default VERSE_THEMES;
