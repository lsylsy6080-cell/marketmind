export interface DedupeNewsArticle {
  id: number;
  title: string;
  source: string;
  published_at: string;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "with",
  "bitcoin",
  "btc",
  "crypto",
]);

function tokenize(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !STOP_WORDS.has(token),
    );

  return new Set(tokens);
}

function jaccardSimilarity(
  left: Set<string>,
  right: Set<string>,
): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;

  return union === 0 ? 0 : intersection / union;
}

function titleContainsSameCorePhrase(
  left: string,
  right: string,
): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const a = normalize(left);
  const b = normalize(right);

  if (a.length < 20 || b.length < 20) {
    return false;
  }

  return a.includes(b) || b.includes(a);
}

export function areLikelyDuplicateNews(
  left: DedupeNewsArticle,
  right: DedupeNewsArticle,
): boolean {
  const leftPublishedAt = new Date(
    left.published_at,
  ).getTime();
  const rightPublishedAt = new Date(
    right.published_at,
  ).getTime();

  const timeDifferenceHours =
    Math.abs(leftPublishedAt - rightPublishedAt) /
    (1000 * 60 * 60);

  if (timeDifferenceHours > 48) {
    return false;
  }

  if (
    titleContainsSameCorePhrase(
      left.title,
      right.title,
    )
  ) {
    return true;
  }

  const similarity = jaccardSimilarity(
    tokenize(left.title),
    tokenize(right.title),
  );

  return similarity >= 0.56;
}

export function buildNewsDuplicateGroups<
  T extends DedupeNewsArticle,
>(articles: T[]): T[][] {
  const groups: T[][] = [];

  for (const article of articles) {
    const existingGroup = groups.find((group) =>
      group.some((candidate) =>
        areLikelyDuplicateNews(
          article,
          candidate,
        ),
      ),
    );

    if (existingGroup) {
      existingGroup.push(article);
    } else {
      groups.push([article]);
    }
  }

  return groups;
}
