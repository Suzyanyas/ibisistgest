"use client";

import { useId, useRef, useState } from "react";

// ─── Tamanhos ─────────────────────────────────────────────────────────────────

export type SizeKey = "200ml" | "500ml" | "1l" | "2l" | "5l" | "20l";

export const SIZES: { key: SizeKey; label: string }[] = [
  { key: "200ml", label: "200 ML" },
  { key: "500ml", label: "500 ML" },
  { key: "1l", label: "1L" },
  { key: "2l", label: "2L" },
  { key: "5l", label: "5L" },
  { key: "20l", label: "20L" },
];

export type SizeValues = Record<SizeKey, number>;

// ─── Shared UI ────────────────────────────────────────────────────────────────

export function normalizar(str: string): string {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
    >
      <div
        className={`bg-white w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}
        style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ backgroundColor: "#1565C0", borderRadius: "12px 12px 0 0" }}
        >
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="modal-close text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" style={{ color: "#1A3A6B" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputCls =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 w-full";

export function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{msg}</p>
  );
}

// Lista suspensa com busca que ignora acentos e maiúsculas
export type SearchOption = { value: string; label: string };

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Pesquisar...",
  emptyLabel,
  disabled,
}: {
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Quando informado, adiciona uma opção que limpa a seleção (value "")
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const selecionada = options.find((o) => o.value === value);
  const todas: SearchOption[] = emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options;
  const q = normalizar(query.trim());
  const filtradas = q ? todas.filter((o) => o.value === "" ? false : normalizar(o.label).includes(q)) : todas;

  function escolher(o: SearchOption) {
    onChange(o.value);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtradas[active]) escolher(filtradas[active]);
    } else if (e.key === "Escape") {
      if (open) e.stopPropagation();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className={inputCls}
        disabled={disabled}
        placeholder={selecionada ? undefined : (emptyLabel ?? placeholder)}
        value={open ? query : (selecionada?.label ?? "")}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listaId}
        aria-autocomplete="list"
      />
      {open && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {filtradas.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">Nenhum resultado.</li>
          )}
          {filtradas.map((o, i) => (
            <li
              key={o.value || "__vazio"}
              role="option"
              aria-selected={o.value === value}
              // mouseDown (e não click) para agir antes do blur do campo
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o);
              }}
              onMouseEnter={() => setActive(i)}
              className="px-3 py-2 text-sm cursor-pointer"
              style={{
                backgroundColor: i === active ? "#E8F4FF" : undefined,
                color: o.value === "" ? "#6B7A99" : "#1A3A6B",
                fontWeight: o.value === value ? 600 : 400,
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
