import "./App.css";
import "98.css";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <>
      <div className="h-svh p-2 bg-gradient-to-br from-slate-100 to-slate-400">
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
      </div>
      <Toaster />
    </>
  );
}

export default App;
