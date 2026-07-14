import { useState } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";

interface NewsItem {
  title: string;
  link: string;
  publishedAt: string | null;
  sourceName: string;
}

export const NewsPage: React.FC = () => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [newsStatus, setNewsStatus] = useState("");
  const [fetching, setFetching] = useState(false);
  const [extractingIndex, setExtractingIndex] = useState<number | null>(null);
  const [article, setArticle] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleFetchNews() {
    setFetching(true);
    setNewsStatus("Fetching feeds...");
    setItems([]);
    setArticle(null);

    try {
      const res = await fetch("/news");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch news.");

      setNewsStatus(data.warning ?? `${data.items.length} item(s) found.`);
      setItems(data.items);
    } catch (err) {
      setNewsStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setFetching(false);
    }
  }

  async function handleExtract(item: NewsItem, index: number) {
    setExtractingIndex(index);
    try {
      const res = await fetch("/news/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.link }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed.");
      setArticle({ text: `${data.title}\n\n${data.text}`, isError: false });
    } catch (err) {
      setArticle({ text: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true });
    } finally {
      setExtractingIndex(null);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card span={12} tone="accent" className="md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-extrabold mb-1">Latest headlines</h2>
          <p className="text-accent-ink/70 text-sm">
            Pulls the latest items from the feeds configured in{" "}
            <code className="bg-accent-ink/10 px-1.5 py-0.5 rounded text-[0.92em]">config/news-sources.json</code> —
            for testing the scraper and pulling source material, not a script generator on its own.
          </p>
          {newsStatus && <div className="mt-2 text-accent-ink/70 text-sm font-medium">{newsStatus}</div>}
        </div>
        <Button
          variant="primary"
          onClick={handleFetchNews}
          disabled={fetching}
          className="!bg-accent-ink !text-accent !mt-0 shrink-0"
        >
          {fetching ? "Fetching..." : "Fetch Latest News"}
        </Button>
      </Card>

      {items.length > 0 && (
        <div className="col-span-12 md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start max-h-[520px] overflow-y-auto pr-1">
          {items.map((item, index) => (
            <div key={index} className="bg-panel-alt border border-border rounded-2xl p-4 flex flex-col">
              <div className="font-semibold text-sm leading-snug">{item.title}</div>
              <div className="text-text-dim text-xs mt-1.5">
                {item.sourceName} — {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "no date"}
              </div>
              <button
                onClick={() => handleExtract(item, index)}
                disabled={extractingIndex === index}
                className="mt-3 self-start px-3.5 py-1.5 text-xs font-bold bg-bg border border-border rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:border-accent"
              >
                {extractingIndex === index ? "Extracting..." : "Extract Full Article"}
              </button>
            </div>
          ))}
        </div>
      )}

      {article && (
        <Card span={items.length > 0 ? 5 : 12} eyebrow="Extracted Article">
          <pre
            className={`whitespace-pre-wrap max-h-[480px] overflow-y-auto bg-bg border border-border rounded-lg p-3.5 text-[13px] font-mono ${
              article.isError ? "text-danger" : "text-text"
            }`}
          >
            {article.text}
          </pre>
        </Card>
      )}
    </div>
  );
};
