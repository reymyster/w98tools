import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/replace")({
  component: SearchAndReplace,
});

function SearchAndReplace() {
  const navigate = useNavigate();

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto flex flex-col gap-2 lg:gap-4">
      <div>
        <div className="window w-full">
          <div className="title-bar">
            <div className="title-bar-text">Search &amp; Replace</div>
            <div className="title-bar-controls">
              <button
                aria-label="Close"
                onClick={() => navigate({ to: "/" })}
              />
            </div>
          </div>

          <div className="window-body">
            <div className="field-row-stacked">
              <label htmlFor="txt_source">Source Text</label>
              <textarea rows={8} id="txt_source"></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
