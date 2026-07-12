import Parser from "rss-parser";

export interface FeedItem {
  title: string;
  link: string;
  publishedAt: string | undefined;
  summary: string | undefined;
}

const parser = new Parser();

/** Thin wrapper around rss-parser — RSS/Atom is publisher-sanctioned
 * syndication, which is why it's the preferred source mechanism here over
 * scraping a site's HTML directly. */
export async function fetchFeedItems(feedUrl: string): Promise<FeedItem[]> {
  const feed = await parser.parseURL(feedUrl);
  return (feed.items ?? []).map((item) => ({
    title: item.title ?? "(untitled)",
    link: item.link ?? "",
    publishedAt: item.isoDate ?? item.pubDate,
    summary: item.contentSnippet ?? item.summary,
  }));
}
