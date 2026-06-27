"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { HistoryIcon, RotateCcwIcon, PlusIcon, Loader2Icon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getVersions,
  createVersion,
  restoreVersion,
} from "@/lib/actions";

interface VersionHistoryPanelProps {
  documentId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

interface Version {
  id: string;
  name: string;
  createdAt: Date;
  author: { name: string; avatar: string | null };
}

export function VersionHistoryPanel({ documentId, role }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getVersions(documentId);
      setVersions(result);
    } catch {
      toast.error("Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, documentId, loadVersions]);

  const handleCreateVersion = async () => {
    setIsCreating(true);
    try {
      await createVersion(documentId, {
        name: versionName || `Snapshot ${new Date().toLocaleString()}`,
      });
      toast.success("Version snapshot created");
      setVersionName("");
      loadVersions();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create version"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId);
    try {
      await restoreVersion(documentId, versionId);
      toast.success(
        "Document restored to selected version. Reload to see changes."
      );
      // Reload to pick up the restored state
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore version"
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <HistoryIcon className="size-4" />
          <span className="hidden sm:inline">History</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="size-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            View and restore previous snapshots of this document.
          </DialogDescription>
        </DialogHeader>

        {/* Create new version */}
        {role !== "VIEWER" && (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="Snapshot name (optional)"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateVersion();
                }}
                disabled={isCreating}
              />
              <Button
                onClick={handleCreateVersion}
                disabled={isCreating}
                size="sm"
                className="shrink-0"
              >
                {isCreating ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlusIcon className="size-4" />
                )}
                Save
              </Button>
            </div>
            <Separator />
          </>
        )}

        {/* Version list */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HistoryIcon className="size-8 mx-auto mb-2 opacity-50" />
              <p>No versions yet</p>
              <p className="text-xs mt-1">
                Create a snapshot to save the current state
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {version.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(version.createdAt), {
                        addSuffix: true,
                      })}{" "}
                      by {version.author.name}
                    </p>
                  </div>
                  {role !== "VIEWER" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={restoringId === version.id}
                          className="ml-2 shrink-0"
                        >
                          {restoringId === version.id ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcwIcon className="size-3.5" />
                          )}
                          <span className="ml-1">Restore</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Restore to &quot;{version.name}&quot;?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            The current document state will be automatically saved
                            as a snapshot before restoring. Other collaborators
                            will see the restored version.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRestore(version.id)}
                          >
                            Restore
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
