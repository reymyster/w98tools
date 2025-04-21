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
          <p>Welcome Home!</p>
          <ul>
            <li>Try to enjoy!</li>
          </ul>
        </div>

        <div className="status-bar">
          <p className="status-bar-field">Press F1 for help</p>
          <p className="status-bar-field">&nbsp;</p>
          <p className="status-bar-field">Implementation: 14%</p>
        </div>
      </div>
    </div>
  );
}
