export type ParsedExternalLink = {
  label: string;
  url: string;
};

function isHttpUrl(value: string) {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseExternalLink(value: string): ParsedExternalLink | null {
  const entry = value.trim();
  const markdown = /^\[([^\]\r\n]+)\]\((.+)\)$/u.exec(entry);
  if (markdown) {
    const label = markdown[1].trim();
    const url = markdown[2].trim();
    if (!label || label.length > 200 || !isHttpUrl(url)) return null;
    return { label, url };
  }
  return isHttpUrl(entry) ? { label: entry, url: entry } : null;
}
