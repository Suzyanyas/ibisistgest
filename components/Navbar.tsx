"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";

const navLinks = [
  { label: "DASHBOARD", href: "/" },
  { label: "ESTOQUE INSUMOS", href: "/estoque-insumos" },
  { label: "FÓRMULAS", href: "/formulas" },
  { label: "PRODUÇÃO", href: "/producao" },
  { label: "ENVASE", href: "/envase" },
  { label: "PRODUTO ACABADO", href: "/produto-acabado" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      style={{
        backgroundColor: "#1565C0",
        boxShadow: "0 4px 20px rgba(21,101,192,0.35)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}
      className="w-full"
    >
      <div
        className="max-w-screen-xl mx-auto px-4 flex items-center justify-between flex-wrap gap-2"
        style={{ minHeight: 72 }}
      >
        {/* Logo */}
        <Link href="/" className="transition-opacity hover:opacity-75">
          <Image
            src="/icons/ibisistlogoheader.png"
            alt="Ibisist"
            width={150}
            height={62}
            priority
            unoptimized
            className="object-contain flex-shrink-0"
          />
        </Link>

        {/* Hamburger button (mobile) */}
        <button
          className="md:hidden flex items-center justify-center p-2 rounded-lg hover:bg-white/10 transition-all focus-visible:ring-2 focus-visible:ring-white/50"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Menu"
          style={{ minHeight: 40, cursor: "pointer" }}
        >
          {menuOpen ? <X size={24} color="white" /> : <Menu size={24} color="white" />}
        </button>

        {/* Nav links (desktop) */}
        <div className="hidden md:flex items-center gap-1 flex-wrap">
          <ul className="flex items-center gap-1 flex-wrap">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`transition-colors focus-visible:ring-2 focus-visible:ring-white/50 ${
                      isActive ? "text-white" : "hover:text-white"
                    }`}
                    style={{
                      fontFamily: "var(--font-nunito), system-ui, sans-serif",
                      fontSize: 14,
                      letterSpacing: "0.05em",
                      padding: "4px 14px",
                      borderRadius: 99,
                      background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
                      color: isActive ? "white" : "rgba(255,255,255,0.75)",
                      fontWeight: isActive ? 700 : 600,
                    }}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <form action={logout}>
            <button
              type="submit"
              className="ml-2 px-3 py-1.5 rounded-lg text-white transition-all hover:bg-white/15 flex items-center gap-1.5"
              style={{
                fontFamily: "var(--font-nunito), system-ui, sans-serif",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "0.05em",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.3)",
                cursor: "pointer",
              }}
            >
              <LogOut size={14} />
              Sair
            </button>
          </form>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-blue-700">
          <ul className="flex flex-col">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block px-6 py-3 font-semibold transition-colors ${
                      isActive
                        ? "text-white underline underline-offset-4 bg-blue-700"
                        : "text-blue-100 hover:text-white hover:bg-blue-700"
                    }`}
                    style={{ fontSize: 14, letterSpacing: "0.05em" }}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <form action={logout}>
                <button
                  type="submit"
                  className="block w-full text-left px-6 py-3 font-semibold text-blue-100 hover:text-white hover:bg-blue-700 transition-colors"
                  style={{ fontSize: 14, cursor: "pointer" }}
                >
                  Sair
                </button>
              </form>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}
