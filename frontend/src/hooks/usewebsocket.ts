import { useEffect, useRef, useState } from "react";
import type { websocketstate } from "../types";

type handlerbundle = {
  on_message?: (event: MessageEvent) => void;
};

export function usewebsocket(url: string | null, handlers: handlerbundle): websocketstate {
  const [state, set_state] = useState<websocketstate>("idle");
  const handlers_ref = useRef<handlerbundle>(handlers);

  useEffect(() => {
    handlers_ref.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!url) {
      set_state("idle");
      return;
    }

    set_state("connecting");
    const socket = new WebSocket(url);

    socket.onopen = () => {
      set_state("open");
    };

    socket.onclose = () => {
      set_state("closed");
    };

    socket.onerror = () => {
      set_state("error");
    };

    socket.onmessage = (event) => {
      handlers_ref.current.on_message?.(event);
    };

    return () => {
      socket.close();
    };
  }, [url]);

  return state;
}

