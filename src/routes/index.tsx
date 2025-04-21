import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="h-full flex justify-center items-center -mt-[60px] md:mt-0 md:-ml-[100px]">
      <div className="window w-72">
        <div className="title-bar">
          <div className="title-bar-text">Home</div>
          <div className="title-bar-controls">
            <button aria-label="Help" />
          </div>
        </div>

        <div className="window-body">
          <p>String Utilities</p>
          <ul>
            <li>
              <Link to={"/replace"}>Search & Replace</Link>
            </li>
            <li>Split</li>
          </ul>
        </div>

        <div className="status-bar">
          <p className="status-bar-field">Press F1 for help</p>
          <p className="status-bar-field">Implementated: 14%</p>
        </div>
      </div>
    </div>
  );
}
