import type { Metadata } from "next";
import Link from "next/link";
import { UserSwitcher } from "@/components/UserSwitcher";
import { getSessionUser, listUsers } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import "./globals.css";

export const metadata: Metadata = {
  title: "Internal Tools",
  description: "Internal tools platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, users] = await Promise.all([getSessionUser(), listUsers()]);
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="bg-gray-900 text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/" className="font-semibold">
                Internal Tools
              </Link>
              <Link href="/" className="text-gray-300 hover:text-white">
                Apps
              </Link>
              {user && hasRole(user.role, "reviewer") && (
                <Link href="/audit" className="text-gray-300 hover:text-white">
                  Audit log
                </Link>
              )}
            </nav>
            <UserSwitcher users={users} currentId={user?.id} />
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </body>
    </html>
  );
}
