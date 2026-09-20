import { Suspense } from "react";
import { getLotesEnvase } from "@/app/actions/envase";
import EnvaseClient from "./EnvaseClient";

export default async function EnvasePage() {
  const lotes = await getLotesEnvase();
  return (
    <Suspense>
      <EnvaseClient initialLotes={lotes} />
    </Suspense>
  );
}
