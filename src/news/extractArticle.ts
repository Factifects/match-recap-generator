import * as cheerio from "cheerio";

export interface ExtractedArticle {
  title: string;
  text: string;
}

const NOISE_SELECTORS = "script, style, nav, header, footer, aside, iframe, noscript, form, button";

function paragraphText($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>): string {
  return root
    .find("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((line) => line.length > 0)
    .join("\n\n");
}

/** Best-effort readable-text extraction — not a guaranteed-accurate
 * readability engine. Prefers a semantic <article> tag; falls back to
 * whichever container has the most cumulative paragraph text. A specific
 * source that extracts badly (nav text, ads, paywall stubs) needs its own
 * tuning later — this is a generic starting point, not a promise it works
 * perfectly on every site. */
export async function extractArticleText(url: string): Promise<ExtractedArticle> {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MatchRecapBot/1.0)" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.status} ${response.statusText} (${url})`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  $(NOISE_SELECTORS).remove();

  const title = $("h1").first().text().trim() || $("title").text().trim() || "(untitled)";

  const article = $("article").first();
  if (article.length > 0) {
    const text = paragraphText($, article);
    if (text.length > 200) return { title, text };
  }

  let bestText = "";
  $("div, section, main").each((_, el) => {
    const candidate = paragraphText($, $(el));
    if (candidate.length > bestText.length) bestText = candidate;
  });

  return { title, text: bestText };
}
