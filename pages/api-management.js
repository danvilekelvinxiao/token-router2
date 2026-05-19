import { useEffect } from "react";
import { useRouter } from "next/router";

export default function ApiManagementRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/guide"); }, [router]);
  return null;
}
