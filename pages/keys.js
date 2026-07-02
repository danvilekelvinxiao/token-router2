import { useEffect } from "react";
import { useRouter } from "next/router";

export default function KeysLegacyRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/api-management");
  }, [router]);

  return null;
}
