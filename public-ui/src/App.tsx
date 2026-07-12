import { NavLink, Route, Routes } from "react-router-dom";
import { GeneratePage } from "./pages/GeneratePage";
import { NewsPage } from "./pages/NewsPage";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${
    isActive ? "bg-accent text-white" : "text-text-dim hover:text-text"
  }`;

export const App: React.FC = () => {
  return (
    <div className="min-h-screen">
      <div className="max-w-[1120px] mx-auto px-5 pt-10 pb-20">
        <header className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[2.5px] text-accent">
              Voiceover Match Analysis
            </div>
            <h1 className="text-[26px] font-bold mt-1.5">Match Recap Generator</h1>
          </div>
          <nav className="flex gap-2">
            <NavLink to="/" end className={navLinkClass}>
              Generate
            </NavLink>
            <NavLink to="/news" className={navLinkClass}>
              News Scraper
            </NavLink>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<GeneratePage />} />
          <Route path="/news" element={<NewsPage />} />
        </Routes>
      </div>
    </div>
  );
};
