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
      <div id="start-menu" className="windows-box-shadow">
        <div id="start-menu-title">
          W<span>98</span> <span>Styled Tools</span>
        </div>
        <ul className="my-0">
          <li
            className="cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white shadow-[0_2px_#808280,_0_4px_white]"
            onClick={() => {
              addWindow("Help");
              setMenuOpen(false);
            }}
          >
            <label className="!text-base !subpixel-antialiased !font-sans cursor-pointer">
              <img
                className="mr-2 w-8"
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAALVBMVEUAAAAAAACAAAD/AAAA/wAAgACAgIAAAIAAAP///wCAgAAAgIDAwMAA//////9JSTaIAAAAAXRSTlMAQObYZgAAAAFiS0dEDm+9ME8AAAAHdElNRQfiBhoANyn1CWoqAAABtUlEQVQ4y7WTsWrjQBRFRxgFlXohwpu/CKsvMGg6syCYhw0rQqrUq0LMlHERZkBVyi1TpkwRmA9Q2nSBfIDrfEPejGRrlLW3Su4DC97hzuVKHsa+QRGQju1DEg3Pfg9pAPxEcJrDGZ9YgEFEkxMoFhMQHQHpYTAbYg4APweOmuUsn+X/AT+pRbaA66s9uJh5MIhz3Dd3IQQUnN8DCFzJaXNl4PzvPSAq9WfS3DhwB7hq9WbSfAesVTINmw+gbbXWNe2TXfMBWPukpLMk/QQOsZKNOysxzCRmdDxx1YgyBDXAwx2sxUpXSw9uEg8GLRrVdF3pm7sQB9oN/cy1bpacp2NzWL/ZRwCzbkQnMB2b43Pbkuf2uSJDD9ycvL68U2lrq6IjQ5nump9U2y3/3RpzuySDd/TN45dfBbfGGkMJvaNXvN0WHI0x2kdkI3gvCk/UJwe7LAparI1GFxH8JwQdRRuj8IwM5QgqMghErTcbxNARc6cfipSFESzunIPeFH2/LAsAq1yEczSynly5mBLAGcRchgbGEEuXIHFeT69n7BOkrD8Z6H7KXv9eapjTuj522VP21foAO1apyR+rjO8AAAAldEVYdGRhdGU6Y3JlYXRlADIwMTgtMDYtMjZUMDA6NTU6NDEtMDQ6MDA1M539AAAAJXRFWHRkYXRlOm1vZGlmeQAyMDE4LTA2LTI2VDAwOjU1OjQxLTA0OjAwRG4lQQAAAABJRU5ErkJggg=="
              />
              Update
            </label>
          </li>
          <li
            className="cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white"
            onClick={() => {
              addWindow("SearchReplace");
              setMenuOpen(false);
            }}
          >
            <label className="!text-base !subpixel-antialiased !font-sans cursor-pointer">
              <img
                className="mr-2 w-8"
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAUVBMVEUAAACGhoYAgID4+Phm//+ZzMyZ///AwMAAAADM///x8fHM7P/q6upmzMymyvDM/8zd3d2Z/8zj4+MzmZnMzMxmzP9m/8wzzMwzzP/X19f///8yWdUJAAAAAXRSTlMAQObYZgAAAAFiS0dEGnVn5DIAAAAHdElNRQfiBhoALTAhTzgxAAABUklEQVQ4y5WT27aCMAxEJZByqYkFqR7//0fPpKUW0BeH4svsziQuvVx+UNOcz1HU0ukcEerYuf2hnobhEJA1TuPkPc5Vhr6pBLlst5MRo/de6RMwG5evsG8jAnZA9s22yze8jICwB8ZpKEL8rBawvAFyk7fZsmbdAvaArwHqsaUM97tIAVBQbjtdHApshb5dKpAGm+Hgg9WxTRDeAPybpma7i69RHaUGqYAf0axshzkHrG1JICtNT0ai2gpoqIBXh2iGLSodP2wFa8gVhKVSgOPIHYgYLaBvSwK5tJcKdyAk4qL5oQA2AaslR4ZpPpUG2QCNjzibm/yYAqwhJWCCjlmzkxih0rABSH5s2SLP+Ewr5AarIOYt2N4/eVrAmhu2Ic9KE4QKXIaT7rVBmv3PulnCC1rXF552l7ADlhDCy7D2GwDirP4I4N941tH/nPfsf9M/lngcOlIX3Z0AAAAldEVYdGRhdGU6Y3JlYXRlADIwMTgtMDYtMjZUMDA6NDU6NDgtMDQ6MDBhJQfuAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDE4LTA2LTI2VDAwOjQ1OjQ4LTA0OjAwEHi/UgAAAABJRU5ErkJggg=="
              />
              Search &amp; Replace
            </label>
          </li>
          <li
            id="programs"
            className="cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white group"
          >
            <label className="!text-base !subpixel-antialiased !font-sans cursor-pointer">
              <img
                className="mr-2 w-8"
                src="data:image/png;base64,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"
              />
              String Utilities
            </label>
            <ul className="windows-box-shadow hidden group-hover:block absolute top-2 left-[calc(100%_-_6px)] bg-[silver] list-none m-0 p-0">
              <li>Search &amp; Replace</li>
            </ul>
          </li>
          <li
            className="cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white shadow-[0_2px_#808280,_0_4px_white]"
            onClick={() => {
              addWindow("Help");
              setMenuOpen(false);
            }}
          >
            <label className="!text-base !subpixel-antialiased !font-sans cursor-pointer">
              <img
                className="mr-2 w-8"
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgBAMAAACBVGfHAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAGFBMVEUAAACAAIAAAACAgICAgAD//wDAwMD///9lJw0+AAAAAXRSTlMAQObYZgAAAAFiS0dEBxZhiOsAAAAHdElNRQfiBhgXChR06RP7AAAAvUlEQVQoz3XRUQ6DIAyAYeYNKOwd8QTLEn1eMg+wxF7AB7zBvP7aUlBM5hufP5QEY/58N7iAs7ENHrYVZ20jHDQiwUk4mPF1CAV3RKwNB7i88UMAGnj6LRDKCE9GAKGOmOWMIZQ70JqmwBg08Ljw1CGFcknPaxgJIMoOXlPA8GSRkXZMKRpILHM+Ia1gYPtKIyeknrZsu0oOGLJoYKybsmhgul5Fg0M0qLKXoEoNihyByto8Jsk5ELm+dqfBDwcgN9nfkQsOAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDE4LTA2LTI0VDIzOjEwOjIwLTA0OjAw2N+qCAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAxOC0wNi0yNFQyMzoxMDoyMC0wNDowMKmCErQAAAAASUVORK5CYII="
              />
              Help
            </label>
          </li>
          <li
            className="cursor-pointer h-16 px-2 flex items-center hover:bg-[#0c1b98] hover:text-white"
            onClick={() => {
              window.location.href = "about:blank";
            }}
          >
            <label className="!text-base !subpixel-antialiased !font-sans cursor-pointer">
              <img
                className="mr-2 w-8"
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAKlBMVEUAAACAgIAAAAD////AwMAAgAAA/wCAAAAAgID/AACAgAD//wAAAP8AAIBZpFh1AAAAAXRSTlMAQObYZgAAAAFiS0dEAxEMTPIAAAAHdElNRQfiBhgXEB4kEQA+AAABHklEQVQ4y92QMU7DMBSGU4/ZEldC6uS8tkKELuAshE6tGUjEUokbIA7QQ3AAhFR1QyZTvLWe8ETVsSyciIRWqtF7J+j/b/792e/9QXCCigR93pETOuAyEzQgaYRncZ9COjJ+nFEIvxo+3xFIM9L85QkwwuXZYjirMMLlxXJ+6QqEcHm+fE0s9HGwWYx+4i5BbGH3nUzxH+P7yW7DiammN9noCwNBV72NHwYYYJDIbYa3CHUUKardj8TkA6UUAq57bq0BAAGrnnE5bjy8XcWpW9d7vfuBTmLj5F75v4CBcQdZ4QcBM648+DhzmH1Caq1VyrbWHlHWpiyLOi1ae09VtpUGplt786Zlo/am+LNXYdXU4d88Is1iggoY0dNp6BfBfGAv3Vb5dgAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAxOC0wNi0yNFQyMzoxNjozMC0wNDowMBlr2tEAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMTgtMDYtMjRUMjM6MTY6MzAtMDQ6MDBoNmJtAAAAAElFTkSuQmCC"
              />
              Log Off
            </label>
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
              Reset Windows
            </label>
          </li>
        </ul>
      </div>
      <StartBarTime />
    </aside>
  );
}
