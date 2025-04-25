import { StartBar } from "./start-bar";

export function WindowManager() {
  return (
    <div className="h-svh grid grid-rows-[auto_3.1rem] bg-gradient-to-br from-slate-300 to-[#008080]">
      <main className="p-4">
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
              <li>Search & Replace</li>
              <li>Split</li>
            </ul>
            <p>Prettify</p>
            <ul>
              <li>JSON</li>
              <li>SQL</li>
            </ul>
          </div>

          <div className="status-bar">
            <p className="status-bar-field">Press F1 for help</p>
            <p className="status-bar-field">Implementated: 14%</p>
          </div>
        </div>
      </main>
      <StartBar />
    </div>
  );
}
