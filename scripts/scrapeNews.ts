import fs from "node:fs";
import path from "node:path";
import { fetchFeedItems } from "../src/news/fetchFeed";
import { extractArticleText } from "../src/news/extractArticle";

interface NewsSource {
  name: string;
  feedUrl: string;
}

const CONFIG_PATH = path.join(process.cwd(), "config", "news-sources.json");
const SOURCES_DIR = path.join(process.cwd(), "sources");
const SEEN_PATH = path.join(SOURCES_DIR, ".seen.json");

function loadSources(): NewsSource[] {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

function loadSeen(): Set<string> {
  if (!fs.existsSync(SEEN_PATH)) return new Set();
  const raw = fs.readFileSync(SEEN_PATH, "utf8");
  return new Set(JSON.parse(raw));
}

function saveSeen(seen: Set<string>): void {
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  fs.writeFileSync(SEEN_PATH, JSON.stringify([...seen], null, 2));
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function main() {
  const sources = loadSources();
  if (sources.length === 0) {
    console.log("No sources configured in config/news-sources.json — nothing to do.");
    return;
  }

  const seen = loadSeen();
  let newCount = 0;

  for (const source of sources) {
    console.log(`\nChecking source: ${source.name}`);
    const items = await fetchFeedItems(source.feedUrl);
    const newItems = items.filter((item) => item.link && !seen.has(item.link));
    console.log(`  ${items.length} items in feed, ${newItems.length} new.`);

    for (const item of newItems) {
      try {
        console.log(`  Extracting: ${item.title}`);
        const article = await extractArticleText(item.link);
        const date = (item.publishedAt ?? new Date().toISOString()).slice(0, 10);
        const filePath = path.join(SOURCES_DIR, `${date}-${slugify(article.title || item.title)}.json`);
        fs.mkdirSync(SOURCES_DIR, { recursive: true });
        fs.writeFileSync(
          filePath,
          JSON.stringify(
            {
              sourceName: source.name,
              title: article.title || item.title,
              url: item.link,
              publishedAt: item.publishedAt ?? null,
              text: article.text,
            },
            null,
            2,
          ),
        );
        seen.add(item.link);
        newCount++;
      } catch (err) {
        console.error(`  Failed to extract "${item.title}": ${(err as Error).message}`);
      }
    }
  }

  saveSeen(seen);
  console.log(`\nDone — ${newCount} new article(s) saved to sources/.`);
}

main().catch((err) => {
  console.error("scrapeNews failed:", err);
  process.exit(1);
});
