"use client";

import { Editor } from "./editor";
import { Navbar } from "./navbar";
import { Toolbar } from "./toolbar";

export interface DocumentData {
  id: string;
  title: string;
  initialContent: string | null;
  ownerId: string;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string; avatar: string | null };
  collaborators: {
    id: string;
    role: string;
    user: { id: string; name: string; email: string; avatar: string | null };
  }[];
}

interface DocumentProps {
  document: DocumentData;
  userName: string;
  userColor: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

export const Document = ({
  document,
  userName,
  userColor,
  role,
}: DocumentProps) => {
  return (
    <div className="min-h-screen bg-[#FAFBFD]">
      <div className="flex flex-col px-4 pt-2 gap-y-2 fixed top-0 left-0 right-0 z-10 bg-[#FAFBFD] print:hidden">
        <Navbar data={document} role={role} />
        {role !== "VIEWER" && <Toolbar />}
      </div>
      <div className={`${role !== "VIEWER" ? "pt-[114px]" : "pt-[60px]"} print:pt-0`}>
        <Editor
          documentId={document.id}
          initialContent={document.initialContent}
          userName={userName}
          userColor={userColor}
          role={role}
        />
      </div>
    </div>
  );
};
