"use client";

import { WifiIcon, WifiOffIcon, Loader2Icon, CloudIcon } from "lucide-react";
import { type ConnectionStatus } from "@/hooks/use-connection-status";

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
}

const statusConfig: Record<
  ConnectionStatus,
  {
    icon: typeof WifiIcon;
    label: string;
    color: string;
    bgColor: string;
    animate: boolean;
  }
> = {
  connected: {
    icon: CloudIcon,
    label: "Synced",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 border-emerald-200",
    animate: false,
  },
  connecting: {
    icon: Loader2Icon,
    label: "Connecting...",
    color: "text-amber-600",
    bgColor: "bg-amber-50 border-amber-200",
    animate: true,
  },
  disconnected: {
    icon: WifiOffIcon,
    label: "Offline — changes saved locally",
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200",
    animate: false,
  },
  syncing: {
    icon: Loader2Icon,
    label: "Syncing...",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
    animate: true,
  },
};

export function ConnectionStatusIndicator({
  status,
}: ConnectionStatusIndicatorProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-300 ${config.bgColor} ${config.color}`}
    >
      <Icon
        className={`size-3.5 ${config.animate ? "animate-spin" : ""}`}
      />
      <span>{config.label}</span>
    </div>
  );
}
