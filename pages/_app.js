import "@/styles/globals.css";
import { ThemeProvider } from "next-themes";
import { LocaleProvider } from "@/components/providers/locale-provider";
import RuntimeTranslationBridge from "@/components/providers/runtime-translation-bridge";

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LocaleProvider>
        <RuntimeTranslationBridge />
        <Component {...pageProps} />
      </LocaleProvider>
    </ThemeProvider>
  );
}
