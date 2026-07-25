const punctuation = /[・･、。！？!?,.'’"“”「」『』【】（）()\[\]{}:：;；/／\\_—–-]+/gu;

export function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("ja-JP");
}

export function normalizeSearchText(value: string) {
  return normalizeText(value).replace(punctuation, " ").replace(/\s+/gu, " ").trim();
}

export function splitNames(value: string | string[] | undefined) {
  const input = Array.isArray(value) ? value.join(",") : (value ?? "");
  const seen = new Set<string>();
  return input
    .split(/[,\n、;；]+/u)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const normalized = normalizeText(item);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function bigrams(value: string) {
  const normalized = normalizeSearchText(value).replace(/\s/gu, "");
  if (normalized.length < 2) return new Set([normalized]);
  return new Set(
    Array.from({ length: normalized.length - 1 }, (_, index) =>
      normalized.slice(index, index + 2),
    ),
  );
}

export function diceSimilarity(left: string, right: string) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 1 && b.size === 1 && [...a][0] === [...b][0]) return 1;
  let overlap = 0;
  for (const item of a) {
    if (b.has(item)) overlap += 1;
  }
  return (2 * overlap) / Math.max(1, a.size + b.size);
}
