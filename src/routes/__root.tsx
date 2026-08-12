import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import appCss from "../styles.css?url";

// runs before paint: stored preference wins, otherwise follow the system
const themeInit = `(function(){var t=localStorage.getItem("gs.theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")})()`

function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="fixed top-2 right-2 z-50"
      title="Toggle light/dark mode"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark")
        localStorage.setItem("gs.theme", dark ? "dark" : "light")
      }}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Gameshow",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // an svg favicon, so one file covers every size the browser asks for
      {
        rel: "icon",
        href: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <HeadContent />
      </head>
      <body>
        <ThemeToggle />
        <TooltipProvider>{children}</TooltipProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
