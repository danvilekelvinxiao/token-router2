import Head from "next/head";
import { useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import TeamSpaceConsole from "@/components/team/TeamSpaceConsole";

export default function TeamSpacePage() {
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("flowapi_customer");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  return (
    <>
      <Head><title>团队空间 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/team">
        <TeamSpaceConsole initialTab="overview" />
      </ConsoleLayout>
    </>
  );
}
