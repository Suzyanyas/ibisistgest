import { redirect } from "next/navigation";
// AUTH TEMPORARILY DISABLED for client testing — restore original body below to re-enable
// import { createClient } from "@/lib/supabase/server";
// import LoginClient from "./LoginClient";

export default async function LoginPage() {
  redirect("/");
  // Original auth-enabled body:
  // const supabase = await createClient();
  // const { data: { user } } = await supabase.auth.getUser();
  // if (user) redirect("/");
  // return <LoginClient />;
}
