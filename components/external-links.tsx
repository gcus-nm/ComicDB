import { ExternalLink } from "lucide-react";
import { parseExternalLink } from "@/lib/links";

export function ExternalLinks({ links }: { links: string[] }) {
  const parsedLinks = links.flatMap((entry) => {
    const parsed = parseExternalLink(entry);
    return parsed ? [{ ...parsed, entry }] : [];
  });
  if (!parsedLinks.length) return null;

  return (
    <div className="external-links" aria-label="関連リンク">
      {parsedLinks.map((link, index) => (
        <a
          key={`${link.entry}-${index}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.url}
        >
          <ExternalLink size={14} aria-hidden="true" />
          <span>{link.label}</span>
        </a>
      ))}
    </div>
  );
}
