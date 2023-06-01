import * as ReactDOM from "react-dom/client";
import { connectToParentFrame } from "frame-controller";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const init = async () => {
  const parent = await connectToParentFrame<{
    close: () => void;
  }>({
    methods: {
      add: (a: number, b: number) => {
        return a + b;
      },
    },
  });

  window.addEventListener("popstate", () => {
    parent.close();
  });

  root.render(
    <div>
      <h1>Iframe</h1>
      <br />
      <button
        onClick={() => {
          window.history.pushState({}, "", "/test3");
        }}
      >
        Push State
      </button>
      <br />
    </div>
  );
};

init();
