import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers();
  const fakeReq = {
    headers: { get: (name: string) => headerList.get(name) },
  } as unknown as Request;
  const auth = await requireUser(fakeReq);
  if (!auth) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={auth.user.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
