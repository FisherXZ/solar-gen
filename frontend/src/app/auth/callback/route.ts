import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    // Capture error details from Supabase/OAuth provider redirect
    const errorDesc =
      searchParams.get("error_description") ||
      searchParams.get("error") ||
      "No authorization code received";
    const message = encodeURIComponent(errorDesc);
    return NextResponse.redirect(`${origin}/login?error=auth&message=${message}`);
  }

  const response = NextResponse.redirect(origin);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const message = encodeURIComponent(error.message || "Authentication failed");
    return NextResponse.redirect(`${origin}/login?error=auth&message=${message}`);
  }

  return response;
}
