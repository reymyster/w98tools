import { StartBarTime } from "./start-bar-time";

export function StartBar() {
  return (
    <aside
      id="start-bar"
      className="bg-[#c0c0c0] z-[999999999] shadow-[0_-2px_#fffdfc,_0_-4px_#cce9eb] p-[0.5rem] flex justify-between"
    >
      <label id="start-button"></label>
      <StartBarTime />
    </aside>
  );
}
