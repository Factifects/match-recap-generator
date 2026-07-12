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
      <Card span={12} eyebrow="News Scraper">
        <h2 className="text-[15px] font-semibold mb-1">Latest headlines</h2>
        <p className="text-text-dim text-sm mb-3">
          Pulls the latest items from the feeds configured in{" "}
          <code className="bg-white/5 px-1.5 py-0.5 rounded text-[0.92em]">config/news-sources.json</code> — for
          testing the scraper and pulling source material, not a script generator on its own.
        </p>
        <Button variant="secondary" onClick={handleFetchNews} disabled={fetching}>
          Fetch Latest News
        </Button>
        {newsStatus && <div className="mt-2.5 text-text-dim text-sm">{newsStatus}</div>}
      </Card>

      {items.length > 0 && (
        <Card span={6} eyebrow="Results">
          <div className="max-h-[420px] overflow-y-auto">
            {items.map((item, index) => (
              <div key={index} className="py-3 border-b border-border last:border-none">
                <div className="font-semibold text-sm">{item.title}</div>
                <div className="text-text-dim text-xs mt-0.5">
                  {item.sourceName} — {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "no date"}
                </div>
                <button
                  onClick={() => handleExtract(item, index)}
                  disabled={extractingIndex === index}
                  className="mt-2 px-3.5 py-1.5 text-xs font-medium bg-bg border border-border rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {extractingIndex === index ? "Extracting..." : "Extract Full Article"}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {article && (
        <Card span={6} eyebrow="Extracted Article">
          <pre
            className={`whitespace-pre-wrap max-h-[340px] overflow-y-auto bg-bg border border-border rounded-lg p-3.5 text-[13px] font-mono ${
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
