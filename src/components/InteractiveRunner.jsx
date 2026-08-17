import React, { useEffect, useRef } from "react";

// A Java program running live in the page, with a console you can type into
// while it is still running.
//
// Why this is an embed and not our own runner: the Piston API we use for
// autograding is batch - it takes the whole stdin up front, runs to
// completion, and hands back the output. That cannot work for a program that
// prints a question and waits for the answer, which is most of the interesting
// homework (menus, games, anything with a Scanner loop). Piston does have an
// interactive WebSocket endpoint, but it is explicitly not exposed on the
// public API, so using it would mean hosting and securing our own instance.
// This embed is free, needs no account for the person using it, and no server
// of ours. The tradeoff is real and deliberate: the code is executed by
// OneCompiler rather than by us.
const EMBED_ORIGIN = "https://onecompiler.com";
const EMBED_SRC = `${EMBED_ORIGIN}/embed/java?listenToEvents=true&theme=light`;

export default function InteractiveRunner({
  code,
  fileName = "Main.java",
  height = 560,
  resetKey,
}) {
  const frameRef = useRef(null);

  useEffect(() => {
    if (!code) return;
    const send = () => {
      // Targeted origin rather than "*" - the code being sent is a student's
      // work, and "*" would hand it to whatever origin happened to occupy the
      // frame if the embed ever redirected.
      frameRef.current?.contentWindow?.postMessage(
        {
          eventType: "populateCode",
          language: "java",
          files: [{ name: fileName, content: code }],
        },
        EMBED_ORIGIN
      );
    };

    // The embed sends no "ready" message back, so a single post races its
    // startup and silently lands on nothing when the frame is slow. Retrying
    // for the first few seconds is what makes the code reliably appear. The
    // retries all finish long before anyone could have typed into the frame,
    // so a late one cannot overwrite real edits.
    const timers = [300, 900, 2000, 3500, 5500].map((ms) => setTimeout(send, ms));
    return () => timers.forEach(clearTimeout);
  }, [code, fileName, resetKey]);

  return (
    <iframe
      // Remounting per student guarantees a clean frame: no leftover output
      // from the previous submission, and no process still running from it.
      key={resetKey}
      ref={frameRef}
      title="Run this program"
      src={EMBED_SRC}
      className="w-full bg-white"
      style={{ height, border: 0 }}
    />
  );
}
