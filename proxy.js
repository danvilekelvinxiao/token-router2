import { NextResponse } from "next/server";

export function proxy(request) {
  const host = request.headers.get("host") || "";

  if (host.toLowerCase() === "www.flowapi.fun") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "flowapi.fun";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Only run the www -> apex redirect on document-like requests.
     * Static Next assets must bypass the proxy or the browser can get
     * stuck on server-rendered fallback HTML without loading CSS/JS.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
