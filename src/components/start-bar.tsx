import { StartBarTime } from "./start-bar-time";

export function StartBar() {
  return (
    <aside
      id="start-bar"
      className="bg-[#c0c0c0] z-[999999999] shadow-[0_-2px_#fffdfc,_0_-4px_#cce9eb] p-2 items-center flex justify-between"
    >
      <label id="start-button" htmlFor="start-button-input"></label>
      <input
        type="checkbox"
        id="start-button-input"
        name="start-button-input"
        className="hidden"
      />
      <div id="start-menu">
        <div id="start-menu-title">
          Windows<span>98</span> Styled Tools
        </div>
        <ul className="my-0">
          <li className="cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white">
            <label className="!text-base !subpixel-antialiased !font-sans cursor-pointer">
              <img
                className="mr-2 w-8"
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAARVBMVEUAAACGhobAwMB3d3eysrLMzMz4+PjX19eZmZnq6urn59ZNTU2WlpZCQkIzAGYAAIAAAAAzAMwAAP8A/////wBVVVX///99stlUAAAAAXRSTlMAQObYZgAAAAFiS0dEFnzRqBkAAAAHdElNRQfiBhoANBn4/QlFAAAAzUlEQVQ4y83S0Q6DIAwFUGmhYudEdP7/r+6CZEEnvm438emetBDpun+KQW5rQpibtXWOHJHlPedeRHqHQHhm+zXKyKCqMmRhfV53IEb0YUh1EBCIMRH7PIAphEREipgJX71iijER16tAGJ79EShAJrZ3gu4KLMuaCDtqgHVZkwnXAGdYVskzqD3hhRE3IKYV7QkhxHyKBvCDUiKxnsAV2NhrIR9Q9cgGgv8QkAKOfU0KOPeFpGe1g8uHVUgb7MTjAk2QyTjO7T6T2/oHeQPSrw8Qg6bkoQAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAxOC0wNi0yNlQwMDo1MjoyNS0wNDowMOXPqxAAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMTgtMDYtMjZUMDA6NTI6MjUtMDQ6MDCUkhOsAAAAAElFTkSuQmCC"
              />
              Reset
            </label>
          </li>
        </ul>
      </div>
      <StartBarTime />
    </aside>
  );
}
