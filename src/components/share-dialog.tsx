"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Share2Icon,
  UserPlusIcon,
  Loader2Icon,
  TrashIcon,
  PenIcon,
  EyeIcon,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  addCollaborator,
  removeCollaborator,
  updateCollaboratorRole,
} from "@/lib/actions";

interface Collaborator {
  id: string;
  role: string;
  user: { id: string; name: string; email: string; avatar: string | null };
}

interface ShareDialogProps {
  documentId: string;
  collaborators: Collaborator[];
}

export function ShareDialog({ documentId, collaborators }: ShareDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!email.trim()) return;

    setIsAdding(true);
    try {
      await addCollaborator(documentId, { email: email.trim(), role });
      toast.success(`Invited ${email} as ${role.toLowerCase()}`);
      setEmail("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add collaborator"
      );
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (collaboratorId: string) => {
    setRemovingId(collaboratorId);
    try {
      await removeCollaborator(documentId, collaboratorId);
      toast.success("Collaborator removed");
    } catch {
      toast.error("Failed to remove collaborator");
    } finally {
      setRemovingId(null);
    }
  };

  const handleRoleChange = async (
    collaboratorId: string,
    newRole: "EDITOR" | "VIEWER"
  ) => {
    try {
      await updateCollaboratorRole(documentId, {
        collaboratorId,
        role: newRole,
      });
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Share2Icon className="size-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2Icon className="size-5" />
            Share Document
          </DialogTitle>
          <DialogDescription>
            Add collaborators by email and set their access level.
          </DialogDescription>
        </DialogHeader>

        {/* Add collaborator form */}
        <div className="flex gap-2">
          <Input
            placeholder="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            disabled={isAdding}
          />
          <Select
            value={role}
            onValueChange={(v) => setRole(v as "EDITOR" | "VIEWER")}
          >
            <SelectTrigger className="w-[120px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EDITOR">
                <div className="flex items-center gap-1.5">
                  <PenIcon className="size-3.5" />
                  Editor
                </div>
              </SelectItem>
              <SelectItem value="VIEWER">
                <div className="flex items-center gap-1.5">
                  <EyeIcon className="size-3.5" />
                  Viewer
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={isAdding} className="shrink-0">
            {isAdding ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UserPlusIcon className="size-4" />
            )}
          </Button>
        </div>

        <Separator />

        {/* Collaborator list */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            People with access
          </p>
          {collaborators.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No collaborators yet. Add someone by email above.
            </p>
          ) : (
            collaborators.map((collab) => {
              return (
                <div
                  key={collab.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={collab.user.avatar || undefined} />
                      <AvatarFallback>
                        {collab.user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{collab.user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {collab.user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={collab.role}
                      onValueChange={(v) =>
                        handleRoleChange(
                          collab.id,
                          v as "EDITOR" | "VIEWER"
                        )
                      }
                    >
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EDITOR">
                          <div className="flex items-center gap-1.5">
                            <PenIcon className="size-3" />
                            Editor
                          </div>
                        </SelectItem>
                        <SelectItem value="VIEWER">
                          <div className="flex items-center gap-1.5">
                            <EyeIcon className="size-3" />
                            Viewer
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => handleRemove(collab.id)}
                      disabled={removingId === collab.id}
                    >
                      {removingId === collab.id ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <TrashIcon className="size-3.5 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
