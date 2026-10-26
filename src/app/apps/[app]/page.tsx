import { notFound, redirect } from "next/navigation";
import { listApps } from "@/lib/registry";

export default async function AppPage({ params }: { params: Promise<{ app: string }> }) {
  const { app: appId } = await params;
  const app = listApps().find((a) => a.id === appId);
  if (!app?.resources.length) notFound();
  redirect(`/apps/${app.id}/${app.resources[0].id}`);
}
