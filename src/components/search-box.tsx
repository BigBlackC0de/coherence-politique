import Form from "next/form";
import { Search } from "lucide-react";
import { SITE_NAME } from "@/lib/config/site";

/**
 * Champ de recherche globale : formulaire GET vers /recherche?q=…
 * Utilisable dans un Server Component (aucune fonction en prop) ; `next/form` assure la navigation
 * côté client et fonctionne aussi sans JavaScript.
 *
 *   <SearchBox />                                   compact (en-tête)
 *   <SearchBox size="lg" placeholder="…" />          grand (accueil)
 *   <SearchBox defaultValue={q} autoFocus />         pré-rempli (page de résultats)
 */
export function SearchBox({
  defaultValue = "",
  placeholder = "Rechercher un élu, un vote, un sujet…",
  size = "sm",
  autoFocus = false,
  className = "",
}: {
  defaultValue?: string;
  placeholder?: string;
  size?: "sm" | "lg";
  autoFocus?: boolean;
  className?: string;
}) {
  const lg = size === "lg";
  return (
    <Form action="/recherche" role="search" className={`relative flex items-center ${className}`}>
      <label className="relative flex items-center w-full">
        <span className="sr-only">Rechercher sur {SITE_NAME}</span>
        <Search size={lg ? 18 : 15} className={`absolute pointer-events-none text-ink-3 ${lg ? "left-4" : "left-3"}`} aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          className={`input w-full ${lg ? "!pl-11 !pr-28 !py-3 !text-base" : "!pl-9 !pr-3 !py-1.5 text-sm"}`}
        />
      </label>
      {lg && (
        <button type="submit" className="btn-primary absolute right-1.5 !py-2">
          Chercher
        </button>
      )}
    </Form>
  );
}
