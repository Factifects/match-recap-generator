# Voiceover Match Analysis

## What this is (current direction — third pivot, see history below)

A tool that generates football video content: an AI voiceover (ElevenLabs) reads a scene-by-scene
script the user writes, over plain, simple, real-data-driven graphic cards (stat comparisons, key
moments, tactical boards, intro/outro) — no elaborate motion graphics, no animated characters.
Two source materials feed scripts today: a single match's API-Football data (original direction),
and real news articles pulled via RSS (newer — powers multi-story "This Week In Football"-style
roundups, see News pipeline below).

## Why this exists

User runs a YouTube channel around football content. Core pain points: hours of manual editing,
copyright strikes from reposting broadcast footage, and (discovered through building this) an
unwillingness to be on camera or record their own voice confidently. This direction is the one
that survived contact with all of those constraints — see history.

## How we got here (read this before proposing a new direction)

1. **Data-driven match recap** (motion graphics from API-Football data — timeline of events,
   animated stat bars). Built a full MVP with real iteration (fonts, pacing, narrative captions,
   scoreboard, flashpoint detection, a pitch dramatization scene, a hand-illustrated player
   figure). User verdict: *"it looks ugly... I do not even want to recap to be showing like
   scores like that."* Also hit a hard wall: free-tier API-Football blocks all current-season
   data.
2. **General-purpose stick-figure script animator.** Built a skeletal pose-animation engine,
   caught and fixed a real bug (legs merging) via self-review before showing the user. User
   verdict on the motion itself: *"it looks awful honestly, I doubt we can post something like
   this on youtube."*
3. User proposed an AI clip-extraction tool, but confirmed the source would be broadcast
   football footage they don't own — flagged clearly as recreating the original copyright
   problem. User then clarified they don't have resources to record their own footage either.
4. Landed here through direct conversation: real data → **plain graphic cards** (user's words:
   *"the simple graphics is actually nice"*) + a **human-written analysis script** (substance
   stays human, which sidesteps the AI-visual-quality problem that sank attempts 1 and 2) + an
   **AI voiceover** reading it (since the user isn't confident recording their own voice).
5. **Extended, not pivoted, once the pipeline above proved out**: the original script format
   (`[INTRO]`/`[STAT: x]`/`[MOMENT: n]`, API-Football data only) was replaced by a much richer
   "### SCENE N" scene-spec format (~21 visual types — see `SCRIPT_TEMPLATE.md`, the authoritative
   spec), and the source material widened from "one match's stats" to "any story a script author
   wants to tell," including multi-story news roundups sourced from real RSS articles. The old
   tag format still parses as a fallback (see Script format below) but is not the target format
   for new scripts.

## Tech choices and why

- **Remotion** — still the right tool. The prior failures were about *animation/illustration
  craft* (something requiring an animator's iterative eye), not about Remotion as a renderer.
  Plain cards + precise audio-sync timing is close to Remotion's actual sweet spot.
- **ElevenLabs** for TTS — natural-sounding, standard choice for this. Real per-generation cost
  (character-based pricing), unlike everything else in this project. `src/audio/elevenLabs.ts`
  caches by text hash in `public/audio-cache/` (gitignored) so re-renders don't regenerate (and
  re-charge for) identical segments.
- **API-Football** (reused as-is from attempt 1) — `src/data/apiFootballClient.ts`/
  `fetchMatch.ts` are proven working against live data (verified: Tottenham 1-4 Brighton, 25 May
  2025, fixture id `1208401`). Same free-tier restriction as before (blocks current season,
  works for 2022-2024) — fine for analysis/breakdown content, doesn't need to be current.
- **rss-parser + cheerio** for the news pipeline — RSS/Atom feeds are publisher-sanctioned
  (unlike scraping a site directly), and cheerio does best-effort article-text extraction from
  the linked page when a feed only gives a summary. Explicitly best-effort, not guaranteed
  accurate — see News pipeline below.

## Architecture

```
match-recap-generator/
  config/
    news-sources.json        # [{name, feedUrl}] — currently one entry, BBC Sport Football RSS
  analyses/                  # human/LLM-authored finished scene-spec scripts, ready to feed
                              # into generate.ts (NOT code output — a drafts folder). e.g.
                              # this-week-in-football-2026-07-11.txt, why-morocco-lost-part2.txt
  scripts/
    findFixtures.ts, testApiFetch.ts   # find/validate real API-Football fixture IDs
    scrapeNews.ts             # standalone CLI (not part of the app pipeline): reads
                               # config/news-sources.json, fetches+extracts articles, writes raw
                               # JSON to sources/ (gitignored, dedup via .seen.json) — the raw-
                               # material scraper, upstream of analyses/ which is hand-assembled
                               # from this output
    checkpointStatCard.ts     # early checkpoint script, kept for reference only
  public-ui/
    index.html                # self-serve single-file frontend — paste/pick a script, hit
                               # generate, watch SSE progress, get the rendered mp4. Talks to
                               # src/server.ts's endpoints below.
  src/
    config.ts                 # env loading — API_FOOTBALL_KEY, ELEVENLABS_API_KEY
    server.ts                 # `npm run ui` — plain Node http server, PORT env (default 4321).
                               # GET / -> public-ui/index.html, GET /output/* -> rendered mp4s,
                               # GET /progress/:jobId -> SSE render progress, GET /news -> fetch
                               # all configured RSS feeds, POST /news/extract -> article text by
                               # URL, POST /generate -> starts a background render job via
                               # generateVideo(), returns jobId
    cli.ts                    # `npm run generate` — thin arg parser (--script <path> [--audio]),
                               # calls the same generateVideo() as server.ts
    generate.ts                # generateVideo(scriptText, options) — THE shared pipeline (parse
                               # -> optional real ElevenLabs narration via resolveSegmentAudio ->
                               # renderVideo("AnalysisVideo", ...)). Exists specifically so cli.ts
                               # and server.ts can never drift out of sync — one pipeline, two
                               # entry points.
    data/                      # apiFootballClient.ts, fetchMatch.ts, types/apiFootball.ts
    news/
      fetchFeed.ts             # fetchFeedItems(feedUrl) -> {title, link, publishedAt, summary}[]
      extractArticle.ts        # extractArticleText(url) -> best-effort article text (cheerio,
                                # prefers <article>, falls back to highest-paragraph-density block)
    audio/
      elevenLabs.ts             # generateSpeech(text) -> {audioFilePath, staticFilePath, durationSeconds}
      resolveAudio.ts            # resolveSegmentAudio — wires real/estimated durations per segment
    model/
      Segment.ts                 # DONE — Zod schemas. visualSchema: discriminated union of ~21
                                  # visual kinds (statburst, sequence, barchart, icon, zone, shape,
                                  # tactical-board, formation, shot-map, player-comparison,
                                  # goal-sequence, momentum-timeline, single-stat, radar,
                                  # vertical-tactical-board, quote, league-table, career-path,
                                  # pass-network, heat-map, analysis). segmentSchema: chapter |
                                  # statement. TimedSegment adds durationSeconds, audio/sfx static
                                  # paths, camera stages, transitionOut/transitionStyle,
                                  # backgroundImage mode/side, iconImage, panelColor, jerseyImages.
    script/
      parseSceneScript.ts        # DONE — live parser for the "### SCENE N" format (SCRIPT_TEMPLATE.md
                                  # is the authoritative spec). isSceneScript() checks for a
                                  # `### SCENE \d+` marker to pick this parser.
      parseAnalysisScript.ts     # legacy fallback parser for the old [INTRO]/[STAT: x]/[MOMENT: n]
                                  # tag format — still used by generate.ts when isSceneScript() is
                                  # false, still has its own test file, but not the target format
                                  # for new scripts.
      estimateDuration.ts        # duration estimation when no real audio has been generated yet
    render/renderVideo.ts        # generic: renderVideo(compositionId, inputProps, outputPath),
                                  # live terminal progress bar.
    video/
      theme.ts                   # Bebas Neue (DISPLAY_FONT_FAMILY) / Barlow Condensed (FONT_FAMILY), COLORS
      Root.tsx                   # single Remotion <Composition id="AnalysisVideo"> (1920x1080),
                                  # calculateMetadata derives duration from segments+transitions
      tacticalPatterns.ts        # named-pattern library for TacticalBoard (see SCRIPT_TEMPLATE.md
                                  # Pattern Library) — audited 2026-07-11 for arrow-direction and
                                  # opposition-marker correctness, see file comments
      compositions/               # ~24 card components, one per visual kind (StatBurstCard,
                                   # SequenceCard, BarChartCard, IconInfographicCard, ZoneMapCard,
                                   # TacticalBoard, VerticalTacticalBoard, Formation, ShotMap,
                                   # PlayerComparison, GoalSequence, MomentumTimeline,
                                   # SingleStatCard, RadarChart, QuoteCard, LeagueTableCard,
                                   # CareerPathCard, PassNetworkCard, HeatMapCard, AnalysisBoard,
                                   # ChapterCard, StatementCard, plus shared SceneFrame/
                                   # BackgroundArt/MotionBackdrop/Pitch/VerticalPitch/arrows)
                                   # AnalysisVideo.tsx sequences TimedSegments via <Series>.
```

## Script format

**`SCRIPT_TEMPLATE.md` (repo root) is the authoritative, detailed spec — read it before writing
or reviewing any script.** It covers every Scene Type's exact `Data` JSON shape, the Camera
Language, the Pattern Library, background-image rules, and the pacing/story-structure rule
(entrance → light stat → analysis, mixing visual types).

A legacy, simpler tag format still parses as a fallback for non-scene-format input
(`parseAnalysisScript.ts`):
```
[INTRO]
Tottenham 1-4 Brighton, and this one got away from Spurs fast.

[STAT: possession]
Brighton dominated the ball, 67% to 33%, and it showed in the final third.

[MOMENT: 17]
Solanke opened the scoring from the penalty spot in the 17th minute...

[OUTRO]
A statement win for Brighton on the road.
```
Do not write new scripts in this format — it's kept only because `generate.ts` still routes to it
when a script doesn't match the `### SCENE N` marker.

## Current status

The pipeline described above is built and working end-to-end via both `npm run generate --
--script <path> [--audio]` and `npm run ui` (self-serve web app at `public-ui/index.html`, backed
by `src/server.ts`). Only one commit exists in git history (`Create new Remotion video`, the
initial Remotion scaffold) — everything described in this file is currently **uncommitted working
tree state**, not yet checkpointed in git.

Known gaps / next things to look at, not active work:
- `.env.example` only lists `API_FOOTBALL_KEY` — the real `.env` also needs `ELEVENLABS_API_KEY`,
  and `.env.example` should be updated to match so a fresh setup doesn't miss it.
- `config/news-sources.json` has exactly one feed configured (BBC Sport Football). Adding more
  sources is just adding entries, no code change needed.
- Explicitly deferred, not active: background music, multi-match video beyond what the news
  pipeline already enables, further TacticalBoard pattern-library additions beyond what
  `analyses/` scripts have needed so far (ask before adding a new named pattern — see
  SCRIPT_TEMPLATE.md's Pattern Library section).

## User action already done

Both `API_FOOTBALL_KEY` and `ELEVENLABS_API_KEY` are in `.env` (user completed both signups —
API-Football via dashboard.api-football.com direct signup, ElevenLabs via elevenlabs.io). No
further account setup blocking.
