"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  if (!session?.user) return null;

  return (
    <button
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
      }}
      className="absolute right-4 top-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Log out"
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Log out</span>
    </button>
  );
}
