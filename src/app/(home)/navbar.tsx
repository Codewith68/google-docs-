"use client";

import Link from "next/link";
import Image from "next/image";
import { SearchIcon } from "lucide-react";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { useSearchParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Navbar = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search.trim()) {
      params.set("search", search.trim());
    } else {
      params.delete("search");
    }
    router.push(`/?${params.toString()}`);
  };

  const handleClear = () => {
    setSearch("");
    const params = new URLSearchParams(searchParams);
    params.delete("search");
    router.push(`/?${params.toString()}`);
  };

  return (
    <nav className="flex items-center justify-between h-full">
      <div className="flex items-center gap-3 shrink-0">
        <Link href="/">
          <Image src="/logo.svg" alt="Logo" width={36} height={36} />
        </Link>
        <h3 className="text-xl font-semibold">CollabDocs</h3>
      </div>
      <div className="flex items-center gap-3 flex-1 justify-center max-w-xl mx-4">
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-2 w-full"
        >
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
            >
              Clear
            </Button>
          )}
        </form>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <OrganizationSwitcher
          afterCreateOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
          afterSelectPersonalUrl="/"
        />
        <UserButton />
      </div>
    </nav>
  );
};
