type IframeOptionsBase = {
  container?: string | HTMLElement;
  id?: string;
  className?: string | string[];
  attributes?: { [k: string]: unknown };
};

export type IframeCreateOptions = IframeOptionsBase &
  (
    | {
        shouldAutoSize: boolean;
      }
    | {
        size: {
          width: string;
          height: string;
        };
      }
  );

export const createIframe = async ({
  url,
  options,
  onIframeLoad,
  onIframeLoadFailed,
}: {
  onIframeLoad?: () => void;
  onIframeLoadFailed?: () => void;
  url: string;
  options: IframeCreateOptions;
}) => {
  const { container, id, className, attributes = [] } = options || {};
  const classList =
    typeof className === "string" ? [className] : [...(className || [])];

  const iframeContainer =
    container &&
    (typeof container === "string"
      ? document.getElementById(container) ||
        document.querySelector<HTMLIFrameElement>(`.${container}`)
      : container instanceof HTMLElement
      ? container
      : null);

  const iframe: HTMLIFrameElement =
    (id && (document.getElementById(id) as HTMLIFrameElement)) ||
    document.createElement("iframe");

  iframe.onload = onIframeLoad || null;
  iframe.onerror = onIframeLoadFailed || null;
  iframe.onabort = onIframeLoadFailed || null;

  if (id) iframe.id = id;

  iframe.classList.add(...classList);

  Object.entries(attributes).forEach(([key, value]) => {
    iframe.setAttribute(key, value as string);
  });

  if ("size" in options) {
    iframe.style.width = options.size.width;
    iframe.style.height = options.size.height;
  }

  iframe.src = url;

  if (iframeContainer) {
    iframeContainer.appendChild(iframe);
  } else {
    document.body.appendChild(iframe);
  }

  return iframe;
};
