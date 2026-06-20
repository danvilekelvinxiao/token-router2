import "@/styles/globals.css";
import { ThemeProvider } from "next-themes";
import { LocaleProvider } from "@/components/providers/locale-provider";
import QueryProvider from "@/components/providers/query-provider";
import GlobalCommandPalette from "@/components/providers/global-command-palette";
import RuntimeTranslationBridge from "@/components/providers/runtime-translation-bridge";
import { Toaster } from "sonner";

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryProvider>
        <LocaleProvider>
          <RuntimeTranslationBridge />
          <GlobalCommandPalette />
          <Component {...pageProps} />
          <Toaster position="top-center" richColors closeButton />
        </LocaleProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
