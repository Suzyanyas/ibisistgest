"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login } from "@/app/actions/auth";

export default function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const err = await login(email, password);
      if (err) {
        setError("Email ou senha incorretos.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Email ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#E8F4FF" }}
    >
      <div
        className="w-full bg-white"
        style={{ maxWidth: 420, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", padding: 40 }}
      >
        {/* Logo only — subtitle is already inside the logo image */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/icons/ibisistlogo.png"
            alt="Ibisist"
            width={220}
            height={90}
            priority
            className="object-contain"
          />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-sm"
              style={{ color: "#1A3A6B", fontWeight: 600 }}
            >
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              style={{ height: 42 }}
              placeholder="seu@email.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-sm"
              style={{ color: "#1A3A6B", fontWeight: 600 }}
            >
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 w-full pr-10"
                style={{ height: 42 }}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-xs select-none"
                tabIndex={-1}
                style={{ minHeight: "unset" }}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg text-white hover:brightness-110 transition disabled:opacity-60 mt-1"
            style={{ backgroundColor: "#1565C0", height: 48, fontSize: 16, fontWeight: 700 }}
          >
            {loading ? "Entrando..." : "ENTRAR"}
          </button>
        </form>
      </div>
    </div>
  );
}
