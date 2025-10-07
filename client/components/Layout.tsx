import { Link, useLocation, useNavigate } from "react-router-dom";
import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

type Tab = { to: string; label: string };

export default function Layout({ children, tabs: propTabs }: { children: React.ReactNode; tabs?: Tab[] }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { theme, setTheme } = useTheme();


  const tabs = propTabs ?? [
    { to: "/", label: "Home" },
    { to: "/admin", label: "Admin" },
    { to: "/student", label: "Student" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background transition-colors duration-200">
      <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">

            <Link to="/" className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold shadow">QZ</span>
              <div className="hidden md:block">
                <div className="text-lg font-bold">QZ-Test</div>
                <div className="text-xs text-muted-foreground -mt-0.5">Secure Test Management</div>
              </div>
            </Link>
          </div>



          <div className="flex items-center gap-3">
            <button
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:scale-105 transition-transform"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:block text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">{user.name}</div>
                  <div className="text-xs">{user.email} · <span className="uppercase">{user.role}</span></div>
                </div>
                <Button variant="outline" size="sm" onClick={() => { logout(); nav("/"); }}>Logout</Button>
              </div>
            ) : (
              <Link to="/" className="text-sm text-muted-foreground">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <div className="container py-8">
        <main className="min-h-[60vh]">{children}</main>
      </div>



      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        {new Date().getFullYear()} QZ-Test · Secure Test Management
        <br />
        Developed by GowthamKollati@2005
      </footer>
    </div>
  );
}
