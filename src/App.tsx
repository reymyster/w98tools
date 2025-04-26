import "./App.css";
import "98.css";
import { Toaster } from "@/components/ui/sonner";

import { WindowManager } from "@/components/window-manager";

function App() {
  return (
    <>
      <WindowManager />
      <Toaster />
    </>
  );
}

export default App;
