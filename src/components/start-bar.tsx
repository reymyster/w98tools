import { useState } from "react";
import { StartBarTime } from "./start-bar-time";
import { useWindowMangager } from "./window-manager";

export function StartBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const reset = useWindowMangager((state) => state.reset);
  const addWindow = useWindowMangager((state) => state.addWindow);

  const onReset = () => {
    reset();
    setMenuOpen(false);
  };

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
        checked={menuOpen}
        onChange={(e) => setMenuOpen(e.target.checked)}
      />
      <div id="start-menu">
        <div id="start-menu-title">
          Windows<span>98</span> Styled Tools
        </div>
        <ul className="my-0">
          <li
            className="cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white"
            onClick={() => {
              addWindow("SearchReplace");
              setMenuOpen(false);
            }}
          >
            <img
              className="mr-2 w-8"
              src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAUVBMVEUAAACGhoYAgID4+Phm//+ZzMyZ///AwMAAAADM///x8fHM7P/q6upmzMymyvDM/8zd3d2Z/8zj4+MzmZnMzMxmzP9m/8wzzMwzzP/X19f///8yWdUJAAAAAXRSTlMAQObYZgAAAAFiS0dEGnVn5DIAAAAHdElNRQfiBhoALTAhTzgxAAABUklEQVQ4y5WT27aCMAxEJZByqYkFqR7//0fPpKUW0BeH4svsziQuvVx+UNOcz1HU0ukcEerYuf2hnobhEJA1TuPkPc5Vhr6pBLlst5MRo/de6RMwG5evsG8jAnZA9s22yze8jICwB8ZpKEL8rBawvAFyk7fZsmbdAvaArwHqsaUM97tIAVBQbjtdHApshb5dKpAGm+Hgg9WxTRDeAPybpma7i69RHaUGqYAf0axshzkHrG1JICtNT0ai2gpoqIBXh2iGLSodP2wFa8gVhKVSgOPIHYgYLaBvSwK5tJcKdyAk4qL5oQA2AaslR4ZpPpUG2QCNjzibm/yYAqwhJWCCjlmzkxih0rABSH5s2SLP+Ewr5AarIOYt2N4/eVrAmhu2Ic9KE4QKXIaT7rVBmv3PulnCC1rXF552l7ADlhDCy7D2GwDirP4I4N941tH/nPfsf9M/lngcOlIX3Z0AAAAldEVYdGRhdGU6Y3JlYXRlADIwMTgtMDYtMjZUMDA6NDU6NDgtMDQ6MDBhJQfuAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDE4LTA2LTI2VDAwOjQ1OjQ4LTA0OjAwEHi/UgAAAABJRU5ErkJggg=="
            />
            Search &amp; Replace
          </li>
          <li
            className="cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white"
            onClick={onReset}
          >
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
