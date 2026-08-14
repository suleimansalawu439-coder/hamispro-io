import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Moon, Search, Sun, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { AdSlot } from "./ContentPrimitives";

const navItems = [
  ["Hacks", "/category/hacks"],
  ["Prompts", "/category/prompts"],
  ["Freebies", "/vault"],
  ["Tutorials", "/category/tutorials"],
  ["News", "/category/news"],
] as const;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  return <div className="site-shell">
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">H</span>
          <span className="brand-word">hamispro<span>.io</span></span>
        </Link>
        <nav className="nav-links" aria-label="Primary navigation">
          {navItems.map(([label, href]) => <Link key={href} href={href} className={location === href || location.startsWith(`/category/${href.split("/").pop()}`) ? "active" : ""}>{label}</Link>)}
        </nav>
        <div className="header-actions">
          <Link href="/search" className="search-button" aria-label="Search"><Search size={15} /><span>Search</span></Link>
          <button className="icon-button" aria-label="Toggle dark mode" onClick={toggleTheme}>{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</button>
          <button className="icon-button mobile-menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
        {menuOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map(([label, href]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}</nav>}
      </div>
    </header>
    <main>{children}</main>
    <AdSlot variant="anchor" />
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div><Link href="/" className="brand"><span className="brand-mark">H</span><span className="brand-word">hamispro<span>.io</span></span></Link><p>Useful signal for the age of AI. Hacks, tools, prompts, tutorials, and the context behind the news.</p></div>
        <div className="footer-links"><Link href="/about">About</Link><Link href="/newsletter">Newsletter</Link><Link href="/admin">Owner login</Link></div>
      </div>
    </footer>
  </div>;
}
