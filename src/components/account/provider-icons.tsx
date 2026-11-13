import Image from "next/image";
import { KeyRound } from "lucide-react";

import type { AuthProviderId } from "@/lib/fleet/account/identity";

/**
 * Sign-in provider marks. Google uses its official "G" image; the others are drawn in
 * currentColor so they follow the product's theme in light and dark mode.
 */
export function ProviderIcon({ provider, className = "size-4" }: { provider: AuthProviderId | "password"; className?: string }) {
  switch (provider) {
    case "google":
      return (
        <Image
          src="https://developers.google.com/static/identity/images/g-logo.png"
          alt=""
          width={16}
          height={16}
          className={className}
        />
      );
    case "microsoft":
      return (
        <svg viewBox="0 0 23 23" aria-hidden="true" className={className} fill="currentColor">
          <rect x="1" y="1" width="10" height="10" />
          <rect x="12" y="1" width="10" height="10" opacity="0.75" />
          <rect x="1" y="12" width="10" height="10" opacity="0.75" />
          <rect x="12" y="12" width="10" height="10" opacity="0.5" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
      );
    case "apple":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
        </svg>
      );
    default:
      return <KeyRound className={className} aria-hidden="true" />;
  }
}
