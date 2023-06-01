import { IframeCreateOptions, createIframe } from "./iframe-creator";
import { uuidv4 } from "./uuid";

type Methods = { [k: string]: Function };
type FrameConfig = {
  id: string;
  frameOrigin: string;
};

const CONTROLLER_ID = "frame-controller";
const CONTROLLER_MESSAGE = "controller-message";
const CONTROLLER_RESPONSE = "controller-response";
const CONNECT_TYPE = `${CONTROLLER_ID}:connect`;
const CONFIG_TYPE = `${CONTROLLER_ID}:connect:config`;
const METHODS_TYPE = `${CONTROLLER_ID}:connect:methods`;
const CHILD_ID = `${CONTROLLER_ID}:child`;
const PARENT_ID = `${CONTROLLER_ID}:parent`;

const createMethodsFromMessage = async <T>(
  methods: string[],
  config: {
    // the id of the sender, e.g the one that call the function
    senderId: string;
    // the origin of the frame, the one that receive the function call
    frameOrigin: string;
    // the id of the receiver, e.g the one that will receive the function call
    receiverId: string;
    // the source of the message, e.g the window of the receiver
    source?: Window;
  },
  isChild: boolean
) => {
  const functions: Methods = {};

  methods &&
    methods.forEach((method) => {
      const methodName = method.split(":")[1];
      functions[methodName] = async (...args: any[]) => {
        // the response of the function call
        const awaiterResponse = new Promise((resolve) => {
          const onMessage = (event: MessageEvent) => {
            if (
              // the id of the receiver, the one we send message to
              event.data.id === config.receiverId &&
              // the sender which is the outher side
              event.data.sender === (!isChild ? CHILD_ID : PARENT_ID) &&
              // the type of the message, e.g the function we called with a response id
              event.data.type ===
                method.replace(CONTROLLER_MESSAGE, CONTROLLER_RESPONSE) &&
              // the origin of the frame, the one that receive the function call
              event.origin === config.frameOrigin
            ) {
              // resolve the response to the function caller
              resolve(event.data.payload);
              window.removeEventListener("message", onMessage);
            }
          };

          window.addEventListener("message", onMessage);
        });

        // send the function call to the outher side
        config.source?.postMessage(
          {
            id: config.senderId,
            sender: !isChild ? PARENT_ID : CHILD_ID,
            type: method,
            payload: args,
          },
          { targetOrigin: config.frameOrigin }
        );

        return await awaiterResponse;
      };
    });

  return functions as T;
};

const createMessageFromMethods = async (
  methods: Methods,
  config: {
    senderId: string;
    frameOrigin: string;
    receiverId: string;
  },
  isChild: boolean
) => {
  // the methods that will be called from the outher side
  const functions: {
    [k: string]: Function;
  } = {};

  // creates the methods message for the outher side to call and listen
  const messageMethods: string[] = [];

  methods &&
    Object.entries(methods).forEach(([name, method]) => {
      messageMethods.push(`${CONTROLLER_ID}:${name}:${CONTROLLER_MESSAGE}`);
      functions[name] = method;
    });

  const onMessage = async (event: MessageEvent) => {
    if (
      // the id of the sender
      event.data.id === config.senderId &&
      // the sender should be a child e.g iframe
      event.data.sender === (!isChild ? CHILD_ID : PARENT_ID) &&
      // the type of the message should be the same as the method name
      messageMethods.includes(event.data.type) &&
      // the origin of the message should be the same as the frame origin
      event.origin === config.frameOrigin
    ) {
      const methodName = event.data.type.split(":")[1];
      const method = functions[methodName];
      // call the method and get the result
      const result = await method(...event.data.payload);
      // send the result back to the sender
      event.source?.postMessage(
        {
          id: config.receiverId,
          sender: !isChild ? PARENT_ID : CHILD_ID,
          type: event.data.type.replace(
            CONTROLLER_MESSAGE,
            CONTROLLER_RESPONSE
          ),
          payload: result,
        },
        { targetOrigin: config.frameOrigin }
      );
    }
  };

  return { messageMethods, onMessage };
};

const connectToFrame = <T>({
  source,
  id,
  isChild,
  methods,
  remoteOrigin,
}: {
  source: Window;
  id: typeof PARENT_ID | typeof CHILD_ID;
  isChild: boolean;
  methods?: Methods;
  remoteOrigin?: string;
}) => {
  return new Promise<[(event: MessageEvent) => void, T]>(async (resolve) => {
    // the data that will be used to send and receive messages
    const connectionData: {
      config: FrameConfig;
      onMethodMessage: (event: MessageEvent) => void;
      methods: T;
    } = {} as any;

    // the message event listener
    // this will be called when the frame sends 2 messages
    // 1. the config message
    // 2. the methods message
    // after that the listener will be removed
    const onMessage = async (event: MessageEvent) => {
      // check if the message is from the frame we want to connect to
      if (event.data.sender === (!isChild ? CHILD_ID : PARENT_ID)) {
        // check the type of the message, config or methods
        switch (event.data.type) {
          case CONFIG_TYPE:
            {
              const connectionId = event.data.id;
              const connectionOrigin = event.origin;
              const frameConfig = {
                id: connectionId,
                frameOrigin: remoteOrigin || connectionOrigin,
              };

              connectionData["config"] = frameConfig;

              if (isChild) {
                // create the methods that will be called from the outher side
                const { messageMethods, onMessage: onMethodsMessage } =
                  await createMessageFromMethods(
                    methods || {},
                    {
                      senderId: event.data.id,
                      frameOrigin: frameConfig.frameOrigin,
                      receiverId: id,
                    },
                    isChild
                  );

                connectionData["onMethodMessage"] = onMethodsMessage;
                window.addEventListener("message", onMethodsMessage);
                source.postMessage(
                  {
                    id,
                    sender: CHILD_ID,
                    type: METHODS_TYPE,
                    methods: messageMethods,
                  },
                  frameConfig.frameOrigin
                );
              } else {
                source.postMessage(
                  {
                    id,
                    sender: PARENT_ID,
                    type: CONFIG_TYPE,
                  },
                  frameConfig.frameOrigin
                );
              }
            }
            break;
          case METHODS_TYPE:
            {
              if (connectionData.config.frameOrigin !== event.origin) break;
              const methodsMessages = event.data.methods;
              resolve([
                // the method that will be called when a method is called from the outher side
                connectionData.onMethodMessage,
                // create the methods that will be called from the our side to the outher side
                await createMethodsFromMessage<T>(
                  methodsMessages,
                  {
                    senderId: id,
                    frameOrigin: connectionData.config.frameOrigin,
                    receiverId: event.data.id,
                    source,
                  },
                  isChild
                ),
              ]);
              // remove the event listener so we wont get config or methods again
              window.removeEventListener("message", onMessage);
              if (!isChild) {
                const { messageMethods, onMessage: onMethodsMessage } =
                  await createMessageFromMethods(
                    methods || {},
                    {
                      senderId: event.data.id,
                      frameOrigin: event.origin,
                      receiverId: id,
                    },
                    isChild
                  );

                connectionData["onMethodMessage"] = onMethodsMessage;
                window.addEventListener("message", onMethodsMessage);
                source.postMessage(
                  {
                    id,
                    sender: PARENT_ID,
                    type: METHODS_TYPE,
                    methods: messageMethods,
                  },
                  event.origin
                );
              }
            }
            break;
        }
      }
    };

    window.addEventListener("message", onMessage);
    if (isChild) {
      parent.postMessage(
        {
          id,
          sender: CHILD_ID,
          type: CONFIG_TYPE,
        },
        "*"
      );
    }
  });
};

export const connectToChildFrame = async <T>(config: {
  iframeConfig: IframeCreateOptions & { url: string };
  methods?: Methods;
}) => {
  const {
    iframeConfig: { url: frameUrl, ...frameConfig },
  } = config;
  const remoteOrigin = new URL(frameUrl).origin;
  let onIframeLoad: () => void = () => void 0;
  let onIframeLoadFailed: () => void = () => void 0;

  const iframeLoadAwaiter = new Promise<void>((resolve, reject) => {
    onIframeLoad = resolve;
    onIframeLoadFailed = reject;
  });

  // create the iframe
  const childIframe = await createIframe({
    url: frameUrl,
    options: frameConfig,
    onIframeLoad,
    onIframeLoadFailed,
  });

  if (!childIframe.contentWindow)
    throw new Error("The connection to the child failed");

  // // create connection and prepares all data to work with the frame
  const [onMethodsMessage, actions] = await connectToFrame<T>({
    source: childIframe.contentWindow,
    id: uuidv4(),
    isChild: false,
    methods: config.methods,
  });

  await iframeLoadAwaiter;

  // return the actions of the child with system actions
  return {
    ...actions,
    dispose: async () => {
      childIframe.src = "about;blank";
      childIframe.remove();
      window.removeEventListener("message", onMethodsMessage);
    },
  } as T & { dispose: () => Promise<void> };
};

export const connectToParentFrame = async <T>(config: {
  methods?: Methods;
}) => {
  const id = uuidv4();
  // // create connection and prepares all data to work with the frame
  const [, actions] = await connectToFrame<T>({
    source: parent,
    id,
    isChild: true,
    methods: config.methods,
  });

  // TODO: check if child need removeListeners if iframe is removed from dom

  // return the actions of the parent
  return {
    ...actions,
  } as T;
};
