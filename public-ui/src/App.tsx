import { NavLink, useLocation } from "react-router-dom";
import { GeneratePage } from "./pages/GeneratePage";
import { NewsPage } from "./pages/NewsPage";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-bold px-4 py-2 rounded-full border-2 border-border transition-colors ${
    isActive ? "bg-accent-ink text-white" : "bg-panel text-text-dim hover:text-text"
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
      {/* A bold flat-color top bar, not a blended header — the defining
          neo-brutalist move: full-bleed color block, thick black bottom
          border, no gradient/shadow softening it into the page background. */}
      <header className="bg-accent border-b-2 border-border">
        <div className="max-w-[1120px] mx-auto px-5 py-4 flex items-center justify-between">
          <h1 className="text-[22px] font-extrabold tracking-tight text-accent-ink">
            Match Recap Generator
          </h1>
          <nav className="flex gap-1 bg-white/60 border-2 border-border rounded-full p-1">
            <NavLink to="/" end className={navLinkClass}>
              Generate
            </NavLink>
            <NavLink to="/news" className={navLinkClass}>
              News Scraper
            </NavLink>
          </nav>
        </div>
      </header>

      <div className="max-w-[1120px] mx-auto px-5 pt-8 pb-20">
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
