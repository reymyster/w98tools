import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import appCss from "~/styles/app.css?url";
import { seo } from "~/utils/seo";

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
      ...seo({
        title: "W98Tools",
        description: `Some helpful tools, in an old-school Windows-themed interface.`,
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: "https://unpkg.com/98.css" },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    );
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body className="h-svh grid grid-rows-[120px_auto] md:grid-rows-1 md:grid-cols-[200px_auto] bg-gradient-to-br from-slate-100 to-slate-400">
        <aside className="p-2 h-[120px] md:h-svh">
          <ul className="tree-view h-full">
            <li>
              <Link
                to="/"
                activeProps={{ className: "font-bold" }}
                activeOptions={{ exact: true }}
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                to="/posts"
                activeProps={{ className: "font-bold" }}
                activeOptions={{ exact: true }}
              >
                Posts
              </Link>
            </li>
            <li>
              String Utils
              <ul>
                <li>
                  <Link
                    to="/replace"
                    activeProps={{ className: "font-bold" }}
                    activeOptions={{ exact: true }}
                  >
                    Search &amp; Replace
                  </Link>
                </li>
                <li>Split</li>
              </ul>
            </li>
          </ul>
        </aside>
        <main className="h-[calc(100svh_-_120px)] md:h-svh md:max-h-svh overflow-auto">
          {children}
        </main>
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
