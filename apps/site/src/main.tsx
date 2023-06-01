import * as ReactDOM from "react-dom/client";
import { connectToChildFrame } from "frame-controller";
import { atom, useAtomValue } from "jotai";
import { Suspense, useEffect, useState } from "react";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const childFrame = atom(async () => {
  return await init();
});

const init = async () => {
  const childFrame = await connectToChildFrame<{
    add: (a: number, b: number) => number;
  }>({
    iframeConfig: {
      id: "iframe",
      url: "http://localhost:4220/test2",
      size: {
        width: "500px",
        height: "500px",
      },
    },
    methods: {
      close: () => {
        childFrame.dispose();
      },
    },
  });

  return childFrame;
};

const Component = () => {
  const frame = useAtomValue(childFrame);
  const [firstAdd, setFirstAdd] = useState(0);
  const [secondNumber, setSecondNumber] = useState(0);
  const [result, setResult] = useState(0);

  const onClick = async () => {
    const result = await frame.add(firstAdd || 0, secondNumber || 0);
    setResult(result);
  };

  useEffect(() => {
    onClick();
  }, [firstAdd, secondNumber]);

  return (
    <div>
      <h1>Site</h1>
      <br />
      <input
        type="number"
        onChange={(ev) => setFirstAdd(Number(ev.target.value))}
        placeholder="first number"
      />
      <input
        type="number"
        onChange={(ev) => setSecondNumber(Number(ev.target.value))}
        placeholder="second number"
      />
      Result: {result}
      <br />
    </div>
  );
};

root.render(
  <Suspense fallback={"...loading please wait"}>
    <Component />
  </Suspense>
);
