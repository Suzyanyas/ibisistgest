"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/actions/auth";

const navLinks = [
  { label: "DASHBOARD", href: "/" },
  { label: "FÓRMULAS", href: "/formulas" },
  { label: "PRODUÇÃO", href: "/producao" },
  { label: "ENVASE", href: "/envase" },
  { label: "ESTOQUE INSUMOS", href: "/estoque-insumos" },
  { label: "PRODUTO ACABADO", href: "/produto-acabado" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav style={{ backgroundColor: "#1565C0" }} className="w-full shadow-md border-b border-blue-700">
      <div
        className="max-w-screen-xl mx-auto px-4 flex items-center justify-between flex-wrap gap-2"
        style={{ minHeight: 68 }}
      >
        {/* Logo */}
        <Link href="/">
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
          className="md:hidden flex flex-col gap-1 p-2 rounded focus:outline-none"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Menu"
          style={{ minHeight: 40 }}
        >
          <span className="block w-6 h-0.5 bg-white"></span>
          <span className="block w-6 h-0.5 bg-white"></span>
          <span className="block w-6 h-0.5 bg-white"></span>
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
                    className={`px-3 py-1.5 rounded transition-colors ${
                      isActive
                        ? "text-white underline underline-offset-4"
                        : "text-blue-100 hover:text-white"
                    }`}
                    style={{ fontFamily: "var(--font-nunito), system-ui, sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: "0.05em" }}
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
              className="ml-2 px-3 py-1.5 rounded-lg text-white transition-colors"
              style={{
                fontFamily: "var(--font-nunito), system-ui, sans-serif",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "0.05em",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.5)",
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
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
                  style={{ fontSize: 14 }}
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
