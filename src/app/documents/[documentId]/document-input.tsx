"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";

import { updateDocument } from "@/lib/actions";

interface DocumentInputProps {
  title: string;
  id: string;
  editable?: boolean;
}

export const DocumentInput = ({ title, id, editable = true }: DocumentInputProps) => {
  const [value, setValue] = useState(title);
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || value === title) {
      setValue(title);
      setIsEditing(false);
      return;
    }

    setIsPending(true);
    try {
      await updateDocument(id, { title: value.trim() });
      toast.success("Document renamed");
    } catch {
      toast.error("Failed to rename");
      setValue(title);
    } finally {
      setIsPending(false);
      setIsEditing(false);
    }
  };

  if (!editable) {
    return (
      <span className="text-lg px-1.5 truncate font-semibold">
        {title}
      </span>
    );
  }

  return isEditing ? (
    <form onSubmit={handleSubmit} className="relative w-fit max-w-[50ch]">
      <span className="invisible whitespace-pre px-1.5 text-lg">
        {value || " "}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSubmit}
        className="absolute inset-0 text-lg text-black px-1.5 bg-transparent truncate"
        disabled={isPending}
        autoFocus
      />
    </form>
  ) : (
    <button
      onClick={() => {
        setIsEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }}
      className="text-lg px-1.5 cursor-pointer truncate hover:bg-muted rounded-sm max-w-[50ch] font-semibold text-left"
    >
      {title}
    </button>
  );
};