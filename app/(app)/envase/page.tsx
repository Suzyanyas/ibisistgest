import { Suspense } from "react";
import { getLotesEnvase } from "@/app/actions/envase";
import { getUserRole } from "@/app/actions/auth-role";
import EnvaseClient from "./EnvaseClient";

export default async function EnvasePage() {
  const lotes = await getLotesEnvase();
  const role = await getUserRole();
  return (
    <Suspense>
      <EnvaseClient initialLotes={lotes} isAdmin={role === "admin"} />
    </Suspense>
  );
}
