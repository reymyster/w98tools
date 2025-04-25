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

  return <div id="status-time">{time}</div>;
}

function getFormattedTime(): string {
  const date = new Date();
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr}${ampm}`;
}
