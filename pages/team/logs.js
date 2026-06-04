import Head from "next/head";
import { useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import TeamSpaceConsole from "@/components/team/TeamSpaceConsole";

export default function TeamLogsPage() {
  const [customer] = useState(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("flowapi_customer") || "null"); } catch { return null; }
  });
  return (
    <>
      <Head><title>团队日志 - FlowAPI</title></Head>
      <ConsoleLayout customer={customer || { name: "访客", email: "", id: "", balance: 0, apiKeys: [] }} currentPath="/team">
        <TeamSpaceConsole initialTab="logs" />
      </ConsoleLayout>
    </>
  );
}
