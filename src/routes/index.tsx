import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="h-svh flex justify-center items-center">
      <div className="window w-72">
        <div className="title-bar">
          <div className="title-bar-text">Welcome!</div>
          <div className="title-bar-controls">
            <button aria-label="Help" />
            <button aria-label="Close" />
          </div>
        </div>

        <div className="window-body">
          <p className="text-center">Welcome Home!</p>
        </div>
      </div>
    </div>
  );
}
