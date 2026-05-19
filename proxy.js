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
  matcher: "/:path*",
};
