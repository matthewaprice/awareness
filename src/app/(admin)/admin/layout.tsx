import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import type { SessionWithRole } from "@/types";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = (await getServerSession(authOptions)) as SessionWithRole | null;

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/auth/login");
  }

  return (
    <div className="flex min-h-screen">
      <nav className="w-56 shrink-0 border-r bg-muted/30 p-4">
        <h2 className="mb-4 text-lg font-semibold">Admin Panel</h2>
        <ul className="grid gap-1 text-sm">
          <li>
            <Link href="/admin/dashboard" className="block rounded-md px-3 py-2 hover:bg-accent">
              Dashboard
            </Link>
          </li>
          <li>
            <Link href="/admin/users" className="block rounded-md px-3 py-2 hover:bg-accent">
              Users
            </Link>
          </li>
          <li>
            <Link href="/admin/surveys" className="block rounded-md px-3 py-2 hover:bg-accent">
              Surveys
            </Link>
          </li>
          <li>
            <Link href="/admin/content" className="block rounded-md px-3 py-2 hover:bg-accent">
              Content
            </Link>
          </li>
          <li>
            <Link href="/admin/physicians" className="block rounded-md px-3 py-2 hover:bg-accent">
              Physicians
            </Link>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
