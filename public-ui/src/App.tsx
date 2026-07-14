import { NavLink, useLocation } from "react-router-dom";
import { GeneratePage } from "./pages/GeneratePage";
import { NewsPage } from "./pages/NewsPage";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-bold px-4 py-2 rounded-full transition-colors ${
    isActive ? "bg-accent text-accent-ink" : "text-text-dim hover:text-text"
  }`;

export const App: React.FC = () => {
  // Both pages stay mounted at all times and are only hidden with CSS —
  // routing through <Route> would unmount whichever page you navigate away
  // from, wiping its local state (script text, in-flight generation
  // progress, fetched news) every time you switch tabs and come back.
  const { pathname } = useLocation();
  const isNews = pathname === "/news";

  return (
    <div className="min-h-screen">
      <div className="max-w-[1120px] mx-auto px-5 pt-10 pb-20">
        <header className="flex items-center justify-between mb-8">
          <div>
            <div className="inline-flex text-[10.5px] font-bold uppercase tracking-[1.5px] text-accent-ink bg-accent px-2.5 py-1 rounded-full">
              Voiceover Match Analysis
            </div>
            <h1 className="text-[32px] font-extrabold tracking-tight mt-2.5">Match Recap Generator</h1>
          </div>
          <nav className="flex gap-1 bg-panel border border-border rounded-full p-1">
            <NavLink to="/" end className={navLinkClass}>
              Generate
            </NavLink>
            <NavLink to="/news" className={navLinkClass}>
              News Scraper
            </NavLink>
          </nav>
        </header>

        <div className={isNews ? "hidden" : ""}>
          <GeneratePage />
        </div>
        <div className={isNews ? "" : "hidden"}>
          <NewsPage />
        </div>
      </div>
    </div>
  );
};
