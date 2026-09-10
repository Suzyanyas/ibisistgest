import { getLotesEnvase } from "@/app/actions/envase";
import EnvaseClient from "./EnvaseClient";

export default async function EnvasePage() {
  const lotes = await getLotesEnvase();
  return <EnvaseClient initialLotes={lotes} />;
}
