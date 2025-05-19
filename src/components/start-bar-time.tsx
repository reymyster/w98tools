import { useState, useEffect, useRef } from "react";

export function StartBarTime() {
  const [time, setTime] = useState<string>(getFormattedTime());
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const updateTime = () => setTime(getFormattedTime());
    updateTime();

    const now = new Date();
    const msToNextMinute =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    const timeoutId = window.setTimeout(() => {
      updateTime();
      intervalRef.current = window.setInterval(updateTime, 60 * 1000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div
      id="status-time"
      className="h-full w-[5rem] flex items-center justify-center font-mono font-light text-base shadow-[0_2px_white,_0_-2px_#7d7d7d,_-2px_-2px_#7d7d7d,_2px_2px_white,_-2px_2px_#7d7d7d,_2px_-2px_white] grow-0"
    >
      {time}
    </div>
  );
}

function getFormattedTime(): string {
  const date = new Date();
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr}${ampm}`;
}
