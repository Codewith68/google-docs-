"use client";

import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { SiGoogledocs } from "react-icons/si";
import { DocumentMenu } from "./document-menu";

interface Document {
  id: string;
  title: string;
  ownerId: string;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { name: string; avatar: string | null };
}

interface DocumentsTableProps {
  documents: Document[];
}

export const DocumentsTable = ({ documents }: DocumentsTableProps) => {
  const router = useRouter();

  return (
    <div className="max-w-screen-xl mx-auto px-16 py-6">
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <SiGoogledocs className="size-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">No documents found</p>
          <p className="text-sm mt-1">Create a new document to get started</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-sm text-muted-foreground">
              <th className="py-3 pr-4 font-medium">Name</th>
              <th className="py-3 pr-4 font-medium hidden md:table-cell">
                Owner
              </th>
              <th className="py-3 pr-4 font-medium hidden md:table-cell">
                Last modified
              </th>
              <th className="py-3 w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr
                key={doc.id}
                onClick={() => router.push(`/documents/${doc.id}`)}
                className="cursor-pointer border-b hover:bg-muted/50 transition-colors"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <SiGoogledocs className="size-5 text-blue-500 shrink-0" />
                    <span className="font-medium truncate">{doc.title}</span>
                  </div>
                </td>
                <td className="py-3 pr-4 hidden md:table-cell text-sm text-muted-foreground">
                  {doc.owner.name}
                </td>
                <td className="py-3 pr-4 hidden md:table-cell text-sm text-muted-foreground">
                  {format(new Date(doc.updatedAt), "MMM d, yyyy")}
                </td>
                <td className="py-3">
                  <DocumentMenu
                    documentId={doc.id}
                    title={doc.title}
                    ownerId={doc.ownerId}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
