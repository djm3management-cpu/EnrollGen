/**
 * Curated pool used for the date-anchored "verse of the day".
 * A deterministic hash of the calendar date selects one entry, so
 * everyone using the app on a given day sees the same verse.
 * The refresh button falls back to the bible-api random endpoint.
 */
const DAILY_VERSE_POOL = [
  "Genesis 1:1",
  "Genesis 50:20",
  "Exodus 14:14",
  "Deuteronomy 31:6",
  "Joshua 1:9",
  "Psalm 16:8",
  "Psalm 23:1",
  "Psalm 27:1",
  "Psalm 34:18",
  "Psalm 46:1",
  "Psalm 46:10",
  "Psalm 91:1",
  "Psalm 118:24",
  "Psalm 119:105",
  "Psalm 139:14",
  "Proverbs 3:5",
  "Proverbs 3:6",
  "Proverbs 16:3",
  "Proverbs 18:10",
  "Proverbs 27:17",
  "Ecclesiastes 3:1",
  "Isaiah 26:3",
  "Isaiah 40:31",
  "Isaiah 41:10",
  "Isaiah 53:5",
  "Jeremiah 29:11",
  "Lamentations 3:22",
  "Lamentations 3:23",
  "Micah 6:8",
  "Habakkuk 3:19",
  "Zephaniah 3:17",
  "Matthew 5:14",
  "Matthew 6:33",
  "Matthew 11:28",
  "Matthew 28:19",
  "Mark 10:27",
  "Luke 1:37",
  "John 1:1",
  "John 3:16",
  "John 14:6",
  "John 14:27",
  "John 15:13",
  "John 16:33",
  "Acts 1:8",
  "Romans 5:8",
  "Romans 8:28",
  "Romans 8:38",
  "Romans 10:9",
  "Romans 12:2",
  "Romans 15:13",
  "1 Corinthians 13:4",
  "1 Corinthians 13:13",
  "1 Corinthians 15:58",
  "2 Corinthians 5:17",
  "2 Corinthians 12:9",
  "Galatians 2:20",
  "Galatians 5:22",
  "Ephesians 2:8",
  "Ephesians 4:32",
  "Ephesians 6:10",
  "Philippians 1:6",
  "Philippians 4:6",
  "Philippians 4:13",
  "Philippians 4:19",
  "Colossians 3:23",
  "1 Thessalonians 5:16",
  "2 Timothy 1:7",
  "Hebrews 11:1",
  "Hebrews 12:1",
  "Hebrews 12:2",
  "Hebrews 13:5",
  "James 1:2",
  "James 1:5",
  "James 1:22",
  "James 4:7",
  "1 Peter 5:7",
  "1 John 1:9",
  "1 John 4:8",
  "1 John 4:19",
  "Revelation 3:20",
  "Revelation 21:4",
];

export function getDailyReference(now = new Date()) {
  const year = now.getFullYear();
  const start = new Date(year, 0, 0);
  const diff = now - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  // mix in year so Jan 1 differs across years
  const seed = (year * 31 + dayOfYear) % DAILY_VERSE_POOL.length;
  return DAILY_VERSE_POOL[seed];
}

export function getDailyDateLabel(now = new Date()) {
  return now
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
}

export default DAILY_VERSE_POOL;
