import Link from "next/link";
import { GithubIcon, LinkedinIcon } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-white print:hidden">
      <div className="max-w-screen-xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>Built by</span>
          <span className="font-semibold text-foreground">Subra</span>
          <span>•</span>
          <span>House of Edtech Assignment</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="https://github.com/Codewith68"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <GithubIcon className="size-4" />
            GitHub
          </Link>
          <Link
            href="https://linkedin.com/in/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <LinkedinIcon className="size-4" />
            LinkedIn
          </Link>
        </div>
      </div>
    </footer>
  );
}
